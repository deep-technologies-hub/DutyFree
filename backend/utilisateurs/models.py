from django.contrib.auth.hashers import check_password, make_password
from django.contrib.auth.models import AbstractUser, UserManager
from django.contrib.auth.validators import UnicodeUsernameValidator
from django.db import models
from django.db.models import Q


class UtilisateurManager(UserManager):
    def get_by_natural_key(self, username):
        # Les identifiants ne sont uniques que par organisation : la clé naturelle
        # (admin Django, createsuperuser) désigne un compte plateforme.
        return self.get(username=username, organisation__isnull=True)

    def create_superuser(self, username, email=None, password=None, **extra_fields):
        extra_fields.setdefault('role', 'admin')
        return super().create_superuser(username, email, password, **extra_fields)


class Utilisateur(AbstractUser):
    ROLES = [
        ('admin', 'Administrateur'),
        ('superviseur', 'Superviseur'),
        ('stock_manager', 'Stock Manager'),
        ('caissier', 'Caissier'),
    ]
    username = models.CharField(
        'identifiant', max_length=150, validators=[UnicodeUsernameValidator()],
        help_text="Unique au sein de l'organisation.",
    )
    organisation = models.ForeignKey(
        'tenants.Organisation', on_delete=models.CASCADE, null=True, blank=True,
        related_name='utilisateurs',
        help_text="Vide pour les comptes d'administration de la plateforme.",
    )
    role = models.CharField(max_length=20, choices=ROLES, default='caissier')
    register_id = models.CharField(max_length=20, blank=True, verbose_name="Identifiant caisse")
    pin = models.CharField(max_length=128, blank=True, verbose_name="Code PIN caisse (haché)")
    phone = models.CharField(max_length=20, blank=True)
    is_active = models.BooleanField(default=True)

    objects = UtilisateurManager()

    class Meta:
        verbose_name = "Utilisateur"
        ordering = ['last_name', 'first_name']
        constraints = [
            models.UniqueConstraint(fields=['organisation', 'username'], name='uniq_username_par_organisation'),
            models.UniqueConstraint(fields=['username'], condition=Q(organisation__isnull=True),
                                    name='uniq_username_plateforme'),
        ]

    def __str__(self):
        return f"{self.get_full_name()} ({self.role})"

    @property
    def full_name(self):
        return self.get_full_name() or self.username

    def set_pin(self, raw_pin):
        self.pin = make_password(raw_pin) if raw_pin else ''

    def check_pin(self, raw_pin):
        return bool(self.pin and raw_pin) and check_password(raw_pin, self.pin)
