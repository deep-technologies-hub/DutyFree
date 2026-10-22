from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from rest_framework_simplejwt.views import TokenBlacklistView, TokenRefreshView
from tenants.views import HealthView
from utilisateurs.views import CustomTokenObtainPairView
from utilisateurs.securite import DemandeReinitialisationView, ReinitialisationView

admin.site.site_header = 'Duty Free SaaS — Administration plateforme'
admin.site.site_title = 'Duty Free SaaS'

urlpatterns = [
    path(settings.ADMIN_URL, admin.site.urls),
    path('api/health/', HealthView.as_view()),
    path('api/auth/token/', CustomTokenObtainPairView.as_view()),
    path('api/auth/token/refresh/', TokenRefreshView.as_view()),
    path('api/auth/logout/', TokenBlacklistView.as_view()),
    path('api/auth/mot-de-passe/oublie/', DemandeReinitialisationView.as_view()),
    path('api/auth/mot-de-passe/reinitialiser/', ReinitialisationView.as_view()),
    path('api/saas/', include('tenants.urls')),
    path('api/utilisateurs/', include('utilisateurs.urls')),
    path('api/stock/', include('stock.urls')),
    path('api/ventes/', include('ventes.urls')),
    path('api/configuration/', include('configuration.urls')),
    path('api/fidelite/', include('fidelite.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
