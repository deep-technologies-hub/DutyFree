from .permissions import PlanLimitReached

LIBELLES = {
    'utilisateurs': 'utilisateurs actifs',
    'produits': 'produits actifs',
    'caisses': 'caisses',
}


def verifier_quota(organisation, ressource, increment=1):
    """Lève PlanLimitReached si l'ajout de `increment` dépasse la limite du plan."""
    limite = getattr(organisation.plan, f'max_{ressource}')
    if limite is None:
        return
    usage = organisation.usage()[ressource]
    if usage + increment > limite:
        raise PlanLimitReached(
            f"Limite du plan {organisation.plan.nom} atteinte : {limite} {LIBELLES[ressource]} maximum. "
            "Passez à un plan supérieur depuis la page Abonnement."
        )


def verifier_quota_caisse(organisation, role, register_id):
    """Une nouvelle caisse n'est comptée que si son identifiant n'existe pas encore."""
    if role != 'caissier' or not register_id:
        return
    if organisation.utilisateurs.filter(is_active=True, role='caissier', register_id__iexact=register_id).exists():
        return
    verifier_quota(organisation, 'caisses')
