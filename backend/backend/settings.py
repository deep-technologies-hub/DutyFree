from pathlib import Path
from datetime import timedelta
from decouple import config, Csv
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent

DEBUG = config('DEBUG', default=False, cast=bool)
SECRET_KEY = config('SECRET_KEY', default='django-insecure-dev-only' if DEBUG else '')
if not SECRET_KEY:
    raise ImproperlyConfigured("SECRET_KEY doit être défini en production (DEBUG=False).")

# Chemin de l'admin plateforme : à personnaliser en production (ex. 'gestion-x7k2/')
ADMIN_URL = config('ADMIN_URL', default='admin/')
ALLOWED_HOSTS = config('ALLOWED_HOSTS', default='localhost,127.0.0.1', cast=Csv())
CSRF_TRUSTED_ORIGINS = config('CSRF_TRUSTED_ORIGINS', default='', cast=Csv())

INSTALLED_APPS = [
    'daphne',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'channels',
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    'tenants',
    'utilisateurs',
    'stock',
    'ventes',
    'configuration',
    'fidelite',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'backend.urls'
TEMPLATES = [{'BACKEND': 'django.template.backends.django.DjangoTemplates', 'DIRS': [], 'APP_DIRS': True, 'OPTIONS': {'context_processors': ['django.template.context_processors.debug', 'django.template.context_processors.request', 'django.contrib.auth.context_processors.auth', 'django.contrib.messages.context_processors.messages']}}]
WSGI_APPLICATION = 'backend.wsgi.application'
ASGI_APPLICATION = 'backend.asgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}

if config('POSTGRES_DB', default=''):
    DATABASES['default'] = {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': config('POSTGRES_DB'),
        'USER': config('POSTGRES_USER', default='postgres'),
        'PASSWORD': config('POSTGRES_PASSWORD', default=''),
        'HOST': config('POSTGRES_HOST', default='localhost'),
        'PORT': config('POSTGRES_PORT', default='5432'),
        'CONN_MAX_AGE': 60,
    }

# Redis obligatoire en production multi-processus (WebSockets partagés entre workers)
REDIS_URL = config('REDIS_URL', default='')
if REDIS_URL:
    CHANNEL_LAYERS = {'default': {'BACKEND': 'channels_redis.core.RedisChannelLayer',
                                  'CONFIG': {'hosts': [REDIS_URL]}}}
    CACHES = {'default': {'BACKEND': 'django.core.cache.backends.redis.RedisCache',
                          'LOCATION': REDIS_URL, 'TIMEOUT': 300}}
else:
    CHANNEL_LAYERS = {'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}}
    CACHES = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache', 'TIMEOUT': 300}}

AUTH_USER_MODEL = 'utilisateurs.Utilisateur'
AUTHENTICATION_BACKENDS = ['utilisateurs.backends.TenantAuthBackend']
# L'identifiant n'est unique que par organisation (contrainte en base) : avertissement attendu.
SILENCED_SYSTEM_CHECKS = ['auth.W004']

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
]

LANGUAGE_CODE = 'fr-fr'
TIME_ZONE = 'Africa/Ouagadougou'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_DIRS = [BASE_DIR / 'static']
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'
DATA_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'utilisateurs.authentication.TenantJWTAuthentication',
    ),
    # Toute vue métier exige : utilisateur connecté + rattaché à une organisation
    # + abonnement valide pour les écritures (lecture seule sinon).
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
        'tenants.permissions.HasTenant',
        'tenants.permissions.SubscriptionActive',
    ),
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 50,
    'DEFAULT_FILTER_BACKENDS': ['rest_framework.filters.SearchFilter', 'rest_framework.filters.OrderingFilter'],
    # Nombre de reverse proxies devant Django (nginx = 1, + proxy TLS = 2) : sert à lire
    # l'IP réelle du client dans X-Forwarded-For pour la limitation de débit.
    'NUM_PROXIES': config('NUM_PROXIES', default=None, cast=lambda v: None if v in (None, '') else int(v)),
    'DEFAULT_THROTTLE_RATES': {
        'login': config('THROTTLE_LOGIN', default='20/min'),
        'inscription': config('THROTTLE_INSCRIPTION', default='10/hour'),
    },
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=config('JWT_ACCESS_MINUTES', default=120, cast=int)),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    # Un refresh token déjà utilisé est révoqué : un jeton volé ne sert qu'une fois.
    'BLACKLIST_AFTER_ROTATION': True,
    'UPDATE_LAST_LOGIN': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
}

