"""
MANEJO CENTRAL DE ERRORES
=========================
Todas las respuestas de error salen con la misma forma, para que el frontend
siempre pueda mostrar `detail`:

    { "detail": "Stock insuficiente de \"Lápiz\": hay 2 y pides 5." }
"""
from django.db.models import ProtectedError
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler


class ReglaNegocio(Exception):
    """Error de una regla del POS (stock negativo, descuento inválido...). -> 400"""

    def __init__(self, mensaje, codigo=status.HTTP_400_BAD_REQUEST):
        super().__init__(mensaje)
        self.mensaje = mensaje
        self.codigo = codigo


def _primer_mensaje(datos):
    """Saca un texto legible de los errores de validación de DRF."""
    if isinstance(datos, list) and datos:
        return _primer_mensaje(datos[0])
    if isinstance(datos, dict) and datos:
        campo, valor = next(iter(datos.items()))
        texto = _primer_mensaje(valor)
        return texto if campo in ("detail", "non_field_errors") else f"{campo}: {texto}"
    return str(datos)


def manejador_errores(exc, context):
    if isinstance(exc, ReglaNegocio):
        return Response({"detail": exc.mensaje}, status=exc.codigo)

    if isinstance(exc, ProtectedError):
        return Response(
            {"detail": "No se puede eliminar: tiene registros asociados."},
            status=status.HTTP_409_CONFLICT,
        )

    respuesta = exception_handler(exc, context)
    if respuesta is not None and not (isinstance(respuesta.data, dict) and set(respuesta.data) == {"detail"}):
        respuesta.data = {"detail": _primer_mensaje(respuesta.data), "errores": respuesta.data}
    return respuesta
