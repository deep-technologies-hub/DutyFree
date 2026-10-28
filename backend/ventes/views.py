from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Sum, Count, Avg, F
from django.db.models.functions import TruncDate, TruncMonth
from django.utils import timezone
from datetime import timedelta
from tenants.mixins import TenantScopedViewSetMixin
from .models import Vente, DonneesPassagers
from .serializers import (VenteSerializer, VenteListSerializer, VenteCreateSerializer,
                           DonneesPassagersSerializer)

class VenteViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    queryset = Vente.objects.select_related('caissier').prefetch_related('lignes__produit', 'paiements').all()
    search_fields = ['numero_ticket', 'caissier__first_name', 'caissier__last_name',
                     'passager_nom', 'vol_reference', 'destination']
    ordering_fields = ['date_locale', 'total', 'caissier__last_name']

    def get_queryset(self):
        qs = super().get_queryset()
        if self.action != 'list':
            return qs
        p = self.request.query_params
        if p.get('date_debut'):
            qs = qs.filter(date_locale__date__gte=p['date_debut'])
        if p.get('date_fin'):
            qs = qs.filter(date_locale__date__lte=p['date_fin'])
        if p.get('numero_caisse'):
            qs = qs.filter(numero_caisse=p['numero_caisse'])
        if p.get('methode'):
            qs = qs.filter(paiements__methode=p['methode']).distinct()
        if p.get('statut'):
            qs = qs.filter(statut=p['statut'])
        return qs

    @action(detail=False, methods=['get'])
    def caisses(self, request):
        """Numéros de caisse ayant enregistré des ventes (filtres du backoffice)."""
        numeros = (self.get_queryset().exclude(numero_caisse='')
                   .values_list('numero_caisse', flat=True).distinct().order_by('numero_caisse'))
        return Response(list(numeros))

    def get_serializer_class(self):
        if self.action == 'create':
            return VenteCreateSerializer
        if self.action == 'list':
            return VenteListSerializer
        return VenteSerializer

    def perform_create(self, serializer):
        super().perform_create(serializer, caissier=self.request.user)

    @action(detail=False, methods=['post'])
    def sync_offline(self, request):
        """Synchronisation des ventes offline — batch"""
        ventes_data = request.data.get('ventes', [])
        synced, errors = [], []
        ctx = self.get_serializer_context()
        for v in ventes_data:
            ticket = v.get('numero_ticket')
            try:
                # Éviter les doublons (idempotence de la resynchronisation)
                if self.get_queryset().filter(numero_ticket=ticket).exists():
                    synced.append(ticket)
                    continue
                ser = VenteCreateSerializer(data={**v, 'synced': True}, context=ctx)
                if ser.is_valid():
                    ser.save(organisation=self.tenant, caissier=request.user)
                    synced.append(ticket)
                else:
                    errors.append({'ticket': ticket, 'errors': ser.errors})
            except Exception as e:
                errors.append({'ticket': ticket, 'error': str(e)})
        return Response({'synced': len(synced), 'errors': errors, 'tickets': synced})

    @action(detail=False, methods=['get'])
    def dashboard(self, request):
        """KPIs pour le backoffice — vue d'ensemble"""
        today = timezone.now().date()
        month_start = today.replace(day=1)

        ventes = self.get_queryset().filter(statut='payee')
        qs_month = ventes.filter(date_locale__date__gte=month_start)
        qs_today = ventes.filter(date_locale__date=today)

        ca_month = qs_month.aggregate(total=Sum('total'))['total'] or 0
        ca_today = qs_today.aggregate(total=Sum('total'))['total'] or 0
        tickets_month = qs_month.count()
        tickets_today = qs_today.count()
        ticket_moyen = qs_month.aggregate(avg=Avg('total'))['avg'] or 0

        # CA journalier 30j
        thirty_days_ago = today - timedelta(days=30)
        ca_daily = list(
            ventes.filter(date_locale__date__gte=thirty_days_ago)
            .annotate(jour=TruncDate('date_locale'))
            .values('jour')
            .annotate(ca=Sum('total'), tickets=Count('id'))
            .order_by('jour')
        )

        # CA par catégorie (clé conservée pour le frontend : contient le nom de la catégorie)
        ca_by_cat = [
            {'lignes__produit__categorie': row['lignes__produit__categorie__nom'] or 'Sans catégorie',
             'ca': row['ca'], 'tickets': row['tickets']}
            for row in qs_month.values('lignes__produit__categorie__nom')
            .annotate(ca=Sum('lignes__total'), tickets=Count('id', distinct=True))
            .order_by('-ca')
            if row['ca'] is not None
        ]

        # Par caissier
        ca_by_cashier = list(
            qs_month.values('caissier__first_name', 'caissier__last_name', 'numero_caisse')
            .annotate(ca=Sum('total'), tickets=Count('id'))
            .order_by('-ca')
        )

        # CA par moyen de paiement
        ca_by_payment = list(
            qs_month.values('paiements__methode')
            # Montant encaissé net : la monnaie rendue sur les espèces n'est pas du CA
            .annotate(amount=Sum(F('paiements__montant_xof') - F('paiements__monnaie_rendue')))
            .order_by('-amount')
        )
        
        # Filtre les paiements non nuls
        ca_by_payment = [p for p in ca_by_payment if p['paiements__methode'] is not None]

        return Response({
            'ca_month': ca_month,
            'ca_today': ca_today,
            'tickets_month': tickets_month,
            'tickets_today': tickets_today,
            'ticket_moyen': ticket_moyen,
            'ca_daily': ca_daily,
            'ca_by_categorie': ca_by_cat,
            'ca_by_cashier': ca_by_cashier,
            'ca_by_payment': ca_by_payment,
        })

    @action(detail=False, methods=['get'])
    def taux_capture(self, request):
        """Taux de capture mensuel = tickets / passagers"""
        results = []
        for dp in DonneesPassagers.objects.filter(organisation=self.tenant).order_by('-annee', '-mois'):
            tickets = self.get_queryset().filter(
                date_locale__year=dp.annee,
                date_locale__month=dp.mois,
                statut='payee'
            ).count()
            taux = round((tickets / dp.nombre_passagers) * 100, 2) if dp.nombre_passagers else 0
            results.append({
                'id': dp.id, 'annee': dp.annee, 'mois': dp.mois,
                'source': dp.source, 'notes': dp.notes,
                'passagers': dp.nombre_passagers,
                'tickets': tickets, 'taux': taux,
            })
        return Response(results)


class DonneesPassagersViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    queryset = DonneesPassagers.objects.all()
    serializer_class = DonneesPassagersSerializer

    def perform_create(self, serializer):
        super().perform_create(serializer, saisie_par=self.request.user)
