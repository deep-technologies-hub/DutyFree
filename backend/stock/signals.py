from django.db.models.signals import post_save
from django.dispatch import receiver
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer


def groupe_organisation(organisation_id):
    """Groupe WebSocket propre à chaque organisation (aucune fuite entre clients)."""
    return f'stock_org_{organisation_id}'


def _broadcast(organisation_id, message):
    try:
        channel_layer = get_channel_layer()
        if channel_layer is None:
            return
        async_to_sync(channel_layer.group_send)(groupe_organisation(organisation_id), message)
    except Exception:
        pass  # Ne pas bloquer si Redis/Channels indisponible


def broadcast_stock_update(organisation_id, produit_id, stock, mouvement_type=None):
    """Envoie une mise à jour de stock aux clients WebSocket de l'organisation."""
    _broadcast(organisation_id, {
        'type': 'stock_update',
        'produit_id': produit_id,
        'stock': stock,
        'mouvement': mouvement_type,
    })


def broadcast_alert(organisation_id, message, level='warning', produit_id=None):
    _broadcast(organisation_id, {'type': 'alert', 'level': level, 'message': message, 'produit_id': produit_id})


def broadcast_new_sale(organisation_id, caisse, total, items):
    _broadcast(organisation_id, {'type': 'new_sale', 'caisse': caisse, 'total': float(total), 'items': items})


@receiver(post_save, sender='stock.MouvementStock')
def on_mouvement_stock(sender, instance, created, **kwargs):
    if not created:
        return
    produit = instance.produit
    org_id = instance.organisation_id
    broadcast_stock_update(org_id, produit.id, produit.stock, instance.type_mouvement)
    # Alerte rupture
    if produit.stock <= produit.stock_min:
        broadcast_alert(
            org_id,
            f"Stock critique : {produit.nom} ({produit.stock} unités restantes)",
            level='danger',
            produit_id=produit.id,
        )
    elif produit.stock <= produit.stock_min * 1.5:
        broadcast_alert(
            org_id,
            f"Stock faible : {produit.nom} ({produit.stock} unités)",
            level='warning',
            produit_id=produit.id,
        )
