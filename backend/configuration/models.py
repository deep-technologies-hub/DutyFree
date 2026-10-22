from django.db import models


class Configuration(models.Model):
    """Paramètres de la boutique — un enregistrement par organisation."""
    organisation = models.OneToOneField('tenants.Organisation', on_delete=models.CASCADE,
                                        related_name='configuration')
    # Boutique
    nom_boutique = models.CharField(max_length=200, default='Ma boutique Duty Free')
    nif = models.CharField(max_length=50, blank=True)
    adresse = models.CharField(max_length=300, blank=True)
    telephone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)

    # Taux de change
    taux_eur_xof = models.DecimalField(max_digits=10, decimal_places=4, default=655.957)
    taux_usd_xof = models.DecimalField(max_digits=10, decimal_places=4, default=607.50)

    # Tickets
    msg_accueil_1 = models.CharField(max_length=200, default='Bienvenue — Welcome')
    msg_accueil_2 = models.CharField(max_length=200, default='Zone de transit international')
    msg_politesse = models.CharField(max_length=200, default='Merci. Bon voyage — Thank you. Safe travels.')

    # Stock
    seuil_alerte_stock = models.PositiveIntegerField(default=10)
    delai_apurement_sommier = models.PositiveIntegerField(default=30)

    # Fidélité
    points_par_xof = models.DecimalField(max_digits=6, decimal_places=4, default=0.001,
                                          help_text='Points gagnés par XOF dépensé')
    valeur_point_xof = models.DecimalField(max_digits=8, decimal_places=2, default=5,
                                            help_text='Valeur d\'un point en XOF')
    seuil_fidelite_bronze = models.PositiveIntegerField(default=100)
    seuil_fidelite_silver = models.PositiveIntegerField(default=500)
    seuil_fidelite_gold = models.PositiveIntegerField(default=1000)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Configuration'

    def __str__(self):
        return self.nom_boutique

    @classmethod
    def get(cls, organisation):
        obj, _ = cls.objects.get_or_create(
            organisation=organisation, defaults={'nom_boutique': organisation.nom})
        return obj
