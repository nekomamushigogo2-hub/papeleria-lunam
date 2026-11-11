"""
SERIALIZADORES (traducción modelo <-> JSON)
===========================================
Convierten los objetos de la base de datos en JSON para el frontend y validan el
JSON que llega. Los nombres de campo salen en camelCase (clienteId, metodoPago...)
igual que en la Guía P2.2 que usaba el frontend con Google Sheets, así el
frontend cambió lo mínimo.
"""
from rest_framework import serializers

from .models import (
    Categoria, Cliente, Compra, Descuento, Faltante, ItemCompra, ItemReembolso,
    ItemVenta, Producto, Proveedor, Reembolso, Venta,
)


def nombre_usuario(u):
    if not u:
        return None
    return u.get_full_name() or u.username


# ---------------------------------------------------------------------------
# Entidades simples (CRUD)
# ---------------------------------------------------------------------------
class CategoriaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Categoria
        fields = ["id", "nombre"]

    def validate_nombre(self, valor):
        valor = valor.strip()
        repetida = Categoria.objects.filter(nombre__iexact=valor).exclude(pk=getattr(self.instance, "pk", None))
        if repetida.exists():
            raise serializers.ValidationError(f'Ya existe la categoría "{valor}".')
        return valor


class ClienteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Cliente
        fields = ["id", "nombre", "telefono", "correo"]


class ProveedorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Proveedor
        fields = ["id", "nombre", "nit", "telefono", "correo"]


class ProductoSerializer(serializers.ModelSerializer):
    categoriaId = serializers.PrimaryKeyRelatedField(source="categoria", queryset=Categoria.objects.all())
    categoriaNombre = serializers.CharField(source="categoria.nombre", read_only=True)
    seguimientoInventario = serializers.BooleanField(source="seguimiento_inventario", required=False)
    codigo = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=40)

    class Meta:
        model = Producto
        fields = ["id", "nombre", "codigo", "categoriaId", "categoriaNombre",
                  "precio", "costo", "seguimientoInventario", "stock"]
        extra_kwargs = {"nombre": {"validators": []}}   # la unicidad se valida abajo, sin importar mayúsculas

    def validate_nombre(self, valor):
        valor = valor.strip()
        if not valor:
            raise serializers.ValidationError("El nombre es obligatorio.")
        if Producto.objects.filter(nombre__iexact=valor).exclude(pk=getattr(self.instance, "pk", None)).exists():
            raise serializers.ValidationError(f'Ya existe un producto llamado "{valor}".')
        return valor

    def validate_codigo(self, valor):
        valor = (valor or "").strip() or None   # "" se guarda como NULL (varios productos sin código)
        if valor and Producto.objects.filter(codigo__iexact=valor).exclude(pk=getattr(self.instance, "pk", None)).exists():
            raise serializers.ValidationError(f'El código "{valor}" ya está en uso.')
        return valor

    def validate_precio(self, valor):
        if valor <= 0:
            raise serializers.ValidationError("El precio debe ser mayor que 0.")
        return valor

    def validate_stock(self, valor):
        if valor < 0:
            raise serializers.ValidationError("El stock no puede ser negativo.")
        return valor


class DescuentoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Descuento
        fields = ["id", "nombre", "tipo", "valor"]

    def validate(self, datos):
        tipo = datos.get("tipo", getattr(self.instance, "tipo", None))
        valor = datos.get("valor", getattr(self.instance, "valor", None))
        if valor is not None and valor <= 0:
            raise serializers.ValidationError("El valor del descuento debe ser mayor que 0.")
        if tipo == Descuento.PORCENTAJE and valor is not None and valor > 100:
            raise serializers.ValidationError("Un descuento porcentual no puede superar el 100 %.")
        return datos


# ---------------------------------------------------------------------------
# Ventas (salida)
# ---------------------------------------------------------------------------
class ItemVentaSerializer(serializers.ModelSerializer):
    productoId = serializers.IntegerField(source="producto_id", read_only=True)
    cantidadReembolsada = serializers.IntegerField(source="cantidad_reembolsada", read_only=True)

    class Meta:
        model = ItemVenta
        fields = ["id", "productoId", "nombre", "precio", "costo", "cantidad", "subtotal", "cantidadReembolsada"]


