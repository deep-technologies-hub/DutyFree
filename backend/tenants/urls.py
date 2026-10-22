from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (FactureViewSet, InscriptionView, OrganisationView, PlanViewSet, RetourPaiementView,
                    SimulateurPaiementView, WebhookPaiementView)

router = DefaultRouter()
router.register('plans', PlanViewSet, basename='plan')
router.register('factures', FactureViewSet, basename='facture')

urlpatterns = [
    path('inscription/', InscriptionView.as_view(), name='saas-inscription'),
    path('organisation/', OrganisationView.as_view(), name='saas-organisation'),
    path('paiements/webhook/<slug:code>/', WebhookPaiementView.as_view(), name='saas-webhook'),
    path('paiements/retour/<str:transaction_id>/', RetourPaiementView.as_view(), name='saas-retour'),
    path('paiements/simulateur/<str:jeton>/', SimulateurPaiementView.as_view(), name='saas-simulateur'),
    path('', include(router.urls)),
]
