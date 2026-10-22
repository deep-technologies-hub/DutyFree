"""
Met à jour le statut des organisations dont l'essai ou l'abonnement est terminé.
À planifier quotidiennement (cron) : python manage.py expirer_abonnements
"""
from django.core.management.base import BaseCommand

from tenants.models import Organisation


class Command(BaseCommand):
    help = "Passe en 'expire' les organisations dont l'essai/abonnement (+ délai de grâce) est échu."

    def handle(self, *args, **options):
        n = 0
        for org in Organisation.objects.filter(statut__in=['essai', 'actif']).select_related('plan'):
            if not org.est_active:
                org.statut = 'expire'
                org.save(update_fields=['statut'])
                n += 1
        self.stdout.write(self.style.SUCCESS(f"{n} organisation(s) expirée(s)."))
