"""
PERMISOS POR ROL (autorización)
===============================
- AUTENTICACIÓN (¿quién eres?): la hace JWTAuthentication con el header
  "Authorization: Bearer <token>". Sin token válido -> 401.
- AUTORIZACIÓN (¿qué puedes hacer?): estas clases. Token válido pero rol
  insuficiente -> 403.

La matriz de la sección 3.8 del documento P3.1 se aplica en cada vista con
estas dos clases.
"""
from rest_framework.permissions import SAFE_METHODS, BasePermission

from .models import Perfil


def rol_de(usuario):
    perfil = getattr(usuario, "perfil", None)
    return perfil.rol if perfil else None


def es_admin(usuario):
    return bool(usuario and usuario.is_authenticated and rol_de(usuario) == Perfil.ADMIN)


class EsAdmin(BasePermission):
    """Solo administradores (compras, correcciones, reembolsos, reportes...)."""
    message = "Esta acción es solo para el administrador."

    def has_permission(self, request, view):
        return es_admin(request.user)


class LecturaTodosEscrituraAdmin(BasePermission):
    """GET para cualquier usuario con sesión; crear/editar/eliminar solo admin.
    Ej.: el cajero consulta categorías y descuentos, pero no los modifica."""
    message = "Solo el administrador puede modificar este recurso."

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        return request.method in SAFE_METHODS or es_admin(request.user)
