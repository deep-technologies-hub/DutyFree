"""
Paiement en ligne des factures d'abonnement.

Prestataires (variable PAYMENT_PROVIDER) :
- simulateur : page de paiement locale (Mobile Money / carte simulés), pour tester sans Internet.
- cinetpay   : Orange Money, Moov, Wave, MTN, cartes — zone UEMOA (XOF).

Principe de sécurité : on ne fait jamais confiance au navigateur ni au contenu d'une
notification. Le statut d'un paiement est toujours revérifié auprès du prestataire
(`verifier`) avant d'encaisser, et l'encaissement est idempotent.
"""
import json
import logging
import uuid
from urllib import request as urlrequest

from django.conf import settings
from django.core import signing
from django.db import transaction
from django.urls import reverse

from .models import Facture, PaiementEvenement

logger = logging.getLogger(__name__)

PAYEE, ECHEC, EN_ATTENTE = 'payee', 'echec', 'en_attente'


class PaiementIndisponible(Exception):
    pass


def url_publique(path):
    return settings.PUBLIC_URL.rstrip('/') + path


class Prestataire:
    code = ''

    def initier(self, facture):
        """Renvoie l'URL de la page de paiement vers laquelle rediriger le client."""
        raise NotImplementedError

    def verifier(self, facture):
        """Interroge le prestataire. Renvoie (statut, reference, details)."""
        raise NotImplementedError

    def transaction_depuis_notification(self, request):
        """Identifiant de transaction contenu dans une notification (webhook)."""
        raise NotImplementedError


class Simulateur(Prestataire):
    """Paiement fictif servi par le backend : uniquement pour le développement et les démos."""
    code = 'simulateur'
    SALT = 'paiement-simulateur'

    def initier(self, facture):
        jeton = signing.dumps({'f': facture.pk, 't': facture.transaction_id}, salt=self.SALT)
        return url_publique(reverse('saas-simulateur', args=[jeton]))

    def verifier(self, facture):
        # Le simulateur encaisse directement depuis sa page (voir SimulateurView).
        return (PAYEE if facture.statut == 'payee' else EN_ATTENTE), facture.reference_paiement, {}

    def transaction_depuis_notification(self, request):
        return None

    @classmethod
    def lire_jeton(cls, jeton):
        return signing.loads(jeton, salt=cls.SALT, max_age=3600)


class CinetPay(Prestataire):
    code = 'cinetpay'
    API = 'https://api-checkout.cinetpay.com/v2'

    def _post(self, path, payload):
        data = json.dumps(payload).encode()
        req = urlrequest.Request(f"{self.API}{path}", data=data,
                                 headers={'Content-Type': 'application/json', 'User-Agent': 'DutyFreeManager'})
        try:
            with urlrequest.urlopen(req, timeout=15) as resp:
                return json.loads(resp.read().decode())
        except Exception as exc:
            logger.exception("Appel CinetPay %s impossible", path)
            raise PaiementIndisponible("Le service de paiement est momentanément indisponible.") from exc

    def _identifiants(self):
        if not (settings.CINETPAY_API_KEY and settings.CINETPAY_SITE_ID):
            raise PaiementIndisponible("CinetPay n'est pas configuré (CINETPAY_API_KEY / CINETPAY_SITE_ID).")
        return {'apikey': settings.CINETPAY_API_KEY, 'site_id': settings.CINETPAY_SITE_ID}

    def initier(self, facture):
        org = facture.organisation
        res = self._post('/payment', {
            **self._identifiants(),
            'transaction_id': facture.transaction_id,
            'amount': int(facture.montant_xof),
            'currency': 'XOF',
            'description': f"Abonnement {facture.plan.nom} {facture.mois} mois - {facture.numero}",
            'notify_url': url_publique(reverse('saas-webhook', args=[self.code])),
            'return_url': url_publique(reverse('saas-retour', args=[facture.transaction_id])),
            'channels': 'ALL',
            'lang': 'fr',
            'customer_name': org.nom[:100],
            'customer_email': org.email,
            'metadata': facture.numero,
        })
        url = (res.get('data') or {}).get('payment_url')
        if str(res.get('code')) != '201' or not url:
            logger.error("Initialisation CinetPay refusée : %s", res)
            raise PaiementIndisponible(res.get('description') or res.get('message') or 'Paiement refusé par le prestataire.')
        return url

    def verifier(self, facture):
        res = self._post('/payment/check', {**self._identifiants(), 'transaction_id': facture.transaction_id})
        data = res.get('data') or {}
        statut = data.get('status')
        if statut == 'ACCEPTED':
            # Contrôle anti-fraude : le montant payé doit correspondre exactement à la facture.
            if int(float(data.get('amount', 0))) != int(facture.montant_xof) or data.get('currency') != 'XOF':
                logger.error("Montant CinetPay incohérent pour %s : %s", facture.numero, data)
                return ECHEC, '', res
            return PAYEE, data.get('operator_id') or data.get('payment_method') or '', res
        if statut in ('REFUSED', 'CANCELED', 'CANCELLED'):
            return ECHEC, '', res
        return EN_ATTENTE, '', res

    def transaction_depuis_notification(self, request):
        return request.POST.get('cpm_trans_id') or request.data.get('cpm_trans_id')


