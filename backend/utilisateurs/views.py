from django.db.models import CharField, F, Value
from django.db.models.functions import Concat
from rest_framework import permissions, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from tenants.mixins import TenantScopedViewSetMixin
from tenants.permissions import GESTION, TENANT_PERMISSIONS, IsTenantAdmin
from tenants.quotas import verifier_quota, verifier_quota_caisse
from .models import Utilisateur
from .securite import revoquer_sessions
from .serializers import CustomTokenObtainPairSerializer, MeSerializer, UtilisateurSerializer


class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'login'


class MeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(MeSerializer(request.user).data)


class CaissiersPublicView(APIView):
    """
    Caissiers actifs d'une organisation, pour l'écran de connexion de la caisse.
    GET /api/utilisateurs/caissiers/?organisation=<code entreprise>
    """
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def get(self, request):
        slug = request.query_params.get('organisation', '').strip().lower()
        if not slug:
            raise ValidationError({'organisation': 'Code entreprise requis.'})
        caissiers = (
            Utilisateur.objects
            .filter(organisation__slug=slug, role='caissier', is_active=True)
            .annotate(full_name=Concat(F('first_name'), Value(' '), F('last_name'), output_field=CharField()))
            .values('id', 'username', 'full_name', 'register_id', 'role')
        )
        return Response(list(caissiers))


class UtilisateurViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    queryset = Utilisateur.objects.all()
    serializer_class = UtilisateurSerializer
    search_fields = ['username', 'first_name', 'last_name', 'email', 'role']
    ordering_fields = ['last_name', 'role', 'last_login']

    # Liste du personnel (e-mails, téléphones) : gestion uniquement
    roles_lecture = GESTION

    def get_permissions(self):
        perms = [p() for p in TENANT_PERMISSIONS]
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            perms.append(IsTenantAdmin())
        return perms

    def perform_create(self, serializer):
        d = serializer.validated_data
        verifier_quota(self.tenant, 'utilisateurs')
        verifier_quota_caisse(self.tenant, d.get('role', 'caissier'), d.get('register_id', ''))
        super().perform_create(serializer)

    def perform_update(self, serializer):
        instance, d = serializer.instance, serializer.validated_data
        if instance == self.request.user and (d.get('is_active') is False or d.get('role', 'admin') != 'admin'):
            raise ValidationError("Vous ne pouvez pas désactiver ou rétrograder votre propre compte.")
        if d.get('is_active') and not instance.is_active:
            verifier_quota(self.tenant, 'utilisateurs')
        role = d.get('role', instance.role)
        register_id = d.get('register_id', instance.register_id)
        if role == 'caissier' and (register_id != instance.register_id or role != instance.role or not instance.is_active):
            verifier_quota_caisse(self.tenant, role, register_id)
        user = serializer.save()
        if d.get('password') or d.get('is_active') is False:
            revoquer_sessions(user)

    def perform_destroy(self, instance):
        if instance == self.request.user:
            raise ValidationError("Vous ne pouvez pas supprimer votre propre compte.")
        instance.delete()
