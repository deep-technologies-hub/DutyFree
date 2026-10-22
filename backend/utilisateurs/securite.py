"""Mot de passe oublié et révocation des sessions."""
from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from tenants.emails import envoyer_reinitialisation
from .models import Utilisateur


def revoquer_sessions(user):
    """Invalide tous les refresh tokens de l'utilisateur (déconnexion de tous les appareils)."""
    for token in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=token)


class DemandeReinitialisationSerializer(serializers.Serializer):
    organisation = serializers.CharField()
    email = serializers.EmailField()


class ReinitialisationSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    password = serializers.CharField(min_length=8)


class DemandeReinitialisationView(APIView):
    """Envoie un lien de réinitialisation. Réponse identique que le compte existe ou non."""
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'login'

    def post(self, request):
        ser = DemandeReinitialisationSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        users = Utilisateur.objects.filter(
            organisation__slug=ser.validated_data['organisation'].strip().lower(),
            email__iexact=ser.validated_data['email'], is_active=True,
        ).select_related('organisation')
        for user in users:
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            envoyer_reinitialisation(user, f"{settings.FRONTEND_URL}/reinitialiser?uid={uid}&token={token}")
        return Response({'detail': "Si un compte correspond, un email de réinitialisation vient d'être envoyé."})


class ReinitialisationView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'login'

    def post(self, request):
        ser = ReinitialisationSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        try:
            user = Utilisateur.objects.get(pk=force_str(urlsafe_base64_decode(d['uid'])), is_active=True)
        except (Utilisateur.DoesNotExist, ValueError, TypeError, OverflowError):
            user = None
        if user is None or not default_token_generator.check_token(user, d['token']):
            return Response({'detail': 'Lien invalide ou expiré.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_password(d['password'], user)
        except Exception as exc:
            return Response({'password': list(getattr(exc, 'messages', [str(exc)]))}, status=status.HTTP_400_BAD_REQUEST)
        user.set_password(d['password'])
        user.save(update_fields=['password'])
        revoquer_sessions(user)
        return Response({'detail': 'Mot de passe modifié. Vous pouvez vous connecter.',
                         'organisation': user.organisation.slug if user.organisation_id else None})
