import uuid

from django.db import transaction
from django.db.models import Count, DecimalField, ExpressionWrapper, F, Q, Sum
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from tenants.mixins import TenantScopedViewSetMixin
from tenants.permissions import GESTION_STOCK
from tenants.quotas import verifier_quota
from .models import Fournisseur, Categorie, Produit, Sommier, MouvementStock, CommandeFournisseur, LigneCommande
from .serializers import (FournisseurSerializer, CategorieSerializer, ProduitSerializer, ProduitListSerializer,
                          SommierSerializer, MouvementStockSerializer, CommandeFournisseurSerializer,
                          LigneCommandeWriteSerializer)


class CategorieViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    """Gestion des catégories de produits"""
    roles_ecriture = GESTION_STOCK
    queryset = Categorie.objects.filter(actif=True)
    serializer_class = CategorieSerializer
    search_fields = ['nom', 'code', 'description']
    ordering_fields = ['nom', 'created_at']

    @action(detail=False, methods=['get'])
    def avec_stats(self, request):
        """Catégories avec statistiques des produits"""
        categories = self.get_queryset().annotate(
            nb=Count('produits', filter=Q(produits__actif=True)))
        return Response([
            {
                'id': cat.id,
                'nom': cat.nom,
                'code': cat.code,
                'couleur': cat.couleur,
                'icone': cat.icone,
                'nombre_produits': cat.nb,
                'description': cat.description,
            }
            for cat in categories
        ])


class FournisseurViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    roles_lecture = roles_ecriture = GESTION_STOCK
    queryset = Fournisseur.objects.filter(actif=True)
    serializer_class = FournisseurSerializer
    search_fields = ['nom', 'contact', 'pays']


class ProduitViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    roles_ecriture = GESTION_STOCK
    queryset = Produit.objects.filter(actif=True).select_related('fournisseur', 'categorie')
    search_fields = ['nom', 'code', 'code_barres', 'categorie__nom']
    ordering_fields = ['nom', 'categorie__nom', 'stock', 'prix_xof']

    def get_serializer_class(self):
        if self.action == 'list':
            return ProduitListSerializer
        return ProduitSerializer

    def perform_create(self, serializer):
        verifier_quota(self.tenant, 'produits')
        super().perform_create(serializer)

    @action(detail=False, methods=['get'])
    def alertes(self, request):
        """Produits en rupture, critique ou stock bas (catégories exclusives, cf. statut_stock)."""
        qs = self.get_queryset()
        ruptures = qs.filter(stock__lte=0)
        critiques = qs.filter(stock__gt=0, stock__lte=F('stock_min') * 0.5)
        bas = qs.filter(stock__gt=F('stock_min') * 0.5, stock__lte=F('stock_min'))
        ctx = self.get_serializer_context()
        return Response({
            'ruptures': ProduitListSerializer(ruptures, many=True, context=ctx).data,
            'critiques': ProduitListSerializer(critiques, many=True, context=ctx).data,
            'bas': ProduitListSerializer(bas, many=True, context=ctx).data,
        })

    @action(detail=False, methods=['get'])
    def stats(self, request):
        qs = self.get_queryset()
        valeur = qs.annotate(
            valeur_totale=ExpressionWrapper(F('stock') * F('prix_xof'), output_field=DecimalField())
        ).aggregate(total=Sum('valeur_totale'))['total'] or 0

        return Response({
            'total': qs.count(),
            'ruptures': qs.filter(stock__lte=0).count(),
            'en_alerte': qs.filter(stock__lte=F('stock_min')).count(),
            'valeur_stock': valeur,
        })

    @action(detail=False, methods=['get'])
    def par_barcode(self, request):
        barcode = request.query_params.get('code', '').strip()
        produit = self.get_queryset().filter(code_barres=barcode).first() if barcode else None
        if produit is None:
            return Response({'detail': 'Produit non trouvé'}, status=404)
        return Response(ProduitSerializer(produit, context=self.get_serializer_context()).data)


class SommierViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    roles_lecture = roles_ecriture = GESTION_STOCK
    queryset = Sommier.objects.select_related('produit').all()
    serializer_class = SommierSerializer
    search_fields = ['numero', 'reference_djbc', 'produit__nom']
    ordering_fields = ['date_ouverture', 'statut']

    @action(detail=False, methods=['get'])
    def a_apurer(self, request):
        """Sommiers nécessitant un apurement urgent"""
        sommiers = self.get_queryset().filter(statut='en_cours')
        return Response(SommierSerializer(sommiers, many=True, context=self.get_serializer_context()).data)


class MouvementStockViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    roles_lecture = roles_ecriture = GESTION_STOCK
    queryset = MouvementStock.objects.select_related('produit', 'utilisateur', 'sommier').all()
    serializer_class = MouvementStockSerializer
    search_fields = ['produit__nom', 'type_mouvement', 'motif', 'reference']
    ordering_fields = ['date', 'produit__nom', 'type_mouvement']
    http_method_names = ['get', 'post', 'head', 'options']  # Pas de PUT/DELETE

    def perform_create(self, serializer):
        super().perform_create(serializer, utilisateur=self.request.user)


class CommandeFournisseurViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    roles_lecture = roles_ecriture = GESTION_STOCK
    queryset = CommandeFournisseur.objects.select_related('fournisseur').prefetch_related('lignes__produit').all()
    serializer_class = CommandeFournisseurSerializer
    search_fields = ['numero', 'fournisseur__nom', 'statut']
    ordering_fields = ['created_at', 'statut', 'fournisseur__nom']

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        """Création de la commande et de ses lignes en une seule transaction."""
        data = {k: v for k, v in request.data.items() if k != 'lignes'}
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        lignes = LigneCommandeWriteSerializer(data=request.data.get('lignes', []), many=True,
                                              context=self.get_serializer_context())
        lignes.is_valid(raise_exception=True)

        commande = serializer.save(organisation=self.tenant, created_by=request.user,
                                   numero=f"CMD-{uuid.uuid4().hex[:8].upper()}")
        LigneCommande.objects.bulk_create([LigneCommande(commande=commande, **l) for l in lignes.validated_data])
        return Response(self.get_serializer(commande).data, status=201)

    @action(detail=True, methods=['post'])
    def envoyer(self, request, pk=None):
        """Envoyer la commande au fournisseur (brouillon -> envoyee) avec PDF et email"""
        commande = self.get_object()
        if commande.statut != 'brouillon':
            return Response({'detail': 'Seules les commandes en brouillon peuvent être envoyées'}, status=400)

        from .utils import envoyer_commande_email
        email_envoye = envoyer_commande_email(commande)

        commande.statut = 'envoyee'
        commande.save()

        response_data = self.get_serializer(commande).data
        response_data['email_envoye'] = email_envoye
        if email_envoye:
            response_data['message'] = f"Commande {commande.numero} envoyée par email à {commande.fournisseur.email}"
        else:
            response_data['message'] = f"Commande {commande.numero} marquée comme envoyée, mais l'email n'a pas pu être envoyé"
        return Response(response_data)

    @action(detail=True, methods=['get'])
    def pdf(self, request, pk=None):
        """Générer et télécharger le PDF de la commande"""
        commande = self.get_object()
        from .utils import generate_commande_pdf
        response = HttpResponse(generate_commande_pdf(commande), content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="commande_{commande.numero}.pdf"'
        return response

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def recevoir(self, request, pk=None):
        """Transformer la commande en réception et mettre à jour le stock"""
        commande = self.get_queryset().select_for_update(of=('self',)).get(pk=self.get_object().pk)
        if commande.statut != 'envoyee':
            return Response({'detail': 'Seules les commandes envoyées peuvent être reçues'}, status=400)
        commande.statut = 'recue'
        commande.date_reception = timezone.now().date()
        commande.save()
        for ligne in commande.lignes.select_related('produit'):
            MouvementStock.objects.create(
                organisation=commande.organisation,
                produit=ligne.produit,
                type_mouvement='entree',
                quantite=ligne.quantite,
                motif=f"Réception commande {commande.numero}",
                reference=commande.numero,
                utilisateur=request.user,
            )
        return Response({'detail': 'Commande reçue et stock mis à jour'})