PRESTATAIRES = {p.code: p for p in (Simulateur, CinetPay)}


def prestataire(code=None):
    code = code or settings.PAYMENT_PROVIDER
    if code not in PRESTATAIRES:
        raise PaiementIndisponible(f"Prestataire de paiement inconnu : {code}")
    if code == 'simulateur' and not settings.PAYMENT_SIMULATEUR_AUTORISE:
        raise PaiementIndisponible("Le simulateur de paiement est désactivé sur ce serveur.")
    return PRESTATAIRES[code]()


def demarrer_paiement(facture):
    """Prépare la facture et renvoie l'URL de paiement."""
    if facture.statut != 'en_attente':
        raise PaiementIndisponible("Cette facture n'est plus payable.")
    p = prestataire()
    # Nouvelle transaction à chaque tentative : un identifiant déjà refusé n'est jamais réutilisé.
    facture.prestataire = p.code
    facture.transaction_id = f"{facture.numero}-{uuid.uuid4().hex[:8].upper()}"
    facture.save(update_fields=['prestataire', 'transaction_id'])
    url = p.initier(facture)
    PaiementEvenement.objects.create(facture=facture, prestataire=p.code, type='initiation',
                                     statut=EN_ATTENTE, details={'url': url})
    return url


def enregistrer_resultat(facture, statut, reference='', details=None, type_evt='verification', methode='mobile_money'):
    """Point unique d'encaissement (webhook, retour navigateur, simulateur). Idempotent."""
    with transaction.atomic():
        facture = Facture.objects.select_for_update().get(pk=facture.pk)
        PaiementEvenement.objects.create(facture=facture, prestataire=facture.prestataire or '',
                                         type=type_evt, statut=statut, details=details or {})
        if statut != PAYEE or facture.statut == 'payee':
            return facture
        if facture.statut == 'annulee':
            # Paiement reçu sur une facture annulée : on encaisse quand même (le client a payé).
            logger.warning("Paiement reçu sur la facture annulée %s", facture.numero)
            facture.statut = 'en_attente'
        facture.marquer_payee(methode=methode, reference=reference)

    from .emails import envoyer_recu
    transaction.on_commit(lambda: envoyer_recu(facture))
    return facture


def verifier_et_enregistrer(facture, type_evt='verification'):
    if not facture.prestataire or facture.statut != 'en_attente':
        return facture
    statut, reference, details = prestataire(facture.prestataire).verifier(facture)
    return enregistrer_resultat(facture, statut, reference, details, type_evt)
