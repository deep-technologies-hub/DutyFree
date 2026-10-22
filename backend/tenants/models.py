"""
Modèles SaaS : chaque client (boutique duty free) est une Organisation.
Toutes les données métier portent une FK `organisation` (voir TenantModel).
"""
from datetime import timedelta

from django.conf import settings
from django.core.validators import RegexValidator
from django.db import models, transaction
from django.utils import timezone

slug_validator = RegexValidator(
    r'^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$',
    "3 à 40 caractères : minuscules, chiffres et tirets (pas en début/fin).",
)


class Plan(models.Model):
    """Offre commerciale. Une limite à NULL signifie « illimité »."""
    code = models.SlugField(max_length=30, unique=True)
    nom = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    prix_mensuel_xof = models.DecimalField(max_digits=12, decimal_places=0)
    max_utilisateurs = models.PositiveIntegerField(null=True, blank=True)
    max_produits = models.PositiveIntegerField(null=True, blank=True)
    max_caisses = models.PositiveIntegerField(null=True, blank=True)
    actif = models.BooleanField(default=True, help_text="Proposé à l'inscription")
    ordre = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = 'Plan'
        ordering = ['ordre', 'prix_mensuel_xof']

    def __str__(self):
        return f"{self.nom} ({self.prix_mensuel_xof} XOF/mois)"


class Organisation(models.Model):
    STATUTS = [
        ('essai', "Période d'essai"),
        ('actif', 'Abonnement actif'),
        ('expire', 'Expiré'),
        ('suspendu', 'Suspendu'),
    ]

    nom = models.CharField(max_length=200)
    slug = models.SlugField(max_length=40, unique=True, validators=[slug_validator],
                            help_text="Code entreprise utilisé à la connexion")
    email = models.EmailField()
    telephone = models.CharField(max_length=30, blank=True)
    pays = models.CharField(max_length=100, default='Burkina Faso')
    plan = models.ForeignKey(Plan, on_delete=models.PROTECT, related_name='organisations')
    statut = models.CharField(max_length=10, choices=STATUTS, default='essai')
    essai_fin = models.DateTimeField(null=True, blank=True)
    periode_fin = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Organisation'
        ordering = ['nom']

    def __str__(self):
        return f"{self.nom} [{self.slug}]"

    @property
    def date_fin(self):
        return self.essai_fin if self.statut == 'essai' else self.periode_fin

    @property
    def est_active(self):
        """Écriture autorisée ? (lecture toujours permise pour ne pas bloquer l'accès aux données)."""
        if self.statut == 'suspendu':
            return False
        fin = self.date_fin
        if fin is None:
            return self.statut == 'actif'
        grace = timedelta(days=settings.SAAS_GRACE_DAYS) if self.statut == 'actif' else timedelta()
        return timezone.now() <= fin + grace

    @property
    def jours_restants(self):
        fin = self.date_fin
        if fin is None:
            return None
        return max(0, (fin - timezone.now()).days)

    def prolonger(self, mois, plan=None):
        """Étend l'abonnement de `mois` mois à partir de la fin de période (ou de maintenant)."""
        maintenant = timezone.now()
        base = self.periode_fin if self.statut == 'actif' and self.periode_fin and self.periode_fin > maintenant else maintenant
        self.periode_fin = base + timedelta(days=30 * mois)
        self.statut = 'actif'
        if plan is not None:
            self.plan = plan
        self.save(update_fields=['periode_fin', 'statut', 'plan'])
        return base, self.periode_fin

    def usage(self):
        from stock.models import Produit
        users = self.utilisateurs.filter(is_active=True)
        return {
            'utilisateurs': users.count(),
            'produits': Produit.objects.filter(organisation=self, actif=True).count(),
            'caisses': users.filter(role='caissier').exclude(register_id='')
                            .values('register_id').distinct().count(),
        }


class TenantModel(models.Model):
    """Base abstraite : rattache un enregistrement à une organisation."""
    organisation = models.ForeignKey(
        Organisation, on_delete=models.CASCADE,
        related_name='%(app_label)s_%(class)s_set',
    )

    class Meta:
        abstract = True


class Facture(models.Model):
    STATUTS = [
        ('en_attente', 'En attente de paiement'),
        ('payee', 'Payée'),
        ('annulee', 'Annulée'),
    ]
    METHODES = [
        ('mobile_money', 'Mobile Money'),
        ('virement', 'Virement bancaire'),
        ('carte', 'Carte bancaire'),
        ('autre', 'Autre'),
    ]

    numero = models.CharField(max_length=30, unique=True)
    organisation = models.ForeignKey(Organisation, on_delete=models.CASCADE, related_name='factures')
    plan = models.ForeignKey(Plan, on_delete=models.PROTECT)
    mois = models.PositiveIntegerField(default=1)
    montant_xof = models.DecimalField(max_digits=14, decimal_places=0)
    statut = models.CharField(max_length=12, choices=STATUTS, default='en_attente')
    methode = models.CharField(max_length=15, choices=METHODES, blank=True)
    reference_paiement = models.CharField(max_length=100, blank=True)
    prestataire = models.CharField(max_length=20, blank=True)
    transaction_id = models.CharField(max_length=60, unique=True, null=True, blank=True)
    rappel_envoye_le = models.DateTimeField(null=True, blank=True)
    periode_debut = models.DateTimeField(null=True, blank=True)
    periode_fin = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    payee_le = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = 'Facture'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.numero} — {self.organisation.nom} — {self.montant_xof} XOF"

    def save(self, *args, **kwargs):
        if not self.numero:
            import uuid
            self.numero = f"FAC-{timezone.now():%Y%m}-{uuid.uuid4().hex[:6].upper()}"
        super().save(*args, **kwargs)

    @transaction.atomic
    def marquer_payee(self, methode='', reference=''):
        """Encaisse la facture et prolonge l'abonnement de l'organisation (idempotent)."""
        if self.statut == 'payee':
            return
        org = Organisation.objects.select_for_update().get(pk=self.organisation_id)
        self.periode_debut, self.periode_fin = org.prolonger(self.mois, plan=self.plan)
        self.statut = 'payee'
        self.payee_le = timezone.now()
        self.methode = methode or self.methode
        self.reference_paiement = reference or self.reference_paiement
        self.save()


class PaiementEvenement(models.Model):
    """Journal d'audit de chaque tentative / notification / vérification de paiement."""
    TYPES = [('initiation', 'Initiation'), ('webhook', 'Notification'), ('retour', 'Retour client'),
             ('verification', 'Vérification'), ('simulateur', 'Simulateur')]
    facture = models.ForeignKey(Facture, on_delete=models.CASCADE, related_name='evenements')
    prestataire = models.CharField(max_length=20, blank=True)
    type = models.CharField(max_length=15, choices=TYPES)
    statut = models.CharField(max_length=15)
    details = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Événement de paiement'
        ordering = ['-created_at']