CORS_ALLOWED_ORIGINS = config('CORS_ALLOWED_ORIGINS', default='http://localhost:80,http://localhost:81,http://localhost:82,http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176', cast=Csv())
CORS_ALLOW_CREDENTIALS = True

# ── Sécurité HTTPS (derrière un reverse proxy TLS) ───────────────────
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
USE_HTTPS = config('USE_HTTPS', default=False, cast=bool)
SESSION_COOKIE_SECURE = CSRF_COOKIE_SECURE = USE_HTTPS
SECURE_SSL_REDIRECT = config('SECURE_SSL_REDIRECT', default=False, cast=bool)
if USE_HTTPS:
    SECURE_HSTS_SECONDS = config('SECURE_HSTS_SECONDS', default=31536000, cast=int)
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'

# ── SaaS ──────────────────────────────────────────────────────────────
SAAS_NOM = config('SAAS_NOM', default='Duty Free Manager')
# URL publique de l'API (notifications et retours de paiement) et des frontends (liens des emails)
PUBLIC_URL = config('PUBLIC_URL', default='http://localhost:8000')
FRONTEND_URL = config('FRONTEND_URL', default='http://localhost:5173').rstrip('/')
CAISSE_URL = config('CAISSE_URL', default='http://localhost:5174').rstrip('/')
STOCK_URL = config('STOCK_URL', default='http://localhost:5175').rstrip('/')
SAAS_RAPPEL_JOURS = config('SAAS_RAPPEL_JOURS', default=7, cast=int)

# Paiement en ligne : 'simulateur' (local, sans Internet) ou 'cinetpay'
PAYMENT_PROVIDER = config('PAYMENT_PROVIDER', default='simulateur')
PAYMENT_SIMULATEUR_AUTORISE = config('PAYMENT_SIMULATEUR_AUTORISE', default=DEBUG or PAYMENT_PROVIDER == 'simulateur', cast=bool)
CINETPAY_API_KEY = config('CINETPAY_API_KEY', default='')
CINETPAY_SITE_ID = config('CINETPAY_SITE_ID', default='')
PASSWORD_RESET_TIMEOUT = 2 * 3600
SAAS_TRIAL_DAYS = config('SAAS_TRIAL_DAYS', default=14, cast=int)
SAAS_GRACE_DAYS = config('SAAS_GRACE_DAYS', default=5, cast=int)
SAAS_PAYMENT_INSTRUCTIONS = config(
    'SAAS_PAYMENT_INSTRUCTIONS',
    default="Réglez le montant par Mobile Money (Orange Money / Moov Money) ou virement en indiquant "
            "le numéro de facture en référence. L'abonnement est activé dès réception du paiement.",
)

# Configuration Email pour l'envoi des commandes fournisseurs
EMAIL_BACKEND = config('EMAIL_BACKEND', default='django.core.mail.backends.console.EmailBackend' if DEBUG else 'django.core.mail.backends.smtp.EmailBackend')
EMAIL_ASYNC = config('EMAIL_ASYNC', default=True, cast=bool)
EMAIL_TIMEOUT = 10
EMAIL_HOST = config('EMAIL_HOST', default='smtp.gmail.com')
EMAIL_PORT = config('EMAIL_PORT', default=587, cast=int)
EMAIL_HOST_USER = config('EMAIL_HOST_USER', default='')
EMAIL_HOST_PASSWORD = config('EMAIL_HOST_PASSWORD', default='')
EMAIL_USE_TLS = config('EMAIL_USE_TLS', default=True, cast=bool)
DEFAULT_FROM_EMAIL = config('DEFAULT_FROM_EMAIL', default='noreply@dutyfree.com')

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {'console': {'class': 'logging.StreamHandler'}},
    'root': {'handlers': ['console'], 'level': config('LOG_LEVEL', default='INFO')},
}
