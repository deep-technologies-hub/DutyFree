from django.contrib import admin
from .models import Fournisseur, Produit, Sommier, MouvementStock, CommandeFournisseur, LigneCommande

@admin.register(Fournisseur)
class FournisseurAdmin(admin.ModelAdmin):
    list_display = ['nom', 'contact', 'pays', 'actif']
    list_filter = ['organisation', 'actif', 'pays']

@admin.register(Produit)
class ProduitAdmin(admin.ModelAdmin):
    list_display = ['code', 'nom', 'organisation', 'categorie', 'stock', 'prix_xof', 'statut_stock', 'actif']
    list_filter = ['organisation', 'actif']
    search_fields = ['code', 'nom', 'code_barres']
    readonly_fields = ['statut_stock']

@admin.register(Sommier)
class SommierAdmin(admin.ModelAdmin):
    list_display = ['numero', 'produit', 'quantite_restante', 'taux_apurement', 'statut', 'date_ouverture']
    list_filter = ['organisation', 'statut']

@admin.register(MouvementStock)
class MouvementStockAdmin(admin.ModelAdmin):
    list_display = ['produit', 'type_mouvement', 'quantite', 'stock_avant', 'stock_apres', 'utilisateur', 'date']
    list_filter = ['organisation', 'type_mouvement']
    readonly_fields = ['stock_avant', 'stock_apres', 'date']

class LigneCommandeInline(admin.TabularInline):
    model = LigneCommande
    extra = 1

@admin.register(CommandeFournisseur)
class CommandeAdmin(admin.ModelAdmin):
    list_display = ['numero', 'organisation', 'fournisseur', 'statut', 'montant_total', 'created_at']
    list_filter = ['organisation', 'statut']
    inlines = [LigneCommandeInline]
