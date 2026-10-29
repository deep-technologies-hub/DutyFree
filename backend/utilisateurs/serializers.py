from django.conf import settings
from django.contrib.auth import authenticate
from django.core.cache import cache
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.settings import api_settings as jwt_settings
from django.contrib.auth.models import update_last_login

from tenants.models import Organisation
from tenants.serializers import OrganisationResumeSerializer
from .models import Utilisateur


def tokens_pour(user):
    refresh = CustomTokenObtainPairSerializer.get_token(user)
    return {'refresh': str(refresh), 'access': str(refresh.access_token)}


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Connexion SaaS : code entreprise (`organisation`) + identifiant (ou n° de caisse)
    + mot de passe (ou PIN pour les caissiers).
    """
    organisation = serializers.CharField(required=False, allow_blank=True)

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['role'] = user.role
        token['org'] = user.organisation.slug if user.organisation_id else None
        return token

    def validate(self, attrs):
        slug = (attrs.get('organisation') or '').strip().lower()
        if slug:
            org = Organisation.objects.filter(slug=slug).first()
            if org is None:
                raise AuthenticationFailed('Code entreprise inconnu', code='unknown_organisation')
            if org.statut == 'suspendu':
                raise AuthenticationFailed('Ce compte entreprise est suspendu. Contactez le support.',
                                           code='organisation_suspended')

        # Verrou par compte, en plus de la limite par adresse IP : un PIN de 4 chiffres
        # ne doit pas pouvoir être deviné en multipliant les adresses.
        cle = 'echecs-connexion:%s:%s' % (slug, (attrs.get('username') or '').strip().lower())
        echecs = cache.get(cle, 0)
        if echecs >= settings.LOGIN_MAX_ECHECS:
            raise AuthenticationFailed(
                f"Trop de tentatives incorrectes : compte bloqué {settings.LOGIN_VERROU_MINUTES} minutes.",
                code='account_locked')

        user = authenticate(self.context.get('request'), username=attrs.get('username'),
                            password=attrs.get('password'), organisation=slug or None)
        if user is None:
            cache.set(cle, echecs + 1, settings.LOGIN_VERROU_MINUTES * 60)
            raise AuthenticationFailed('Identifiants ou PIN incorrects', code='invalid_credentials')
        cache.delete(cle)

        if jwt_settings.UPDATE_LAST_LOGIN:
            update_last_login(None, user)
        return tokens_pour(user)


class UtilisateurSerializer(serializers.ModelSerializer):
    """Lecture + mise à jour. `password` et `pin` sont en écriture seule et hachés."""
    full_name = serializers.ReadOnlyField()
    password = serializers.CharField(write_only=True, required=False, min_length=8)
    pin = serializers.RegexField(r'^\d{4,6}$', write_only=True, required=False, allow_blank=True,
                                 error_messages={'invalid': 'Le PIN doit contenir 4 à 6 chiffres.'})

    class Meta:
        model = Utilisateur
        fields = ['id', 'username', 'first_name', 'last_name', 'full_name', 'email', 'role',
                  'register_id', 'phone', 'is_active', 'last_login', 'password', 'pin']
        read_only_fields = ['last_login']

    def validate_username(self, value):
        org = self.context['request'].user.organisation
        qs = Utilisateur.objects.filter(organisation=org, username__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Cet identifiant est déjà utilisé dans votre organisation.")
        return value

    def validate_password(self, value):
        validate_password(value, self.instance)
        return value

    def _apply_secrets(self, user, password, pin):
        if password:
            user.set_password(password)
        if pin is not None:
            user.set_pin(pin)

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        pin = validated_data.pop('pin', None)
        if not password:
            raise serializers.ValidationError({'password': 'Mot de passe requis.'})
        user = Utilisateur(**validated_data)
        self._apply_secrets(user, password, pin)
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        pin = validated_data.pop('pin', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        self._apply_secrets(instance, password, pin)
        instance.save()
        return instance


# Conservé pour compatibilité des imports existants.
UtilisateurCreateSerializer = UtilisateurSerializer


class MeSerializer(serializers.ModelSerializer):
    full_name = serializers.ReadOnlyField()
    organisation = OrganisationResumeSerializer(read_only=True)

    class Meta:
        model = Utilisateur
        fields = ['id', 'username', 'full_name', 'role', 'register_id', 'email', 'organisation']
