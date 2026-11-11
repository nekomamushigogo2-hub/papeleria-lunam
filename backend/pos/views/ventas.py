"""Ventas: crear/guardar/retomar/cerrar, historial, corrección y reembolsos."""
from django.db.models import Prefetch
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from ..excepciones import ReglaNegocio
from ..models import ItemVenta, Reembolso, Venta
from ..permisos import EsAdmin
from ..serializers import (
    CorreccionEntradaSerializer, ReembolsoEntradaSerializer, ReembolsoSerializer,
    VentaEntradaSerializer, VentaSerializer,
)
from ..services import ventas as servicio
from ..utilidades import leer_fecha


def consulta_ventas():
    """Trae ventas con todo lo que el serializador necesita en pocas consultas."""
    return (Venta.objects
            .select_related("cliente", "creada_por", "cerrada_por", "corregida_por")
            .prefetch_related(
                Prefetch("items", queryset=ItemVenta.objects.prefetch_related("reembolsado")),
                Prefetch("reembolsos", queryset=Reembolso.objects.select_related("usuario")
                         .prefetch_related("items__item_venta")),
            ))


class VentaViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """
    GET    /api/ventas/?estado=&desde=&hasta=&metodoPago=&clienteId=
    GET    /api/ventas/{id}/
    POST   /api/ventas/                 crea (estado "abierta" o "cerrada")
    PUT    /api/ventas/{id}/            actualiza una abierta (o la cierra con estado "cerrada")
    DELETE /api/ventas/{id}/            descarta una venta ABIERTA (las cerradas no se eliminan)
    POST   /api/ventas/{id}/corregir/   admin
    GET    /api/ventas/{id}/reembolsos/ todos · POST admin
    """
    serializer_class = VentaSerializer

    def get_permissions(self):
        if self.action in ("corregir", "reembolsos") and self.request.method == "POST":
            return [EsAdmin()]
        return super().get_permissions()

    def get_queryset(self):
        qs = consulta_ventas()
        p = self.request.query_params
        if p.get("estado"):
            qs = qs.filter(estado=p["estado"])
        if p.get("metodoPago"):
            qs = qs.filter(metodo_pago=p["metodoPago"])
        if p.get("clienteId"):
            qs = qs.filter(cliente_id=p["clienteId"])
        try:
            if p.get("desde"):
                qs = qs.filter(fecha__date__gte=leer_fecha(p["desde"], "desde"))
            if p.get("hasta"):
                qs = qs.filter(fecha__date__lte=leer_fecha(p["hasta"], "hasta"))
        except ValueError as e:
            raise ReglaNegocio(str(e))
        return qs

    def _responder(self, venta, codigo=status.HTTP_200_OK):
        return Response(VentaSerializer(consulta_ventas().get(pk=venta.pk)).data, status=codigo)

    def create(self, request):
        entrada = VentaEntradaSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        venta = servicio.guardar_venta(request.user, entrada.validated_data)
        return self._responder(venta, status.HTTP_201_CREATED)

    def update(self, request, pk=None):
        entrada = VentaEntradaSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        venta = servicio.guardar_venta(request.user, entrada.validated_data, venta=self.get_object())
        return self._responder(venta)

    def destroy(self, request, pk=None):
        venta = self.get_object()
        if venta.estado != Venta.ABIERTA:
            raise ReglaNegocio("Las ventas cerradas no se eliminan. Usa corrección o reembolso.", 409)
        venta.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def corregir(self, request, pk=None):
        entrada = CorreccionEntradaSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        datos = dict(entrada.validated_data)
        if "descuentoId" not in request.data:      # ausente = conservar el descuento
            datos.pop("descuentoId", None)
        venta = servicio.corregir_venta(request.user, self.get_object(), datos)
        return self._responder(venta)

    @action(detail=True, methods=["get", "post"])
    def reembolsos(self, request, pk=None):
        venta = self.get_object()
        if request.method == "GET":
            return Response(ReembolsoSerializer(venta.reembolsos.all(), many=True).data)
        entrada = ReembolsoEntradaSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        reembolso = servicio.reembolsar(request.user, venta, entrada.validated_data)
        return Response({
            "reembolso": ReembolsoSerializer(reembolso).data,
            "venta": VentaSerializer(consulta_ventas().get(pk=venta.pk)).data,
        }, status=status.HTTP_201_CREATED)
