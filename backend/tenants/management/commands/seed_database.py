"""
Crée une organisation de démonstration complète.
Usage : python manage.py seed_database [--slug demo] [--password dutyfree2025]
"""
from datetime import date

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from fidelite.models import CarteFidelite
from stock.models import Categorie, CommandeFournisseur, Fournisseur, LigneCommande, Produit, Sommier
from tenants.models import Organisation, Plan
from tenants.services import creer_organisation
from utilisateurs.models import Utilisateur

FOURNISSEURS = [
    dict(nom='LVMH Distribution', contact='Jean-Paul Martin', email='jp.martin@example.com', pays='France', telephone='+33145678901'),
    dict(nom='Rémy Cointreau', contact='Sophie Durand', email='s.durand@example.com', pays='France', telephone='+33156789012'),
    dict(nom='Philip Morris International', contact='Mark Johnson', email='m.johnson@example.com', pays='Suisse', telephone='+41227938000'),
    dict(nom='Diageo Africa', contact='Kwame Asante', email='k.asante@example.com', pays='Ghana', telephone='+233302680000'),
]

# code, code_barres, nom, catégorie, fournisseur, prix XOF, EUR, USD, stock, stock_min, stock_max, unité
PRODUITS = [
    ('ALC-001', '3014260001233', 'Hennessy VS 70cl', 'alcools', 'LVMH Distribution', 18500, 28.20, 30.50, 48, 10, 100, 'bouteille'),
    ('ALC-002', '3014260001240', 'Moët & Chandon Brut 75cl', 'alcools', 'LVMH Distribution', 29000, 44.20, 47.80, 7, 10, 60, 'bouteille'),
    ('ALC-003', '3035050050322', 'Rémy Martin VSOP 70cl', 'alcools', 'Rémy Cointreau', 24000, 36.60, 39.50, 2, 8, 60, 'bouteille'),
    ('ALC-004', '3035050167153', 'Cointreau Triple Sec 70cl', 'alcools', 'Rémy Cointreau', 16000, 24.40, 26.30, 0, 5, 40, 'bouteille'),
    ('ALC-005', '5000267023656', 'Johnnie Walker Black 70cl', 'alcools', 'Diageo Africa', 22000, 33.60, 36.20, 15, 12, 80, 'bouteille'),
    ('PAR-001', '3346846436419', 'Dior Sauvage EDP 100ml', 'parfums', 'LVMH Distribution', 52000, 79.30, 85.60, 23, 5, 50, 'flacon'),
    ('PAR-002', '3346846416701', 'Chanel N°5 EDP 50ml', 'parfums', 'LVMH Distribution', 68000, 103.70, 112.00, 9, 4, 30, 'flacon'),
    ('TAB-001', '4019474001011', 'Marlboro Red x20', 'tabac', 'Philip Morris International', 2800, 4.30, 4.60, 120, 30, 300, 'paquet'),
    ('TAB-002', '4019474001028', 'Parliament Aqua Blue x20', 'tabac', 'Philip Morris International', 3200, 4.90, 5.30, 85, 20, 200, 'paquet'),
    ('CON-001', '7622210100320', 'Toblerone 360g', 'confiserie', 'LVMH Distribution', 4500, 6.90, 7.40, 40, 10, 100, 'boîte'),
    ('COS-001', '3605970006501', 'Lancôme La Vie Est Belle 100ml', 'cosmetiques', 'LVMH Distribution', 61000, 93.00, 100.50, 11, 4, 30, 'flacon'),
    ('ACC-001', '5060597920016', 'Lunettes Ray-Ban Aviator', 'accessoires', 'LVMH Distribution', 85000, 129.60, 139.90, 6, 2, 20, 'paire'),
]

UTILISATEURS = [
    dict(username='aminata', first_name='Aminata', last_name='Sawadogo', role='caissier', register_id='CAISSE-01', pin='1234'),
    dict(username='issouf', first_name='Issouf', last_name='Compaoré', role='caissier', register_id='CAISSE-02', pin='5678'),
    dict(username='marie', first_name='Marie', last_name='Ouédraogo', role='superviseur', register_id='SUP-01', pin='9999'),
    dict(username='stock', first_name='Paul', last_name='Kaboré', role='stock_manager', register_id='', pin=''),
]

CARTES = [
    dict(nom='Diallo', prenom='Aminata', nationalite='Burkina Faso', points=1250),
    dict(nom='Ouédraogo', prenom='Bertrand', nationalite="Côte d'Ivoire", points=620),
    dict(nom='Traoré', prenom='Fatimata', nationalite='Mali', points=85),
]


class Command(BaseCommand):
    help = "Crée une organisation de démonstration (utilisateurs, catalogue, sommiers, fidélité)."

    def add_arguments(self, parser):
        parser.add_argument('--slug', default='demo')
        parser.add_argument('--password', default='dutyfree2025')

    @transaction.atomic
    def handle(self, *args, slug, password, **options):
        if Organisation.objects.filter(slug=slug).exists():
            raise CommandError(f"L'organisation « {slug} » existe déjà.")
        plan = Plan.objects.filter(code='business').first() or Plan.objects.first()
        if plan is None:
            raise CommandError("Aucun plan : exécutez d'abord `python manage.py migrate`.")

        org, _ = creer_organisation(
            nom='Duty Free Démo', slug=slug, email='demo@example.com', plan=plan,
            admin={'username': 'admin', 'password': password, 'first_name': 'Admin', 'last_name': 'Démo'},
        )
        for u in UTILISATEURS:
            user = Utilisateur(organisation=org, email=f"{u['username']}@example.com",
                               **{k: v for k, v in u.items() if k != 'pin'})
            user.set_password(password)
            user.set_pin(u['pin'])
            user.save()

        fournisseurs = {f['nom']: Fournisseur.objects.create(organisation=org, **f) for f in FOURNISSEURS}
        categories = {c.code: c for c in Categorie.objects.filter(organisation=org)}
        produits = {}
        for code, ean, nom, cat, four, xof, eur, usd, stock, smin, smax, unite in PRODUITS:
            produits[code] = Produit.objects.create(
                organisation=org, code=code, code_barres=ean, nom=nom, nom_en=nom,
                categorie=categories.get(cat), fournisseur=fournisseurs[four],
                prix_xof=xof, prix_eur=eur, prix_usd=usd, stock=stock, stock_min=smin,
                stock_max=smax, unite=unite,
            )

        Sommier.objects.create(organisation=org, numero='SOM-001', reference_djbc='REF-DJBC-001',
                               produit=produits['ALC-001'], quantite_initiale=200, quantite_entree=200,
                               quantite_sortie=152, date_ouverture=date.today().replace(day=1), statut='en_cours')
        cmd = CommandeFournisseur.objects.create(organisation=org, numero='CMD-DEMO-001',
                                                 fournisseur=fournisseurs['Rémy Cointreau'], statut='envoyee',
                                                 frais_approche=45000, notes='Réassort Cointreau')
        LigneCommande.objects.create(commande=cmd, produit=produits['ALC-004'], quantite=20, prix_unitaire=16000)
        for c in CARTES:
            CarteFidelite.objects.create(organisation=org, **c)

        self.stdout.write(self.style.SUCCESS(f"Organisation de démo créée — code entreprise : {slug}"))
        self.stdout.write(f"  Backoffice : admin / {password}")
        self.stdout.write(f"  Caisse     : aminata (PIN 1234), issouf (PIN 5678)")
        self.stdout.write(f"  Stock      : stock / {password}")
