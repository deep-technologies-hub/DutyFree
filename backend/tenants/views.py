import logging

from django.conf import settings
from django.db import connection
from django.http import HttpResponse, HttpResponseRedirect
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.utils.html import escape
from django.views import View
from django.views.decorators.csrf import csrf_exempt
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .models import Facture, Plan
from .permissions import HasTenant, IsTenantAdmin, IsTenantAdminOrReadOnly
from .serializers import (FactureSerializer, InscriptionSerializer, OrganisationSerializer,
                          PlanSerializer, SouscriptionSerializer)
from .services import creer_organisation
from . import paiements
from .emails import envoyer_bienvenue, envoyer_facture

logger = logging.getLogger(__name__)


class HealthView(APIView):
    """Sonde de disponibilité (load balancer / Docker healthcheck)."""
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def get(self, request):
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
        return Response({'status': 'ok'})


class PlanViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Plan.objects.filter(actif=True)
    serializer_class = PlanSerializer
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    pagination_class = None


class InscriptionView(APIView):
    """Création self-service d'une organisation + compte administrateur (essai gratuit)."""
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'inscription'

    def post(self, request):
        ser = InscriptionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        org, user = creer_organisation(
            nom=d['nom_organisation'],
            slug=d.get('slug') or None,
            email=d['email'],
            telephone=d.get('telephone', ''),
            pays=d.get('pays') or 'Burkina Faso',
            plan=d['plan'],
            admin={
                'username': d['admin_username'],
                'password': d['admin_password'],
                'first_name': d.get('admin_first_name', ''),
                'last_name': d.get('admin_last_name', ''),
                'email': d['email'],
            },
        )
        from utilisateurs.serializers import tokens_pour
        envoyer_bienvenue(org, user)
        return Response({
            'organisation': OrganisationSerializer(org).data,
            **tokens_pour(user),
        }, status=status.HTTP_201_CREATED)


class OrganisationView(APIView):
    """Organisation courante : GET pour tous, PATCH réservé aux admins. Jamais bloqué par l'abonnement."""
    permission_classes = [permissions.IsAuthenticated, HasTenant, IsTenantAdminOrReadOnly]

    def get(self, request):
        return Response(OrganisationSerializer(request.user.organisation).data)

    def patch(self, request):
        ser = OrganisationSerializer(request.user.organisation, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)


class FactureViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """
    Factures d'abonnement de l'organisation. Accessibles même si l'abonnement
    a expiré, afin de pouvoir le renouveler.
    """
    serializer_class = FactureSerializer
    permission_classes = [permissions.IsAuthenticated, HasTenant, IsTenantAdmin]

    def get_queryset(self):
        return Facture.objects.filter(organisation=self.request.user.organisation).select_related('plan')

    @action(detail=False, methods=['post'])
    def souscrire(self, request):
        """Crée une facture en attente pour (re)nouveler ou changer de plan."""
        ser = SouscriptionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        plan, mois = ser.validated_data['plan'], int(ser.validated_data['mois'])
        org = request.user.organisation
        # Une seule facture en attente à la fois : la précédente est remplacée.
        org.factures.filter(statut='en_attente').update(statut='annulee')
        facture = Facture.objects.create(
            organisation=org, plan=plan, mois=mois,
            montant_xof=plan.prix_mensuel_xof * mois,
        )
        envoyer_facture(facture)
        return Response({
            'facture': FactureSerializer(facture).data,
            'instructions': settings.SAAS_PAYMENT_INSTRUCTIONS,
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def payer(self, request, pk=None):
        """Démarre un paiement en ligne et renvoie l'URL de la page de paiement."""
        facture = self.get_object()
        try:
            url = paiements.demarrer_paiement(facture)
        except paiements.PaiementIndisponible as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response({'url': url, 'prestataire': facture.prestataire})

    @action(detail=True, methods=['post'])
    def verifier(self, request, pk=None):
        """Revérifie le statut auprès du prestataire (utile si la notification tarde)."""
        facture = self.get_object()
        try:
            facture = paiements.verifier_et_enregistrer(facture)
        except paiements.PaiementIndisponible as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response(FactureSerializer(facture).data)


class WebhookPaiementView(APIView):
    """
    Notification serveur-à-serveur du prestataire. Son contenu n'est pas cru sur parole :
    on revérifie la transaction auprès du prestataire avant d'encaisser.
    """
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def get(self, request, code):
        return Response({'status': 'ok'})  # Certains prestataires testent l'URL en GET

    def post(self, request, code):
        try:
            p = paiements.prestataire(code)
        except paiements.PaiementIndisponible:
            return Response(status=status.HTTP_404_NOT_FOUND)
        transaction_id = p.transaction_depuis_notification(request)
        facture = (Facture.objects.filter(transaction_id=transaction_id, prestataire=code).first()
                   if transaction_id else None)
        if facture is None:
            logger.warning("Notification %s pour une transaction inconnue : %s", code, transaction_id)
            return Response(status=status.HTTP_200_OK)
        try:
            paiements.verifier_et_enregistrer(facture, type_evt='webhook')
        except paiements.PaiementIndisponible:
            return Response(status=status.HTTP_503_SERVICE_UNAVAILABLE)  # le prestataire réessaiera
        return Response({'status': 'ok'})


@method_decorator(csrf_exempt, name='dispatch')
class RetourPaiementView(View):
    """Retour du client après paiement (GET ou POST selon le prestataire) → backoffice."""

    def dispatch(self, request, transaction_id):
        facture = get_object_or_404(Facture, transaction_id=transaction_id)
        try:
            facture = paiements.verifier_et_enregistrer(facture, type_evt='retour')
        except paiements.PaiementIndisponible:
            pass  # la notification serveur prendra le relais
        return HttpResponseRedirect(
            f"{settings.FRONTEND_URL}/abonnement?facture={facture.pk}&paiement={facture.statut}")


SIMULATEUR_HTML = """<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Paiement - simulateur</title>
<style>body{font-family:system-ui,sans-serif;background:#F0F4F9;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px}
.c{background:#fff;border-radius:14px;box-shadow:0 8px 30px rgba(15,23,42,.08);padding:28px;max-width:400px;width:100%}
.t{font-size:12px;color:#64748B;text-transform:uppercase;letter-spacing:.12em}.m{font-size:30px;font-weight:700;margin:6px 0 2px}
.b{display:block;width:100%;padding:13px;border:0;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;margin-top:10px}
.om{background:#1E3A8A;color:#fff}.cb{background:#0F172A;color:#fff}.ko{background:#E8EEF4;color:#DC2626}
.w{background:#FEF3C7;color:#92400E;font-size:12px;padding:8px 10px;border-radius:6px;margin-bottom:16px}</style></head>
<body><form class="c" method="post">
<div class="w">Mode test : aucun argent n'est débité.</div>
<div class="t">__ORG__ · __NUMERO__</div>
<div class="m">__MONTANT__ XOF</div>
<div style="color:#334155;font-size:14px;margin-bottom:14px">Abonnement __PLAN__ — __MOIS__ mois</div>
<button class="b om" name="choix" value="mobile_money">Payer avec Mobile Money</button>
<button class="b cb" name="choix" value="carte">Payer par carte</button>
<button class="b ko" name="choix" value="echec">Simuler un refus</button>
</form></body></html>"""


@method_decorator(csrf_exempt, name='dispatch')
class SimulateurPaiementView(View):
    """Page de paiement fictive (PAYMENT_PROVIDER=simulateur). Le lien signé expire après 1 h."""

    def _facture(self, jeton):
        try:
            data = paiements.Simulateur.lire_jeton(jeton)
        except Exception:
            return None
        return (Facture.objects.filter(pk=data['f'], transaction_id=data['t'])
                .select_related('organisation', 'plan').first())

    def get(self, request, jeton):
        if not settings.PAYMENT_SIMULATEUR_AUTORISE:
            return HttpResponse(status=404)
        facture = self._facture(jeton)
        if facture is None:
            return HttpResponse("Lien de paiement invalide ou expiré.", status=400)
        html = (SIMULATEUR_HTML
                .replace('__ORG__', escape(facture.organisation.nom))
                .replace('__NUMERO__', escape(facture.numero))
                .replace('__MONTANT__', f"{int(facture.montant_xof):,}".replace(',', ' '))
                .replace('__PLAN__', escape(facture.plan.nom))
                .replace('__MOIS__', str(facture.mois)))
        return HttpResponse(html)

    def post(self, request, jeton):
        if not settings.PAYMENT_SIMULATEUR_AUTORISE:
            return HttpResponse(status=404)
        facture = self._facture(jeton)
        if facture is None:
            return HttpResponse("Lien de paiement invalide ou expiré.", status=400)
        choix = request.POST.get('choix')
        if choix in ('mobile_money', 'carte'):
            paiements.enregistrer_resultat(facture, paiements.PAYEE, reference=f"SIM-{facture.transaction_id}",
                                           details={'choix': choix}, type_evt='simulateur', methode=choix)
        else:
            paiements.enregistrer_resultat(facture, paiements.ECHEC, details={'choix': 'echec'}, type_evt='simulateur')
        return HttpResponseRedirect(paiements.url_publique(f"/api/saas/paiements/retour/{facture.transaction_id}/"))
