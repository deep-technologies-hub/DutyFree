"""
Cycle de facturation mensuel, à exécuter chaque jour (service `scheduler` en Docker) :
  python manage.py taches_quotidiennes

1. Passe en « expiré » les organisations dont l'essai/abonnement (+ grâce) est échu.
2. À J-SAAS_RAPPEL_JOURS de l'échéance, crée la facture de renouvellement (plan actuel, 1 mois)
   et l'envoie aux administrateurs.
3. Relance tous les 3 jours les factures de renouvellement impayées.
"""
from datetime import timedelta

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.db.models import Q
from django.utils import timezone

from tenants.emails import envoyer_facture
from tenants.models import Facture, Organisation

INTERVALLE_RELANCE = timedelta(days=3)


class Command(BaseCommand):
    help = "Expiration, facturation des renouvellements et relances."

    def handle(self, *args, **options):
        call_command('expirer_abonnements', stdout=self.stdout)
        maintenant = timezone.now()
        limite = maintenant + timedelta(days=settings.SAAS_RAPPEL_JOURS)
        creees = relancees = 0

        a_renouveler = Organisation.objects.filter(
            Q(statut='essai', essai_fin__lte=limite) | Q(statut__in=['actif', 'expire'], periode_fin__lte=limite)
        ).select_related('plan')

        for org in a_renouveler:
            facture = org.factures.filter(statut='en_attente').order_by('-created_at').first()
            if facture is None:
                facture = Facture.objects.create(organisation=org, plan=org.plan, mois=1,
                                                 montant_xof=org.plan.prix_mensuel_xof)
                creees += 1
            elif facture.rappel_envoye_le and maintenant - facture.rappel_envoye_le < INTERVALLE_RELANCE:
                continue
            else:
                relancees += 1
            envoyer_facture(facture, rappel=True)
            facture.rappel_envoye_le = maintenant
            facture.save(update_fields=['rappel_envoye_le'])

        self.stdout.write(self.style.SUCCESS(
            f"{creees} facture(s) de renouvellement créée(s), {relancees} relance(s) envoyée(s)."))
