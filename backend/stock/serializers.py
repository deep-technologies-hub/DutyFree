from rest_framework import serializers
from tenants.mixins import TenantModelSerializer
from .models import Fournisseur, Categorie, Produit, Sommier, MouvementStock, CommandeFournisseur, LigneCommande

class CategorieSerializer(TenantModelSerializer):
    nombre_produits = serializers.ReadOnlyField()

    class Meta:
        model = Categorie
        fields = '__all__'
        extra_kwargs = {'code': {'required': False, 'default': ''}}

class FournisseurSerializer(TenantModelSerializer):
    class Meta:
        model = Fournisseur
        fields = '__all__'

class ProduitSerializer(TenantModelSerializer):
    statut_stock = serializers.ReadOnlyField()
    fournisseur_nom = serializers.CharField(source='fournisseur.nom', read_only=True)
    categorie_nom = serializers.CharField(source='categorie.nom', read_only=True)
    photo_url = serializers.ReadOnlyField()

    class Meta:
        model = Produit
        fields = '__all__'
        extra_kwargs = {'code_barres': {'required': False, 'default': ''}}

    def validate(self, attrs):
        # Stock initial à la création seulement : ensuite il ne bouge que par des mouvements
        # (entrée, sortie, inventaire), pour garder la traçabilité exigée par la douane.
        # Le formulaire renvoie la valeur affichée, qui a pu changer entre-temps (vente) : ignorée.
        if self.instance is not None:
            attrs.pop('stock', None)
        elif attrs.get('stock', 0) < 0:
            raise serializers.ValidationError({'stock': 'Le stock initial ne peut pas être négatif.'})
        return attrs

class ProduitListSerializer(TenantModelSerializer):
    statut_stock = serializers.ReadOnlyField()
    categorie_nom = serializers.CharField(source='categorie.nom', read_only=True)
    photo_url = serializers.ReadOnlyField()
    class Meta:
        model = Produit
        fields = ['id', 'code', 'code_barres', 'nom', 'nom_en', 'categorie', 'categorie_nom',
                  'prix_xof', 'prix_eur', 'prix_usd', 'stock', 'stock_min',
                  'stock_max', 'unite', 'statut_stock', 'fournisseur', 'photo_url']
        extra_kwargs = {'code_barres': {'required': False, 'default': ''}}

class SommierSerializer(TenantModelSerializer):
    quantite_restante = serializers.ReadOnlyField()
    taux_apurement = serializers.ReadOnlyField()
    produit_nom = serializers.CharField(source='produit.nom', read_only=True)

    class Meta:
        model = Sommier
        fields = '__all__'

class MouvementStockSerializer(TenantModelSerializer):
    produit_nom = serializers.CharField(source='produit.nom', read_only=True)
    utilisateur_nom = serializers.CharField(source='utilisateur.full_name', read_only=True)

    class Meta:
        model = MouvementStock
        fields = '__all__'
        read_only_fields = ['stock_avant', 'stock_apres', 'date', 'utilisateur']

class LigneCommandeSerializer(TenantModelSerializer):
    montant_total = serializers.ReadOnlyField()
    produit_nom = serializers.CharField(source='produit.nom', read_only=True)
    class Meta:
        model = LigneCommande
        fields = '__all__'

class LigneCommandeWriteSerializer(TenantModelSerializer):
    class Meta:
        model = LigneCommande
        fields = ['produit', 'quantite', 'prix_unitaire']

class CommandeFournisseurSerializer(TenantModelSerializer):
    lignes = LigneCommandeSerializer(many=True, read_only=True)
    montant_total = serializers.ReadOnlyField()
    fournisseur_nom = serializers.CharField(source='fournisseur.nom', read_only=True)

    class Meta:
        model = CommandeFournisseur
        fields = '__all__'
        read_only_fields = ['numero', 'created_by']
