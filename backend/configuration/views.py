from rest_framework.views import APIView
from rest_framework.response import Response
from tenants.permissions import TENANT_PERMISSIONS, IsTenantAdmin
from .models import Configuration
from .serializers import ConfigurationSerializer


class ConfigurationView(APIView):
    """GET = lecture, PATCH = mise à jour (administrateur de l'organisation)."""

    def get_permissions(self):
        perms = [p() for p in TENANT_PERMISSIONS]
        if self.request.method == 'PATCH':
            perms.append(IsTenantAdmin())
        return perms

    def get(self, request):
        config = Configuration.get(request.user.organisation)
        return Response(ConfigurationSerializer(config).data)

    def patch(self, request):
        config = Configuration.get(request.user.organisation)
        serializer = ConfigurationSerializer(config, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
