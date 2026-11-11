"""Autenticación: login (JWT), refresco del token y datos del usuario actual."""
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView

from ..permisos import rol_de
from ..serializers import nombre_usuario


def datos_usuario(u):
    return {"id": u.id, "username": u.username, "nombre": nombre_usuario(u), "rol": rol_de(u)}


class LoginSerializer(TokenObtainPairSerializer):
    """Además de los tokens devuelve quién es el usuario y su rol."""
    default_error_messages = {"no_active_account": "Usuario o contraseña incorrectos."}

    def validate(self, attrs):
        datos = super().validate(attrs)
        if not rol_de(self.user):
            raise AuthenticationFailed("El usuario no tiene un rol asignado en el POS.")
        datos["usuario"] = datos_usuario(self.user)
        return datos


class LoginView(TokenObtainPairView):
    """POST /api/auth/login/  {username, password} -> {access, refresh, usuario}"""
    serializer_class = LoginSerializer


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def yo(request):
    """GET /api/auth/yo/ -> usuario dueño del token (sirve para validar la sesión guardada)."""
    return Response(datos_usuario(request.user))
