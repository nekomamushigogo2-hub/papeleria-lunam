"""Reportes básicos (solo administrador). Reciben ?desde=AAAA-MM-DD&hasta=AAAA-MM-DD."""
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from ..excepciones import ReglaNegocio
from ..permisos import EsAdmin
from ..services import reportes
from ..utilidades import leer_fecha


def _rango(request, obligatorio=True):
    """Sin fechas -> hoy. Solo 'desde' -> ese día. Rango mínimo: 1 día (desde = hasta)."""
    p = request.query_params
    if not obligatorio and not p.get("desde") and not p.get("hasta"):
        return None, None
    try:
        desde = leer_fecha(p.get("desde") or str(timezone.localdate()), "desde")
        hasta = leer_fecha(p.get("hasta") or str(desde), "hasta")
    except ValueError as e:
        raise ReglaNegocio(str(e))
    if hasta < desde:
        raise ReglaNegocio("La fecha 'hasta' no puede ser anterior a 'desde'.")
    return desde, hasta


@api_view(["GET"])
@permission_classes([EsAdmin])
def ventas(request):
    """GET /api/reportes/ventas/ -> total vendido, número de ventas, por método y por día."""
    return Response(reportes.reporte_ventas(*_rango(request)))


@api_view(["GET"])
@permission_classes([EsAdmin])
def productos_mas_vendidos(request):
    """GET /api/reportes/productos-mas-vendidos/"""
    return Response(reportes.productos_mas_vendidos(*_rango(request)))


@api_view(["GET"])
@permission_classes([EsAdmin])
def compras(request):
    """GET /api/reportes/compras/ -> total comprado, número y por proveedor."""
    return Response(reportes.reporte_compras(*_rango(request)))


@api_view(["GET"])
@permission_classes([EsAdmin])
def faltantes(request):
    """GET /api/reportes/faltantes/ -> faltantes más solicitados (fechas opcionales)."""
    return Response(reportes.faltantes_frecuentes(*_rango(request, obligatorio=False)))
