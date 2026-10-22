from django.db import transaction
from django.db.models import Count, Sum
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from configuration.models import Configuration
from tenants.mixins import TenantScopedViewSetMixin
from .models import CarteFidelite, MouvementFidelite, generer_numero_carte
from .serializers import CarteFideliteSerializer, CarteFideliteListSerializer


class CarteFideliteViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    queryset = CarteFidelite.objects.all()
    search_fields = ['numero', 'nom', 'prenom', 'email', 'telephone']
    ordering_fields = ['points', 'niveau', 'date_inscription', 'nom']

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
        montant_xof = float(request.data.get('montant_xof', 0))
        if montant_xof <= 0:
            return Response({'error': 'Montant invalide'}, status=400)
        reference = request.data.get('reference', '')

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

    @action(detail=True, methods=['post'], url_path='utiliser_points')
    @transaction.atomic
    def utiliser_points(self, request, pk=None):
        carte = self._carte_verrouillee()
        cfg = Configuration.get(self.tenant)
        points_a_utiliser = float(request.data.get('points', 0))

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
