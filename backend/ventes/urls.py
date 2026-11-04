from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import VenteViewSet, DonneesPassagersViewSet, VenteRejeteeViewSet

router = DefaultRouter()
router.register('passagers', DonneesPassagersViewSet, basename='passagers')
router.register('rejetees', VenteRejeteeViewSet, basename='vente-rejetee')
router.register('', VenteViewSet, basename='vente')
urlpatterns = [path('', include(router.urls))]
