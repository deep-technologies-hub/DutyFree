from django.contrib import admin
from .models import Vente, LigneVente, Paiement, DonneesPassagers

class LigneVenteInline(admin.TabularInline):
    model = LigneVente
    extra = 0
    readonly_fields = ['total']

class PaiementInline(admin.TabularInline):
    model = Paiement
    extra = 0

@admin.register(Vente)
class VenteAdmin(admin.ModelAdmin):
    list_display = ['numero_ticket', 'organisation', 'caissier', 'total', 'devise', 'statut', 'date_locale', 'synced']
    list_filter = ['organisation', 'statut', 'devise', 'synced']
    search_fields = ['numero_ticket', 'passager_nom', 'vol_reference']
    readonly_fields = ['created_at']
    inlines = [LigneVenteInline, PaiementInline]

@admin.register(DonneesPassagers)
class DonneesPassagersAdmin(admin.ModelAdmin):
    list_display = ['organisation', 'mois', 'annee', 'nombre_passagers', 'saisie_par', 'created_at']
