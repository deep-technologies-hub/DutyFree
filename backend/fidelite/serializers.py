from rest_framework import serializers
from tenants.mixins import TenantModelSerializer
from .models import CarteFidelite, MouvementFidelite


class MouvementFideliteSerializer(TenantModelSerializer):
    class Meta:
        model = MouvementFidelite
        fields = '__all__'
        read_only_fields = ['solde_avant', 'solde_apres', 'operateur']


class CarteFideliteSerializer(TenantModelSerializer):
    mouvements = MouvementFideliteSerializer(many=True, read_only=True)
    nom_complet = serializers.SerializerMethodField()
    numero = serializers.CharField(read_only=True)

    class Meta:
        model = CarteFidelite
        fields = '__all__'

    def get_nom_complet(self, obj):
        return f'{obj.prenom} {obj.nom}'.strip()


class CarteFideliteListSerializer(TenantModelSerializer):
    nom_complet = serializers.SerializerMethodField()

    class Meta:
        model = CarteFidelite
        fields = ['id', 'numero', 'nom', 'prenom', 'nom_complet', 'email',
                  'telephone', 'nationalite', 'points', 'niveau', 'actif',
                  'date_inscription', 'derniere_visite']

    def get_nom_complet(self, obj):
        return f'{obj.prenom} {obj.nom}'.strip()
