"""Faltantes: productos que pidieron los clientes y no había."""
from django.utils import timezone
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..models import Faltante
from ..permisos import EsAdmin
from ..serializers import FaltanteSerializer
from ..services.reportes import faltantes_para_compras
from ..utilidades import normalizar_nombre


class FaltanteViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin,
                      mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """
    GET    /api/faltantes/?tipo=&proveedorId=&estado=   todos (proveedorId=ninguno -> sin proveedor)
    POST   /api/faltantes/                              todos: registrar
    POST   /api/faltantes/{id}/resolver/                todos
    POST   /api/faltantes/{id}/reabrir/                 admin
    DELETE /api/faltantes/{id}/                         admin
    GET    /api/faltantes/para-compras/                 pendientes agrupados por producto y proveedor
    """
    serializer_class = FaltanteSerializer

    def get_permissions(self):
        if self.action in ("destroy", "reabrir"):
            return [EsAdmin()]
        return [IsAuthenticated()]

    def get_queryset(self):
        qs = Faltante.objects.select_related("proveedor", "usuario", "producto")
        p = self.request.query_params
        if p.get("tipo"):
            qs = qs.filter(tipo=p["tipo"])
        if p.get("estado"):
            qs = qs.filter(estado=p["estado"])
        if p.get("proveedorId") == "ninguno":
            qs = qs.filter(proveedor__isnull=True)
        elif p.get("proveedorId"):
            qs = qs.filter(proveedor_id=p["proveedorId"])
        return qs

    def perform_create(self, serializer):
        serializer.save(usuario=self.request.user,
                        nombre_normalizado=normalizar_nombre(serializer.validated_data["descripcion"]))

    @action(detail=True, methods=["post"])
    def resolver(self, request, pk=None):
        faltante = self.get_object()
        faltante.estado = Faltante.RESUELTO
        faltante.resuelto_en = timezone.now()
        faltante.save(update_fields=["estado", "resuelto_en"])
        return Response(FaltanteSerializer(faltante).data)

    @action(detail=True, methods=["post"])
    def reabrir(self, request, pk=None):
        faltante = self.get_object()
        faltante.estado = Faltante.PENDIENTE
        faltante.resuelto_en = None
        faltante.save(update_fields=["estado", "resuelto_en"])
        return Response(FaltanteSerializer(faltante).data)

    @action(detail=False, methods=["get"], url_path="para-compras")
    def para_compras(self, request):
        return Response(faltantes_para_compras())
