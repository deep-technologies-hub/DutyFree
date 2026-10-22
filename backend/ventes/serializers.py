from django.db import transaction
from rest_framework import serializers
from tenants.mixins import TenantModelSerializer
from .models import Vente, LigneVente, Paiement, DonneesPassagers


# ── Serializers de lecture ────────────────────────────────────────────

class PaiementSerializer(TenantModelSerializer):
    class Meta:
        model = Paiement
        fields = '__all__'


class LigneVenteSerializer(TenantModelSerializer):
    produit_nom = serializers.CharField(source='produit.nom', read_only=True)
    produit_nom_en = serializers.CharField(source='produit.nom_en', read_only=True)

    class Meta:
        model = LigneVente
        fields = '__all__'


# ── Serializers d'écriture (sans le champ FK "vente") ─────────────────

class LigneVenteWriteSerializer(TenantModelSerializer):
    """Utilisé à la création — le champ 'vente' est injecté dans create()"""
    class Meta:
        model = LigneVente
        exclude = ['vente']   # ← clé du fix


class PaiementWriteSerializer(TenantModelSerializer):
    """Utilisé à la création — le champ 'vente' est injecté dans create()"""
    class Meta:
        model = Paiement
        exclude = ['vente']   # ← clé du fix


# ── Serializer de création vente ──────────────────────────────────────

class VenteCreateSerializer(TenantModelSerializer):
    lignes = LigneVenteWriteSerializer(many=True)
    paiements = PaiementWriteSerializer(many=True)

    class Meta:
        model = Vente
        fields = '__all__'
        read_only_fields = ['caissier']

    @transaction.atomic
    def create(self, validated_data):
        lignes_data = validated_data.pop('lignes')
        paiements_data = validated_data.pop('paiements')

        vente = Vente.objects.create(**validated_data)

        for l in lignes_data:
            LigneVente.objects.create(vente=vente, **l)

        for p in paiements_data:
            Paiement.objects.create(vente=vente, **p)

        # Décrémenter le stock via MouvementStock
        from stock.models import MouvementStock
        for ligne in vente.lignes.all():
            MouvementStock.objects.create(
                organisation=vente.organisation,
                produit=ligne.produit,
                type_mouvement='sortie',
                quantite=ligne.quantite,
                motif=f"Vente {vente.numero_ticket}",
                reference=vente.numero_ticket,
                utilisateur=vente.caissier,
            )

        # Gérer la fidélité
        if vente.carte_fidelite:
            from configuration.models import Configuration
            from fidelite.models import MouvementFidelite
            cfg = Configuration.get(vente.organisation)
            
            # Calcul des points (basé sur le total en XOF)
            # On suppose que si la devise n'est pas XOF, on convertit pour le calcul des points
            montant_xof = vente.total
            if vente.devise == 'EUR':
                montant_xof = vente.total * cfg.taux_eur_xof
            elif vente.devise == 'USD':
                montant_xof = vente.total * cfg.taux_usd_xof
            
            points_gagnes = round(float(montant_xof) * float(cfg.points_par_xof), 2)
            
            if points_gagnes > 0:
                solde_avant = vente.carte_fidelite.points
                vente.carte_fidelite.points = round(float(vente.carte_fidelite.points) + points_gagnes, 2)
                vente.carte_fidelite.derniere_visite = vente.date_locale
                vente.carte_fidelite.update_niveau()
                vente.carte_fidelite.save()
                
                MouvementFidelite.objects.create(
                    carte=vente.carte_fidelite,
                    type_mouvement='gain',
                    points=points_gagnes,
                    solde_avant=solde_avant,
                    solde_apres=vente.carte_fidelite.points,
                    reference_vente=vente.numero_ticket,
                    montant_achat_xof=montant_xof,
                    operateur=vente.caissier
                )

        from stock.signals import broadcast_new_sale
        transaction.on_commit(lambda: broadcast_new_sale(
            vente.organisation_id, vente.numero_caisse, vente.total, len(lignes_data)))
        return vente


# ── Serializers de lecture complète ───────────────────────────────────

class VenteSerializer(TenantModelSerializer):
    lignes = LigneVenteSerializer(many=True, read_only=True)
    paiements = PaiementSerializer(many=True, read_only=True)
    caissier_nom = serializers.CharField(source='caissier.full_name', read_only=True)

    class Meta:
        model = Vente
        fields = '__all__'


class VenteListSerializer(TenantModelSerializer):
    caissier_nom = serializers.CharField(source='caissier.full_name', read_only=True)
    nb_articles = serializers.IntegerField(source='lignes.count', read_only=True)
    lignes = LigneVenteSerializer(many=True, read_only=True)
    paiements = PaiementSerializer(many=True, read_only=True)

    class Meta:
        model = Vente
        fields = [
            'id', 'numero_ticket', 'caissier_nom', 'numero_caisse',
            'total', 'devise', 'statut', 'date_locale', 'passager_nom',
            'vol_reference', 'destination', 'synced', 'nb_articles',
            'lignes', 'paiements',
        ]


class DonneesPassagersSerializer(TenantModelSerializer):
    class Meta:
        model = DonneesPassagers
        fields = '__all__'
        read_only_fields = ['saisie_par']
