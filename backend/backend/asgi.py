import os
from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

# Initialise Django avant d'importer le code qui dépend des modèles.
django_asgi_app = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402
from .routing import websocket_urlpatterns  # noqa: E402
from .ws_auth import JWTAuthMiddleware  # noqa: E402

application = ProtocolTypeRouter({
    'http': django_asgi_app,
    # Auth par jeton (pas de cookie) : pas de risque CSWSH, donc pas de filtrage d'Origin.
    'websocket': JWTAuthMiddleware(URLRouter(websocket_urlpatterns)),
})
