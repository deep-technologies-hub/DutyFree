from decimal import Decimal

from django.db import models
from django.conf import settings
from stock.models import Produit
from tenants.models import TenantModel

class Vente(TenantModel):
    DEVISES = [('XOF','XOF'), ('EUR','EUR'), ('USD','USD')]
    STATUTS = [('payee','Payée'), ('annulee','Annulée'), ('suspendue','Suspendue')]

    numero_ticket = models.CharField(max_length=40)
    caissier = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='ventes')
    numero_caisse = models.CharField(max_length=20, blank=True)
    statut = models.CharField(max_length=10, choices=STATUTS, default='payee')
    devise = models.CharField(max_length=3, choices=DEVISES, default='XOF')
    sous_total = models.DecimalField(max_digits=14, decimal_places=2)
    remise_totale = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=14, decimal_places=2)
    # Fidélité
    carte_fidelite = models.ForeignKey('fidelite.CarteFidelite', on_delete=models.SET_NULL, null=True, blank=True, related_name='ventes')
    # Passager
    passager_nom = models.CharField(max_length=200, blank=True)
    vol_reference = models.CharField(max_length=50, blank=True)
    destination = models.CharField(max_length=100, blank=True)
    # Sync offline
    synced = models.BooleanField(default=True)
    date_locale = models.DateTimeField(help_text="Date réelle de la vente (important pour mode offline)")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Vente"
        ordering = ['-date_locale']
        indexes = [
            models.Index(fields=['date_locale']),
            models.Index(fields=['caissier']),
            models.Index(fields=['statut']),
            models.Index(fields=['organisation', 'date_locale']),
        ]
        constraints = [
            models.UniqueConstraint(fields=['organisation', 'numero_ticket'], name='uniq_vente_ticket'),
        ]

    def __str__(self):
        return f"{self.numero_ticket} — {self.total} {self.devise}"


class LigneVente(models.Model):
    DEVISES = [('XOF','XOF'), ('EUR','EUR'), ('USD','USD')]

    vente = models.ForeignKey(Vente, on_delete=models.CASCADE, related_name='lignes')
    produit = models.ForeignKey(Produit, on_delete=models.PROTECT)
    quantite = models.IntegerField()
    prix_unitaire = models.DecimalField(max_digits=12, decimal_places=2)
    devise = models.CharField(max_length=3, choices=DEVISES, default='XOF')
    remise = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=14, decimal_places=2)

    class Meta:
        verbose_name = "Ligne de vente"

    def save(self, *args, **kwargs):
        self.total = self.quantite * Decimal(self.prix_unitaire) * (1 - Decimal(self.remise) / 100)
        super().save(*args, **kwargs)


class Paiement(models.Model):
    METHODES = [
        ('especes', 'Espèces'),
        ('carte', 'Carte bancaire'),
        ('mobile_money', 'Mobile Money'),
    ]
    DEVISES = [('XOF','XOF'), ('EUR','EUR'), ('USD','USD')]

    vente = models.ForeignKey(Vente, on_delete=models.CASCADE, related_name='paiements')
    methode = models.CharField(max_length=15, choices=METHODES)
    devise = models.CharField(max_length=3, choices=DEVISES, default='XOF')
    montant = models.DecimalField(max_digits=14, decimal_places=2)
    montant_xof = models.DecimalField(max_digits=14, decimal_places=2)
    monnaie_rendue = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    taux_change = models.DecimalField(max_digits=10, decimal_places=4, default=1)

    class Meta:
        verbose_name = "Paiement"

    def __str__(self):
        return f"{self.methode} {self.montant} {self.devise}"


class DonneesPassagers(TenantModel):
    """Données externes aéroport — saisie manuelle mensuelle"""
    annee = models.IntegerField()
    mois = models.IntegerField()
    nombre_passagers = models.IntegerField()
    source = models.CharField(max_length=100, blank=True)
    notes = models.TextField(blank=True)
    saisie_par = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Données passagers"
        constraints = [
            models.UniqueConstraint(fields=['organisation', 'annee', 'mois'], name='uniq_passagers_mois'),
        ]
        ordering = ['-annee', '-mois']

    def __str__(self):
        return f"{self.mois:02d}/{self.annee} — {self.nombre_passagers} passagers"
