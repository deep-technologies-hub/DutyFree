from django.db import transaction
from rest_framework import serializers
from tenants.mixins import TenantModelSerializer
from tenants.permissions import GESTION
from .models import Vente, LigneVente, Paiement, DonneesPassagers, arrondir

PRIX_PAR_DEVISE = {'XOF': 'prix_xof', 'EUR': 'prix_eur', 'USD': 'prix_usd'}


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
    quantite = serializers.IntegerField(min_value=1, max_value=10000)
    remise = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=0, max_value=100, default=0)

    class Meta:
        model = LigneVente
        exclude = ['vente']   # ← clé du fix
        # Montants fixés par le serveur à partir du catalogue : ceux du client sont ignorés.
        read_only_fields = ['prix_unitaire', 'total']

    def validate(self, attrs):
        if attrs.get('remise') and self.context['request'].user.role not in GESTION:
            raise serializers.ValidationError(
                {'remise': "Seul un administrateur ou un superviseur peut accorder une remise."})
        produit, devise = attrs['produit'], attrs.get('devise', 'XOF')
        attrs['prix_unitaire'] = getattr(produit, PRIX_PAR_DEVISE[devise])
        if not attrs['prix_unitaire']:
            raise serializers.ValidationError(
                {'devise': f"Prix en {devise} non renseigné pour le produit {produit.code}."})
        return attrs


class PaiementWriteSerializer(TenantModelSerializer):
    """Utilisé à la création — le champ 'vente' est injecté dans create()"""
    montant = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=0)
    montant_xof = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=0)
    monnaie_rendue = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=0, default=0)

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
        # Une vente arrive toujours « payée » : l'annulation passe par l'action dédiée.
        # Les montants sont recalculés par le serveur : ceux envoyés par la caisse sont ignorés.
        read_only_fields = ['caissier', 'statut', 'sous_total', 'remise_totale', 'total']

    def validate(self, attrs):
        if not attrs.get('lignes'):
            raise serializers.ValidationError({'lignes': 'Une vente doit contenir au moins un article.'})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        from configuration.models import Configuration
        lignes_data = validated_data.pop('lignes')
        paiements_data = validated_data.pop('paiements')
        cfg = Configuration.get(validated_data['organisation'])

        # Totaux de la vente = lignes converties dans la devise de la vente (via le XOF)
        lignes = [LigneVente(**l) for l in lignes_data]
        taux_vente = cfg.taux_vers_xof(validated_data.get('devise', 'XOF'))
        en_devise_vente = lambda montant, devise: montant * cfg.taux_vers_xof(devise) / taux_vente
        sous_total = arrondir(sum(en_devise_vente(l.montant_brut, l.devise) for l in lignes))
        total = arrondir(sum(en_devise_vente(l.calculer_total(), l.devise) for l in lignes))

        vente = Vente.objects.create(**validated_data, sous_total=sous_total,
                                     remise_totale=sous_total - total, total=total)

        for ligne in lignes:
            ligne.vente = vente
            ligne.save()

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
            from fidelite.models import MouvementFidelite

            # Calcul des points (basé sur le total en XOF)
            montant_xof = vente.total * taux_vente

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

    def to_representation(self, instance):
        # La caisse imprime le ticket à partir des montants enregistrés par le serveur
        return VenteSerializer(instance, context=self.context).data


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
