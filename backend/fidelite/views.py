from django.db import transaction
from django.db.models import Count, Sum
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from configuration.models import Configuration
from rest_framework.exceptions import ValidationError
from tenants.mixins import TenantScopedViewSetMixin
from tenants.permissions import CAISSIER, GESTION
from .models import CarteFidelite, MouvementFidelite, generer_numero_carte
from .serializers import CarteFideliteSerializer, CarteFideliteListSerializer


class CarteFideliteViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    queryset = CarteFidelite.objects.all()
    search_fields = ['numero', 'nom', 'prenom', 'email', 'telephone']
    ordering_fields = ['points', 'niveau', 'date_inscription', 'nom']
    # Fichier clients et ajustements : gestion. En caisse : recherche, inscription, gain sur une vente.
    roles_lecture = roles_ecriture = GESTION
    roles_actions = {
        'par_numero': GESTION + (CAISSIER,), 'create': GESTION + (CAISSIER,),
        'ajouter_points': GESTION + (CAISSIER,),
    }

    def get_serializer_class(self):
        if self.action == 'list':
            return CarteFideliteListSerializer
        return CarteFideliteSerializer

    def perform_create(self, serializer):
        super().perform_create(serializer, numero=generer_numero_carte(self.tenant.id))

    @action(detail=False, methods=['get'], url_path='par_numero')
    def par_numero(self, request):
        numero = request.query_params.get('numero', '').strip().upper()
        if not numero:
            return Response({'error': 'Paramètre numero requis'}, status=400)
        try:
            carte = self.get_queryset().get(numero=numero, actif=True)
            return Response(CarteFideliteSerializer(carte).data)
        except CarteFidelite.DoesNotExist:
            return Response({'error': 'Carte non trouvée'}, status=404)

    def _carte_verrouillee(self):
        return self.get_queryset().select_for_update().get(pk=self.get_object().pk)

    @action(detail=True, methods=['post'], url_path='ajouter_points')
    @transaction.atomic
    def ajouter_points(self, request, pk=None):
        carte = self._carte_verrouillee()
        cfg = Configuration.get(self.tenant)
        reference = str(request.data.get('reference', '')).strip()
        if request.user.role == CAISSIER or reference:
            # Les points se gagnent sur une vente réelle, une seule fois : le montant est celui
            # de la vente enregistrée, pas celui envoyé par le poste de caisse.
            montant_xof = self._montant_vente(reference)
        else:
            try:
                montant_xof = float(request.data.get('montant_xof', 0))
            except (TypeError, ValueError):
                montant_xof = 0
        if montant_xof <= 0:
            return Response({'error': 'Montant invalide'}, status=400)

        points_gagnes = round(montant_xof * float(cfg.points_par_xof), 2)
        solde_avant = float(carte.points)
        carte.points = round(float(carte.points) + points_gagnes, 2)
        carte.derniere_visite = timezone.now()
        carte.update_niveau()
        carte.save()

        MouvementFidelite.objects.create(
            carte=carte,
            type_mouvement='gain',
            points=points_gagnes,
            solde_avant=solde_avant,
            solde_apres=float(carte.points),
            reference_vente=reference,
            montant_achat_xof=montant_xof,
            operateur=request.user,
        )
        return Response({'points_gagnes': points_gagnes, 'nouveau_solde': float(carte.points), 'niveau': carte.niveau})

    def _montant_vente(self, reference):
        from ventes.models import Vente
        if not reference:
            raise ValidationError({'reference': 'Numéro de ticket requis pour créditer des points.'})
        vente = Vente.objects.filter(organisation=self.tenant, numero_ticket=reference, statut='payee').first()
        if vente is None:
            raise ValidationError({'reference': "Vente introuvable : elle n'est peut-être pas encore synchronisée."})
        if MouvementFidelite.objects.filter(carte__organisation=self.tenant, type_mouvement='gain',
                                            reference_vente=reference).exists():
            raise ValidationError({'reference': 'Des points ont déjà été crédités pour cette vente.'})
        return float(sum(p.montant_xof - p.monnaie_rendue for p in vente.paiements.all()))

    @action(detail=True, methods=['post'], url_path='utiliser_points')
    @transaction.atomic
    def utiliser_points(self, request, pk=None):
        carte = self._carte_verrouillee()
        cfg = Configuration.get(self.tenant)
        try:
            points_a_utiliser = float(request.data.get('points', 0))
        except (TypeError, ValueError):
            points_a_utiliser = 0

        if points_a_utiliser <= 0:
            return Response({'error': 'Nombre de points invalide'}, status=400)
        if points_a_utiliser > float(carte.points):
            return Response({'error': 'Solde insuffisant'}, status=400)

        valeur_xof = round(points_a_utiliser * float(cfg.valeur_point_xof), 2)
        solde_avant = float(carte.points)
        carte.points = round(float(carte.points) - points_a_utiliser, 2)
        carte.save()

        MouvementFidelite.objects.create(
            carte=carte,
            type_mouvement='utilisation',
            points=-points_a_utiliser,
            solde_avant=solde_avant,
            solde_apres=float(carte.points),
            operateur=request.user,
        )
        return Response({'points_utilises': points_a_utiliser, 'valeur_xof': valeur_xof, 'nouveau_solde': float(carte.points)})

    @action(detail=False, methods=['get'], url_path='statistiques')
    def statistiques(self, request):
        actives = self.get_queryset().filter(actif=True)
        total = actives.count()
        par_niveau = dict(actives.order_by().values_list('niveau').annotate(n=Count('id')))
        by_niveau = {niveau: par_niveau.get(niveau, 0) for niveau in ('bronze', 'silver', 'gold')}
        total_points = actives.aggregate(Sum('points'))['points__sum'] or 0
        return Response({'total_cartes': total, 'by_niveau': by_niveau, 'total_points_en_circulation': float(total_points)})