class ItemReembolsoSerializer(serializers.ModelSerializer):
    itemId = serializers.IntegerField(source="item_venta_id")
    nombre = serializers.CharField(source="item_venta.nombre")
    retornaInventario = serializers.BooleanField(source="retorna_inventario")

    class Meta:
        model = ItemReembolso
        fields = ["itemId", "nombre", "cantidad", "valor", "retornaInventario"]


class ReembolsoSerializer(serializers.ModelSerializer):
    ventaId = serializers.IntegerField(source="venta_id")
    usuario = serializers.SerializerMethodField()
    items = ItemReembolsoSerializer(many=True)

    class Meta:
        model = Reembolso
        fields = ["id", "ventaId", "fecha", "usuario", "total", "motivo", "items"]

    def get_usuario(self, obj):
        return nombre_usuario(obj.usuario)


class VentaSerializer(serializers.ModelSerializer):
    fechaCierre = serializers.DateTimeField(source="fecha_cierre")
    clienteId = serializers.IntegerField(source="cliente_id")
    clienteNombre = serializers.SerializerMethodField()
    metodoPago = serializers.CharField(source="metodo_pago")
    valorDescuento = serializers.IntegerField(source="valor_descuento")
    valorRecibido = serializers.IntegerField(source="valor_recibido")
    descuentoId = serializers.IntegerField(source="descuento_id")
    descuentoNombre = serializers.CharField(source="descuento_nombre")
    descuentoTipo = serializers.CharField(source="descuento_tipo")
    descuentoValor = serializers.IntegerField(source="descuento_valor")
    creadaPor = serializers.SerializerMethodField()
    cerradaPor = serializers.SerializerMethodField()
    corregidaPor = serializers.SerializerMethodField()
    corregidaEn = serializers.DateTimeField(source="corregida_en")
    totalReembolsado = serializers.IntegerField(source="total_reembolsado")
    estadoReembolso = serializers.CharField(source="estado_reembolso")
    items = ItemVentaSerializer(many=True)
    reembolsos = ReembolsoSerializer(many=True)

    class Meta:
        model = Venta
        fields = ["id", "fecha", "fechaCierre", "estado", "clienteId", "clienteNombre", "metodoPago",
                  "subtotal", "valorDescuento", "total", "valorRecibido", "cambio",
                  "descuentoId", "descuentoNombre", "descuentoTipo", "descuentoValor",
                  "creadaPor", "cerradaPor", "corregida", "corregidaPor", "corregidaEn",
                  "totalReembolsado", "estadoReembolso", "items", "reembolsos"]
        read_only_fields = fields

    def get_clienteNombre(self, obj):
        return obj.cliente.nombre if obj.cliente else None

    def get_creadaPor(self, obj):
        return nombre_usuario(obj.creada_por)

    def get_cerradaPor(self, obj):
        return nombre_usuario(obj.cerrada_por)

    def get_corregidaPor(self, obj):
        return nombre_usuario(obj.corregida_por)


# ---------------------------------------------------------------------------
# Ventas (entrada): solo se reciben ids y cantidades; los precios y totales
# los calcula el backend con los datos de la base.
# ---------------------------------------------------------------------------
class LineaEntradaSerializer(serializers.Serializer):
    productoId = serializers.IntegerField()
    cantidad = serializers.IntegerField(min_value=1, error_messages={"min_value": "La cantidad debe ser al menos 1."})


class VentaEntradaSerializer(serializers.Serializer):
    estado = serializers.ChoiceField(choices=[Venta.ABIERTA, Venta.CERRADA], default=Venta.ABIERTA)
    items = LineaEntradaSerializer(many=True)
    clienteId = serializers.IntegerField(required=False, allow_null=True)
    metodoPago = serializers.ChoiceField(choices=[m for m, _ in Venta.METODOS], default=Venta.EFECTIVO)
    descuentoId = serializers.IntegerField(required=False, allow_null=True)
    valorRecibido = serializers.IntegerField(required=False, allow_null=True, min_value=0)


