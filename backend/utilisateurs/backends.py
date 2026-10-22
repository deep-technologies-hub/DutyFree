from django.contrib.auth.backends import ModelBackend
from django.db.models import Q

from .models import Utilisateur


class TenantAuthBackend(ModelBackend):
    """
    - Avec `organisation` (code entreprise) : identifiant ou n° de caisse, mot de passe ou PIN.
    - Sans organisation : comptes plateforme uniquement (admin Django).
    """

    def authenticate(self, request, username=None, password=None, organisation=None, **kwargs):
        if not username or not password:
            return None
        if organisation:
            candidats = Utilisateur.objects.filter(
                Q(username__iexact=username) | Q(register_id__iexact=username),
                organisation__slug=organisation.strip().lower(),
            )
        else:
            candidats = Utilisateur.objects.filter(username=username, organisation__isnull=True)

        for user in candidats:
            if not self.user_can_authenticate(user):
                continue
            if user.check_password(password) or (organisation and user.check_pin(password)):
                return user
        # Coût constant pour limiter l'énumération de comptes par mesure du temps.
        Utilisateur().set_password(password)
        return None
