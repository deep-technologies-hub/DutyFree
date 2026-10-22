from django.db import models, transaction
from django.db.models import Q
from django.conf import settings

from tenants.models import TenantModel


def photo_upload_to(instance, filename):
    return f"produits/{instance.organisation_id}/{filename}"


class Fournisseur(TenantModel):
    nom = models.CharField(max_length=200)
    contact = models.CharField(max_length=100, blank=True)
    email = models.EmailField(blank=True)
    telephone = models.CharField(max_length=30, blank=True)
    pays = models.CharField(max_length=100, blank=True)
    adresse = models.TextField(blank=True)
    actif = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Fournisseur"
        ordering = ['nom']

    def __str__(self):
        return self.nom


class Categorie(TenantModel):
    """Catégorie de produits pour le duty free"""
    nom = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    code = models.CharField(max_length=20, blank=True, help_text="Code court pour la catégorie")
    couleur = models.CharField(max_length=7, default='#6366f1', help_text="Couleur hexadécimale pour l'interface")
    icone = models.CharField(max_length=50, blank=True, help_text="Nom de l'icône (ex: shopping-bag, bottle)")
    actif = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Catégorie"
        verbose_name_plural = "Catégories"
        ordering = ['nom']
        constraints = [
            models.UniqueConstraint(fields=['organisation', 'nom'], name='uniq_categorie_nom'),
            models.UniqueConstraint(fields=['organisation', 'code'], condition=~Q(code=''),
                                    name='uniq_categorie_code'),
        ]

    def __str__(self):
        return self.nom

    @property
    def nombre_produits(self):
        """Retourne le nombre de produits dans cette catégorie"""
        return self.produits.filter(actif=True).count()


class Produit(TenantModel):
    code = models.CharField(max_length=20)
    code_barres = models.CharField(max_length=50, blank=True)
    nom = models.CharField(max_length=200)
    nom_en = models.CharField(max_length=200, blank=True)
    categorie = models.ForeignKey(Categorie, on_delete=models.SET_NULL, null=True, blank=True, related_name='produits')
    fournisseur = models.ForeignKey(Fournisseur, on_delete=models.SET_NULL, null=True, blank=True, related_name='produits')
    description = models.TextField(blank=True)
    photo = models.ImageField(upload_to=photo_upload_to, blank=True, null=True)
    # Prix
    prix_xof = models.DecimalField(max_digits=12, decimal_places=2)
    prix_eur = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    prix_usd = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    taux_tva = models.DecimalField(max_digits=5, decimal_places=2, default=0, help_text="0 pour Duty Free")
    # Stock
    stock = models.IntegerField(default=0)
    stock_min = models.IntegerField(default=5, help_text="Seuil d'alerte")
    stock_max = models.IntegerField(default=100)
    unite = models.CharField(max_length=20, default='unité')
    actif = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Produit"
        ordering = ['categorie', 'nom']
        constraints = [
            models.UniqueConstraint(fields=['organisation', 'code'], name='uniq_produit_code'),
            models.UniqueConstraint(fields=['organisation', 'code_barres'], condition=~Q(code_barres=''),
                                    name='uniq_produit_code_barres'),
        ]

    def __str__(self):
        return f"[{self.code}] {self.nom}"

    @property
    def statut_stock(self):
        if self.stock == 0:
            return 'rupture'
        elif self.stock <= self.stock_min * 0.5:
            return 'critique'
        elif self.stock <= self.stock_min:
            return 'bas'
        return 'ok'

    @property
    def photo_url(self):
        """Retourne l'URL complète de l'image ou une image par défaut"""
        if self.photo:
            return self.photo.url
        return "/static/images/no-image.svg"


class Sommier(TenantModel):
    """Sommier d'entreposage fictif — conformité douanière DJBC"""
    STATUTS = [
        ('actif', 'Actif'),
        ('en_cours', 'En cours d\'apurement'),
        ('apure', 'Apuré'),
    ]
    numero = models.CharField(max_length=50)
    reference_djbc = models.CharField(max_length=100, blank=True)
    produit = models.ForeignKey(Produit, on_delete=models.PROTECT, related_name='sommiers')
    quantite_initiale = models.IntegerField()
    quantite_entree = models.IntegerField(default=0)
    quantite_sortie = models.IntegerField(default=0)
    date_ouverture = models.DateField()
    date_apurement = models.DateField(null=True, blank=True)
    statut = models.CharField(max_length=10, choices=STATUTS, default='actif')
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Sommier DJBC"
        ordering = ['-date_ouverture']
        constraints = [
            models.UniqueConstraint(fields=['organisation', 'numero'], name='uniq_sommier_numero'),
        ]

    def __str__(self):
        return f"{self.numero} — {self.produit.nom}"

    @property
    def quantite_restante(self):
        return self.quantite_entree - self.quantite_sortie

    @property
    def taux_apurement(self):
        if self.quantite_entree == 0:
            return 0
        return round((self.quantite_sortie / self.quantite_entree) * 100, 1)


