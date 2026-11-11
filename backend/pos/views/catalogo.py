"""Categorías, productos y descuentos (catálogo)."""
from rest_framework import viewsets
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated

from ..excepciones import ReglaNegocio
from ..models import Categoria, Descuento, Producto, Venta
from ..permisos import EsAdmin, LecturaTodosEscrituraAdmin, es_admin
from ..serializers import CategoriaSerializer, DescuentoSerializer, ProductoSerializer


class CategoriaViewSet(viewsets.ModelViewSet):
    """/api/categorias/  — GET todos; POST/PUT/DELETE solo admin.
    Borrar una categoría con productos -> 409 (on_delete=PROTECT)."""
    queryset = Categoria.objects.all()
    serializer_class = CategoriaSerializer
    permission_classes = [LecturaTodosEscrituraAdmin]


class DescuentoViewSet(viewsets.ModelViewSet):
    """/api/descuentos/ — el cajero los consulta para aplicarlos; solo el admin
    administra el catálogo. Borrar un descuento no altera las ventas (guardan copia)."""
    queryset = Descuento.objects.all()
    serializer_class = DescuentoSerializer
    permission_classes = [LecturaTodosEscrituraAdmin]


class ProductoViewSet(viewsets.ModelViewSet):
    """/api/productos/

    GET        -> todos
    POST       -> admin
    PATCH      -> admin: cualquier campo. Cajero: solo la edición en caliente
                  desde la venta (nombre, categoría, precio y costo).
    PUT/DELETE -> admin
    """
    queryset = Producto.objects.select_related("categoria")
    serializer_class = ProductoSerializer
    CAMPOS_EDICION_CALIENTE = {"nombre", "categoriaId", "precio", "costo"}

    def get_permissions(self):
        if self.action in ("list", "retrieve", "partial_update"):
            return [IsAuthenticated()]
        return [EsAdmin()]

    def partial_update(self, request, *args, **kwargs):
        if not es_admin(request.user):
            extra = set(request.data) - self.CAMPOS_EDICION_CALIENTE
            if extra:
                raise PermissionDenied(
                    "El cajero solo puede editar nombre, categoría, precio y costo desde la venta.")
        return super().partial_update(request, *args, **kwargs)

    def perform_destroy(self, producto):
        # Las ventas abiertas aún necesitan el producto para poder cerrarse
        if producto.items_venta.filter(venta__estado=Venta.ABIERTA).exists():
            raise ReglaNegocio("No se puede eliminar: el producto está en una venta abierta.", 409)
        producto.delete()
