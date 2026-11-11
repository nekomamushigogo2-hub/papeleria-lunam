"""Compras a proveedores (solo administrador)."""
from rest_framework import mixins, status, viewsets
from rest_framework.response import Response

from ..excepciones import ReglaNegocio
from ..models import Compra
from ..permisos import EsAdmin
from ..serializers import CompraEntradaSerializer, CompraSerializer
from ..services.compras import registrar_compra
from ..utilidades import leer_fecha


class CompraViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """
    GET  /api/compras/?proveedorId=&desde=&hasta=
    GET  /api/compras/{id}/
    POST /api/compras/  {proveedorId, items:[{productoId, cantidad, costo}]}
    """
    serializer_class = CompraSerializer
    permission_classes = [EsAdmin]

    def get_queryset(self):
        qs = Compra.objects.select_related("proveedor", "usuario").prefetch_related("items")
        p = self.request.query_params
        if p.get("proveedorId"):
            qs = qs.filter(proveedor_id=p["proveedorId"])
        try:
            if p.get("desde"):
                qs = qs.filter(fecha__date__gte=leer_fecha(p["desde"], "desde"))
            if p.get("hasta"):
                qs = qs.filter(fecha__date__lte=leer_fecha(p["hasta"], "hasta"))
        except ValueError as e:
            raise ReglaNegocio(str(e))
        return qs

    def create(self, request):
        entrada = CompraEntradaSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        compra = registrar_compra(request.user, entrada.validated_data)
        return Response(CompraSerializer(self.get_queryset().get(pk=compra.pk)).data,
                        status=status.HTTP_201_CREATED)
