from rest_framework import permissions, status
from rest_framework.exceptions import APIException


class SubscriptionInactive(APIException):
    status_code = status.HTTP_402_PAYMENT_REQUIRED
    default_detail = "Votre abonnement a expiré ou est suspendu : l'application est en lecture seule. Renouvelez-le depuis le backoffice (Abonnement)."
    default_code = 'subscription_inactive'


class PlanLimitReached(APIException):
    status_code = status.HTTP_403_FORBIDDEN
    default_code = 'plan_limit_reached'


class HasTenant(permissions.BasePermission):
    """L'utilisateur appartient à une organisation (les comptes plateforme passent par /admin/)."""
    message = "Ce compte n'est rattaché à aucune organisation, ou l'organisation est suspendue."

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated and user.organisation_id):
            return False
        # Une suspension prend effet immédiatement, même avec un jeton encore valide.
        return user.organisation.statut != 'suspendu'


class SubscriptionActive(permissions.BasePermission):
    """Lecture toujours permise ; écriture uniquement si l'abonnement est valide."""

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        org = getattr(request.user, 'organisation', None)
        if org is None or not org.est_active:
            raise SubscriptionInactive()
        return True


class IsTenantAdmin(permissions.BasePermission):
    message = "Action réservée aux administrateurs de l'organisation."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == 'admin')


class IsTenantAdminOrReadOnly(IsTenantAdmin):
    def has_permission(self, request, view):
        return request.method in permissions.SAFE_METHODS or super().has_permission(request, view)


TENANT_PERMISSIONS = [permissions.IsAuthenticated, HasTenant, SubscriptionActive]
