"""
Emails transactionnels de la plateforme.
Envoi dans un thread pour ne pas ajouter la latence SMTP aux requêtes API.
En local (Docker), ils arrivent dans Mailpit : http://localhost:8025
"""
import logging
import threading

from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger(__name__)


def _fmt(montant):
    return f"{int(montant):,}".replace(',', ' ')


def _envoyer(sujet, corps, destinataires):
    destinataires = [d for d in destinataires if d]
    if not destinataires:
        return

    def run():
        try:
            send_mail(f"[{settings.SAAS_NOM}] {sujet}", corps, settings.DEFAULT_FROM_EMAIL, destinataires)
        except Exception:
            logger.exception("Échec d'envoi de l'email « %s »", sujet)

    if settings.EMAIL_ASYNC:
        # Thread non « daemon » : une commande (cron) attend la fin des envois avant de quitter.
        threading.Thread(target=run, daemon=False).start()
    else:
        run()


def _admins(organisation):
    emails = list(organisation.utilisateurs.filter(role='admin', is_active=True)
                  .exclude(email='').values_list('email', flat=True))
    return emails or [organisation.email]


def envoyer_bienvenue(organisation, admin):
    _envoyer("Bienvenue — votre espace est prêt", f"""Bonjour {admin.first_name or admin.username},

Votre boutique « {organisation.nom} » est créée. Votre essai gratuit se termine le {organisation.essai_fin:%d/%m/%Y}.

  Code entreprise : {organisation.slug}
  Identifiant     : {admin.username}

  Backoffice : {settings.FRONTEND_URL}
  Caisse     : {settings.CAISSE_URL}
  Stock      : {settings.STOCK_URL}

Prochaines étapes : ajoutez vos produits, créez vos caissiers (avec leur PIN), puis ouvrez la caisse.

L'équipe {settings.SAAS_NOM}
""", [organisation.email, admin.email])


def envoyer_facture(facture, rappel=False):
    org = facture.organisation
    sujet = (f"Renouvellement de votre abonnement — facture {facture.numero}" if rappel
             else f"Facture {facture.numero}")
    echeance = f"\nVotre abonnement arrive à échéance le {org.date_fin:%d/%m/%Y}." if rappel and org.date_fin else ''
    _envoyer(sujet, f"""Bonjour,
{echeance}
Facture {facture.numero} : abonnement {facture.plan.nom}, {facture.mois} mois — {_fmt(facture.montant_xof)} XOF.

Payez en ligne (Mobile Money ou carte) depuis votre backoffice :
  {settings.FRONTEND_URL}/abonnement

L'équipe {settings.SAAS_NOM}
""", _admins(org))


def envoyer_recu(facture):
    org = facture.organisation
    _envoyer(f"Paiement reçu — facture {facture.numero}", f"""Bonjour,

Nous avons bien reçu votre paiement de {_fmt(facture.montant_xof)} XOF (facture {facture.numero}).
Référence : {facture.reference_paiement or '—'}

Abonnement {facture.plan.nom} actif jusqu'au {facture.periode_fin:%d/%m/%Y}.

Merci de votre confiance.
L'équipe {settings.SAAS_NOM}
""", _admins(org))


def envoyer_reinitialisation(user, lien):
    _envoyer("Réinitialisation de votre mot de passe", f"""Bonjour {user.first_name or user.username},

Une réinitialisation du mot de passe a été demandée pour votre compte « {user.username} »
(code entreprise : {user.organisation.slug}).

Choisissez un nouveau mot de passe (lien valable {settings.PASSWORD_RESET_TIMEOUT // 3600} h) :
  {lien}

Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.

L'équipe {settings.SAAS_NOM}
""", [user.email])
