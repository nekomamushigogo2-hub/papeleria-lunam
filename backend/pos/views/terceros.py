"""Clientes y proveedores."""
from rest_framework import viewsets

from ..models import Cliente, Proveedor
from ..permisos import LecturaTodosEscrituraAdmin
from ..serializers import ClienteSerializer, ProveedorSerializer


class ClienteViewSet(viewsets.ModelViewSet):
    """/api/clientes/ — CRUD para admin y cajero (matriz 3.8).
    Borrar un cliente con ventas -> 409 (PROTECT)."""
    queryset = Cliente.objects.all()
    serializer_class = ClienteSerializer


class ProveedorViewSet(viewsets.ModelViewSet):
    """/api/proveedores/ — el cajero puede consultarlos (para anotarlos en un
    faltante); crear/editar/eliminar es del admin. Con compras -> 409."""
    queryset = Proveedor.objects.all()
    serializer_class = ProveedorSerializer
    permission_classes = [LecturaTodosEscrituraAdmin]
