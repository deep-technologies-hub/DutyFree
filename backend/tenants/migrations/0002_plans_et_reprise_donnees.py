"""
Passage en SaaS :
1. crée les plans commerciaux par défaut ;
2. rattache toutes les données existantes (mono-boutique) à une organisation
   « principal » (code entreprise : principal) avec un abonnement actif ;
3. hache les PIN caisse jusque-là stockés en clair.
"""
from datetime import timedelta

from django.contrib.auth.hashers import identify_hasher, make_password
from django.db import migrations
from django.utils import timezone

PLANS = [
    dict(code='starter', nom='Starter', ordre=1, prix_mensuel_xof=25000,
         max_utilisateurs=5, max_produits=300, max_caisses=1,
         description='Une boutique, une caisse — idéal pour démarrer.'),
    dict(code='business', nom='Business', ordre=2, prix_mensuel_xof=60000,
         max_utilisateurs=20, max_produits=3000, max_caisses=5,
         description='Plusieurs caisses, fidélité, sommiers douaniers et reporting avancé.'),
    dict(code='enterprise', nom='Enterprise', ordre=3, prix_mensuel_xof=150000,
         max_utilisateurs=None, max_produits=None, max_caisses=None,
         description='Volumes illimités et accompagnement dédié.'),
]

TENANT_MODELS = [
    ('stock', 'Fournisseur'), ('stock', 'Categorie'), ('stock', 'Produit'), ('stock', 'Sommier'),
    ('stock', 'MouvementStock'), ('stock', 'CommandeFournisseur'),
    ('ventes', 'Vente'), ('ventes', 'DonneesPassagers'),
    ('fidelite', 'CarteFidelite'), ('configuration', 'Configuration'),
    ('utilisateurs', 'Utilisateur'),
]


def forwards(apps, schema_editor):
    Plan = apps.get_model('tenants', 'Plan')
    Organisation = apps.get_model('tenants', 'Organisation')
    for p in PLANS:
        Plan.objects.update_or_create(code=p['code'], defaults=p)

    a_migrer = [(apps.get_model(app, model)) for app, model in TENANT_MODELS]
    if not any(M.objects.filter(organisation__isnull=True).exists() for M in a_migrer):
        return  # Nouvelle installation : rien à reprendre.

    Configuration = apps.get_model('configuration', 'Configuration')
    cfg = Configuration.objects.filter(organisation__isnull=True).order_by('pk').first()
    org = Organisation.objects.create(
        nom=(cfg.nom_boutique if cfg else '') or 'Organisation principale',
        slug='principal',
        email=(cfg.email if cfg else '') or 'admin@example.com',
        plan=Plan.objects.get(code='enterprise'),
        statut='actif',
        periode_fin=timezone.now() + timedelta(days=365),
    )
    for M in a_migrer:
        M.objects.filter(organisation__isnull=True).update(organisation=org)

    # Configuration : relation 1-1, on ne garde que la plus ancienne.
    Configuration.objects.filter(organisation=org).exclude(pk=cfg.pk if cfg else None).delete()


def hash_pins(apps, schema_editor):
    Utilisateur = apps.get_model('utilisateurs', 'Utilisateur')
    for u in Utilisateur.objects.exclude(pin=''):
        try:
            identify_hasher(u.pin)
        except ValueError:
            u.pin = make_password(u.pin)
            u.save(update_fields=['pin'])


class Migration(migrations.Migration):

    dependencies = [
        ('tenants', '0001_initial'),
        ('utilisateurs', '0002_saas_organisation'),
        ('stock', '0006_saas_organisation'),
        ('ventes', '0003_saas_organisation'),
        ('fidelite', '0002_saas_organisation'),
        ('configuration', '0002_saas_organisation'),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
        migrations.RunPython(hash_pins, migrations.RunPython.noop),
    ]