class MouvementStock(TenantModel):
    TYPES = [
        ('entree', 'Entrée'),
        ('sortie', 'Sortie'),
        ('ajustement', 'Ajustement inventaire'),
        ('rebut', 'Rebut / Casse'),
        ('inventaire', 'Inventaire'),
    ]
    produit = models.ForeignKey(Produit, on_delete=models.PROTECT, related_name='mouvements')
    sommier = models.ForeignKey(Sommier, on_delete=models.SET_NULL, null=True, blank=True, related_name='mouvements')
    type_mouvement = models.CharField(max_length=15, choices=TYPES)
    quantite = models.IntegerField()
    stock_avant = models.IntegerField()
    stock_apres = models.IntegerField()
    motif = models.CharField(max_length=255, blank=True)
    reference = models.CharField(max_length=100, blank=True, help_text="N° commande, bon de livraison, etc.")
    utilisateur = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    date = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Mouvement de stock"
        ordering = ['-date']

    def __str__(self):
        return f"{self.type_mouvement} {self.quantite} × {self.produit.nom}"

    @transaction.atomic
    def save(self, *args, **kwargs):
        from django.db.models import F
        if not self.organisation_id:
            self.organisation_id = self.produit.organisation_id
        # Mettre à jour le stock du produit
        if not self.pk:  # Nouveau mouvement uniquement
            self.stock_avant = self.produit.stock
            
            delta = self.quantite
            if self.type_mouvement in ('sortie', 'rebut'):
                delta = -self.quantite
                # Si pas de sommier spécifié, on prend le plus ancien actif (FIFO)
                if not self.sommier:
                    self.sommier = Sommier.objects.filter(
                        produit=self.produit, 
                        statut__in=['actif', 'en_cours']
                    ).order_by('date_ouverture').first()
            elif self.type_mouvement == 'ajustement':
                # Pour ajustement, la quantité peut déjà être négative
                pass
            elif self.type_mouvement == 'entree':
                # Pour une entrée, si pas de sommier, on peut éventuellement en créer un ou prendre le dernier
                if not self.sommier:
                    self.sommier = Sommier.objects.filter(
                        produit=self.produit,
                        statut='actif'
                    ).order_by('-date_ouverture').first()
            
            # Mise à jour atomique du produit
            self.produit.stock = F('stock') + delta
            self.produit.save(update_fields=['stock', 'updated_at'])
            
            # Recharger pour avoir la valeur réelle après F() pour le champ stock_apres
            self.produit.refresh_from_db()
            self.stock_apres = self.produit.stock
            
            # Mise à jour sommier
            if self.sommier:
                if self.type_mouvement == 'entree':
                    self.sommier.quantite_entree = F('quantite_entree') + self.quantite
                elif self.type_mouvement in ('sortie', 'rebut'):
                    self.sommier.quantite_sortie = F('quantite_sortie') + self.quantite
                
                self.sommier.save(update_fields=['quantite_entree', 'quantite_sortie'])
                self.sommier.refresh_from_db()
                
                # Mise à jour du statut si nécessaire
                if self.sommier.quantite_restante <= 0:
                    self.sommier.statut = 'apure'
                elif self.sommier.statut == 'actif' and self.sommier.quantite_sortie > 0:
                    self.sommier.statut = 'en_cours'
                self.sommier.save(update_fields=['statut'])
                
        super().save(*args, **kwargs)


class CommandeFournisseur(TenantModel):
    STATUTS = [
        ('brouillon', 'Brouillon'),
        ('envoyee', 'Envoyée'),
        ('recue', 'Reçue'),
        ('validee', 'Validée'),
        ('annulee', 'Annulée'),
    ]
    DEVISES = [('XOF','XOF'), ('EUR','EUR'), ('USD','USD')]

    numero = models.CharField(max_length=50)
    fournisseur = models.ForeignKey(Fournisseur, on_delete=models.PROTECT, related_name='commandes')
    statut = models.CharField(max_length=10, choices=STATUTS, default='brouillon')
    devise = models.CharField(max_length=3, choices=DEVISES, default='XOF')
    frais_approche = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    date_attendue = models.DateField(null=True, blank=True)
    date_reception = models.DateField(null=True, blank=True)

    class Meta:
        verbose_name = "Commande fournisseur"
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(fields=['organisation', 'numero'], name='uniq_commande_numero'),
        ]

    def __str__(self):
        return f"{self.numero} — {self.fournisseur.nom}"

    @property
    def montant_total(self):
        return sum(l.montant_total for l in self.lignes.all()) + self.frais_approche


class LigneCommande(models.Model):
    commande = models.ForeignKey(CommandeFournisseur, on_delete=models.CASCADE, related_name='lignes')
    produit = models.ForeignKey(Produit, on_delete=models.PROTECT)
    quantite = models.IntegerField()
    prix_unitaire = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        verbose_name = "Ligne de commande"

    @property
    def montant_total(self):
        return self.quantite * self.prix_unitaire
