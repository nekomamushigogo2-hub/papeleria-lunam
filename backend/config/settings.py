"""
CONFIGURACIÓN DEL BACKEND — POS Papel y Luna (MVP 3)
=====================================================
Todo lo que cambia entre "mi computador" y "el servidor desplegado" se lee de
variables de entorno (ver .env.example). Así el mismo código corre en los dos lados:

  - Local:    sin variables -> SQLite (db.sqlite3) y DEBUG activo.
  - Render:   DATABASE_URL apunta a PostgreSQL, DEBUG=False, SECRET_KEY propia.
"""
import os
from datetime import timedelta
from pathlib import Path

import dj_database_url

BASE_DIR = Path(__file__).resolve().parent.parent


def env_bool(nombre, por_defecto=False):
    return os.environ.get(nombre, str(por_defecto)).lower() in ("1", "true", "yes", "si")


def env_lista(nombre, por_defecto=""):
    return [x.strip() for x in os.environ.get(nombre, por_defecto).split(",") if x.strip()]


SECRET_KEY = os.environ.get("SECRET_KEY", "dev-solo-local-cambiar-en-produccion")
DEBUG = env_bool("DEBUG", True)
ALLOWED_HOSTS = env_lista("ALLOWED_HOSTS", "localhost,127.0.0.1")
# Render expone el nombre del host en esta variable
if os.environ.get("RENDER_EXTERNAL_HOSTNAME"):
    ALLOWED_HOSTS.append(os.environ["RENDER_EXTERNAL_HOSTNAME"])

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",            # Django REST Framework: vistas que reciben/responden JSON
    "rest_framework_simplejwt",  # emite y valida los tokens JWT del login
    "corsheaders",               # deja que el frontend (otro dominio) llame a la API
    "pos",                       # nuestra app: modelos, controladores y rutas del POS
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",   # lo más arriba posible
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",  # sirve los estáticos del admin en producción
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# ---------- Base de datos ----------
# Sin DATABASE_URL se usa SQLite (desarrollo). En el despliegue se define
# DATABASE_URL=postgresql://usuario:clave@host:5432/base  (PostgreSQL).
DATABASES = {
    "default": dj_database_url.config(
        default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}",
        conn_max_age=600,
    )
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
]

# ---------- Idioma y zona horaria ----------
LANGUAGE_CODE = "es-co"
TIME_ZONE = "America/Bogota"   # los reportes por fecha usan el día de Colombia
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ---------- Django REST Framework ----------
REST_FRAMEWORK = {
    # Autenticación: el frontend manda "Authorization: Bearer <token>"
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    # Por defecto todo exige sesión iniciada; los permisos por rol se ponen en cada vista
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    # Solo JSON (sin la página navegable de DRF en producción)
    "DEFAULT_RENDERER_CLASSES": (
        "rest_framework.renderers.JSONRenderer",
        *(("rest_framework.renderers.BrowsableAPIRenderer",) if DEBUG else ()),
    ),
    "EXCEPTION_HANDLER": "pos.excepciones.manejador_errores",
}

SIMPLE_JWT = {
    # Un turno de caja: el token dura 10 horas; el refresh permite renovarlo por 7 días
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=10),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "AUTH_HEADER_TYPES": ("Bearer",),
}

# ---------- CORS ----------
# Local: cualquier origen (Live Server, file://, etc.).
# Producción: CORS_ALLOWED_ORIGINS=https://papeleria-lunam.vercel.app
CORS_ALLOWED_ORIGINS = env_lista("CORS_ALLOWED_ORIGINS")
CORS_ALLOW_ALL_ORIGINS = not CORS_ALLOWED_ORIGINS

if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")   # Render termina el HTTPS
    SESSION_COOKIE_SECURE = True   # cookies del panel /admin solo por HTTPS
    CSRF_COOKIE_SECURE = True
    STORAGES = {
        "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
        "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
    }
