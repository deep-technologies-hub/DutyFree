"""Provisionnement d'une nouvelle organisation (inscription self-service)."""
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify

from .models import Organisation

SLUGS_RESERVES = {'admin', 'api', 'www', 'app', 'static', 'media', 'ws', 'caisse', 'stock', 'backoffice', 'support'}

CATEGORIES_PAR_DEFAUT = [
    ('Alcools', 'alcools', 'Boissons alcoolisées et spiritueux', '#dc2626', 'wine'),
    ('Parfums', 'parfums', 'Parfums et eaux de toilette', '#7c3aed', 'spray-can'),
    ('Tabac', 'tabac', 'Produits du tabac et cigarettes', '#059669', 'cigarette'),
    ('Cosmétiques', 'cosmetiques', 'Produits de beauté et soins', '#ec4899', 'lipstick'),
    ('Confiserie', 'confiserie', 'Bonbons et sucreries', '#f59e0b', 'candy'),
    ('Accessoires', 'accessoires', 'Accessoires divers et gadgets', '#6366f1', 'shopping-bag'),
    ('Alimentaire', 'alimentaire', 'Produits alimentaires', '#10b981', 'utensils'),
]


def slug_disponible(slug):
    return slug not in SLUGS_RESERVES and not Organisation.objects.filter(slug=slug).exists()


def proposer_slug(nom):
    base = (slugify(nom)[:34].strip('-') or 'boutique')
    if len(base) < 3:
        base = f"{base}-df"
    slug, i = base, 2
    while not slug_disponible(slug):
        slug = f"{base}-{i}"
        i += 1
    return slug


@transaction.atomic
def creer_organisation(*, nom, email, plan, admin, slug=None, telephone='', pays='Burkina Faso'):
    """
    Crée l'organisation, sa configuration, ses catégories par défaut et son
    administrateur. `admin` = dict(username, password, first_name, last_name, email).
    """
    from configuration.models import Configuration
    from stock.models import Categorie
    from utilisateurs.models import Utilisateur

    org = Organisation.objects.create(
        nom=nom,
        slug=slug or proposer_slug(nom),
        email=email,
        telephone=telephone,
        pays=pays,
        plan=plan,
        statut='essai',
        essai_fin=timezone.now() + timedelta(days=settings.SAAS_TRIAL_DAYS),
    )
    Configuration.objects.create(
        organisation=org, nom_boutique=nom, email=email, telephone=telephone,
        nif='', adresse='',
    )
    Categorie.objects.bulk_create([
        Categorie(organisation=org, nom=n, code=c, description=d, couleur=col, icone=ico)
        for n, c, d, col, ico in CATEGORIES_PAR_DEFAUT
    ])
    user = Utilisateur(
        organisation=org,
        username=admin['username'],
        first_name=admin.get('first_name', ''),
        last_name=admin.get('last_name', ''),
        email=admin.get('email') or email,
        role='admin',
    )
    user.set_password(admin['password'])
    user.save()
    return org, user
