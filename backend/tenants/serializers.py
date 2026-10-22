from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import Facture, Organisation, Plan, slug_validator
from .services import SLUGS_RESERVES


class PlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = Plan
        fields = ['id', 'code', 'nom', 'description', 'prix_mensuel_xof',
                  'max_utilisateurs', 'max_produits', 'max_caisses']


class OrganisationSerializer(serializers.ModelSerializer):
    plan = PlanSerializer(read_only=True)
    est_active = serializers.BooleanField(read_only=True)
    jours_restants = serializers.IntegerField(read_only=True)
    date_fin = serializers.DateTimeField(read_only=True)
    usage = serializers.SerializerMethodField()

    class Meta:
        model = Organisation
        fields = ['id', 'nom', 'slug', 'email', 'telephone', 'pays', 'plan', 'statut',
                  'essai_fin', 'periode_fin', 'date_fin', 'jours_restants', 'est_active',
                  'usage', 'created_at']
        read_only_fields = ['slug', 'statut', 'essai_fin', 'periode_fin', 'created_at']

    def get_usage(self, obj):
        return obj.usage()


class OrganisationResumeSerializer(serializers.ModelSerializer):
    """Version légère, incluse dans /utilisateurs/me/."""
    plan = serializers.CharField(source='plan.nom', read_only=True)
    est_active = serializers.BooleanField(read_only=True)
    jours_restants = serializers.IntegerField(read_only=True)

    class Meta:
        model = Organisation
        fields = ['id', 'nom', 'slug', 'plan', 'statut', 'est_active', 'jours_restants']


class FactureSerializer(serializers.ModelSerializer):
    plan_nom = serializers.CharField(source='plan.nom', read_only=True)

    class Meta:
        model = Facture
        fields = ['id', 'numero', 'plan', 'plan_nom', 'mois', 'montant_xof', 'statut', 'methode', 'prestataire',
                  'reference_paiement', 'periode_debut', 'periode_fin', 'created_at', 'payee_le']
        read_only_fields = fields


class SouscriptionSerializer(serializers.Serializer):
    plan = serializers.SlugRelatedField(slug_field='code', queryset=Plan.objects.filter(actif=True))
    mois = serializers.ChoiceField(choices=[1, 3, 6, 12], default=1)


class InscriptionSerializer(serializers.Serializer):
    nom_organisation = serializers.CharField(max_length=200)
    slug = serializers.CharField(max_length=40, required=False, allow_blank=True,
                                 validators=[slug_validator])
    email = serializers.EmailField()
    telephone = serializers.CharField(max_length=30, required=False, allow_blank=True)
    pays = serializers.CharField(max_length=100, required=False, default='Burkina Faso')
    plan = serializers.SlugRelatedField(slug_field='code', queryset=Plan.objects.filter(actif=True))
    admin_username = serializers.RegexField(r'^[\w.@+-]{3,150}$', max_length=150)
    admin_password = serializers.CharField(write_only=True, min_length=8, style={'input_type': 'password'})
    admin_first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    admin_last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)

    def validate_slug(self, value):
        value = value.strip().lower()
        if value and (value in SLUGS_RESERVES or Organisation.objects.filter(slug=value).exists()):
            raise serializers.ValidationError("Ce code entreprise est déjà utilisé.")
        return value

    def validate(self, attrs):
        validate_password(attrs['admin_password'])
        return attrs
