from django.utils.translation import gettext_lazy as _
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed, InvalidToken
from rest_framework_simplejwt.settings import api_settings

from .models import Utilisateur


class TenantJWTAuthentication(JWTAuthentication):
    """
    Charge l'utilisateur, son organisation et son plan en une seule requête SQL
    (au lieu de 3) : toutes les vues consultent l'organisation pour l'isolation et l'abonnement.
    """

    def get_user(self, validated_token):
        try:
            user_id = validated_token[api_settings.USER_ID_CLAIM]
        except KeyError:
            raise InvalidToken(_('Token contained no recognizable user identification'))
        try:
            user = (Utilisateur.objects.select_related('organisation__plan')
                    .get(**{api_settings.USER_ID_FIELD: user_id}))
        except Utilisateur.DoesNotExist:
            raise AuthenticationFailed(_('User not found'), code='user_not_found')
        if not user.is_active:
            raise AuthenticationFailed(_('User is inactive'), code='user_inactive')
        return user