class CorreccionEntradaSerializer(serializers.Serializer):
    items = LineaEntradaSerializer(many=True)
    clienteId = serializers.IntegerField(required=False, allow_null=True)
    metodoPago = serializers.ChoiceField(choices=[m for m, _ in Venta.METODOS])
    # Ausente = conservar el descuento que ya tenía la venta; null = quitarlo
    descuentoId = serializers.IntegerField(required=False, allow_null=True)
    valorRecibido = serializers.IntegerField(required=False, allow_null=True, min_value=0)


class LineaReembolsoEntradaSerializer(serializers.Serializer):
    itemId = serializers.IntegerField()
    cantidad = serializers.IntegerField(min_value=1, error_messages={"min_value": "La cantidad a reembolsar debe ser al menos 1."})
    retornaInventario = serializers.BooleanField(default=True)


class ReembolsoEntradaSerializer(serializers.Serializer):
    items = LineaReembolsoEntradaSerializer(many=True)
    motivo = serializers.CharField(required=False, allow_blank=True, max_length=200, default="")


# ---------------------------------------------------------------------------
# Compras
# ---------------------------------------------------------------------------
class ItemCompraSerializer(serializers.ModelSerializer):
    productoId = serializers.IntegerField(source="producto_id", read_only=True)

    class Meta:
        model = ItemCompra
        fields = ["id", "productoId", "nombre", "cantidad", "costo", "subtotal"]


class CompraSerializer(serializers.ModelSerializer):
    proveedorId = serializers.IntegerField(source="proveedor_id")
    proveedorNombre = serializers.CharField(source="proveedor.nombre")
    usuario = serializers.SerializerMethodField()
    items = ItemCompraSerializer(many=True)

    class Meta:
        model = Compra
        fields = ["id", "fecha", "proveedorId", "proveedorNombre", "total", "usuario", "items"]
        read_only_fields = fields

    def get_usuario(self, obj):
        return nombre_usuario(obj.usuario)


class LineaCompraEntradaSerializer(serializers.Serializer):
    productoId = serializers.IntegerField()
    cantidad = serializers.IntegerField(min_value=1, error_messages={"min_value": "La cantidad debe ser al menos 1."})
    costo = serializers.IntegerField(min_value=0, error_messages={"min_value": "El costo no puede ser negativo."})


class CompraEntradaSerializer(serializers.Serializer):
    proveedorId = serializers.IntegerField()
    items = LineaCompraEntradaSerializer(many=True)


# ---------------------------------------------------------------------------
# Faltantes
# ---------------------------------------------------------------------------
class FaltanteSerializer(serializers.ModelSerializer):
    productoId = serializers.PrimaryKeyRelatedField(
        source="producto", queryset=Producto.objects.all(), required=False, allow_null=True)
    proveedorId = serializers.PrimaryKeyRelatedField(
        source="proveedor", queryset=Proveedor.objects.all(), required=False, allow_null=True)
    proveedorNombre = serializers.SerializerMethodField()
    nombreNormalizado = serializers.CharField(source="nombre_normalizado", read_only=True)
    usuario = serializers.SerializerMethodField()
    resueltoEn = serializers.DateTimeField(source="resuelto_en", read_only=True)
    descripcion = serializers.CharField(required=False, allow_blank=True, max_length=120)

    class Meta:
        model = Faltante
        fields = ["id", "productoId", "descripcion", "nombreNormalizado", "cantidad", "fecha", "tipo",
                  "proveedorId", "proveedorNombre", "observacion", "estado", "usuario", "resueltoEn"]
        read_only_fields = ["fecha", "estado", "usuario", "resueltoEn"]

    def get_proveedorNombre(self, obj):
        return obj.proveedor.nombre if obj.proveedor else None

    def get_usuario(self, obj):
        return nombre_usuario(obj.usuario)

    def validate_cantidad(self, valor):
        if valor < 1:
            raise serializers.ValidationError("La cantidad solicitada debe ser al menos 1.")
        return valor

    def validate(self, datos):
        producto = datos.get("producto")
        descripcion = (datos.get("descripcion") or "").strip()
        if not producto and not descripcion:
            raise serializers.ValidationError("Indica el producto o descríbelo en texto.")
        if datos.get("tipo") == Faltante.AGOTADO and not producto:
            raise serializers.ValidationError("Un faltante 'agotado' debe referirse a un producto existente.")
        datos["descripcion"] = producto.nombre if producto else descripcion
        return datos
