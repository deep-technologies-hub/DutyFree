from django.db import migrations

def create_default_categories(apps, schema_editor):
    """Créer les catégories par défaut"""
    Categorie = apps.get_model('stock', 'Categorie')
    # SaaS : sur une installation neuve, les catégories sont créées par organisation
    # à l'inscription. On ne les crée ici que pour reprendre d'anciens produits.
    if not apps.get_model('stock', 'Produit').objects.exists():
        return
    
    default_categories = [
        {
            'nom': 'Alcools',
            'code': 'alcools',
            'description': 'Boissons alcoolisées et spiritueux',
            'couleur': '#dc2626',
            'icone': 'wine'
        },
        {
            'nom': 'Parfums',
            'code': 'parfums',
            'description': 'Parfums et eaux de toilette',
            'couleur': '#7c3aed',
            'icone': 'spray-can'
        },
        {
            'nom': 'Tabac',
            'code': 'tabac',
            'description': 'Produits du tabac et cigarettes',
            'couleur': '#059669',
            'icone': 'cigarette'
        },
        {
            'nom': 'Cosmétiques',
            'code': 'cosmetiques',
            'description': 'Produits de beauté et soins',
            'couleur': '#ec4899',
            'icone': 'lipstick'
        },
        {
            'nom': 'Confiserie',
            'code': 'confiserie',
            'description': 'Bonbons et sucreries',
            'couleur': '#f59e0b',
            'icone': 'candy'
        },
        {
            'nom': 'Accessoires',
            'code': 'accessoires',
            'description': 'Accessoires divers et gadgets',
            'couleur': '#6366f1',
            'icone': 'shopping-bag'
        },
        {
            'nom': 'Alimentaire',
            'code': 'alimentaire',
            'description': 'Produits alimentaires',
            'couleur': '#10b981',
            'icone': 'utensils'
        }
    ]
    
    for cat_data in default_categories:
        Categorie.objects.create(**cat_data)

class Migration(migrations.Migration):

    dependencies = [
        ('stock', '0003_create_categorie_model'),
    ]

    operations = [
        migrations.RunPython(create_default_categories),
    ]
