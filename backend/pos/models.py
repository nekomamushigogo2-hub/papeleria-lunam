"""
MODELOS (capa de datos)
=======================
Cada clase es una tabla en la base de datos. Django genera el SQL a partir de
estas clases (ver backend/sql/ para el script SQL equivalente).

Reglas de integridad que se resuelven AQUÍ, en la base de datos:
  - on_delete=PROTECT: no se puede borrar una categoría con productos, un cliente
    con ventas, ni un proveedor con compras (la BD lanza ProtectedError).
  - Las líneas de venta y de compra van en tablas de detalle (ItemVenta, ItemCompra),
    no como JSON en una columna.
  - Las líneas guardan una copia del nombre y el precio del producto: si mañana el
    producto cambia de precio, la factura de ayer no cambia.
"""
from django.conf import settings
from django.db import models

Usuario = settings.AUTH_USER_MODEL


# ---------------------------------------------------------------------------
# Usuarios y roles
# ---------------------------------------------------------------------------
class Perfil(models.Model):
    """Extiende al usuario de Django con el rol del POS (uno a uno)."""
    ADMIN = "admin"
    CAJERO = "cajero"
    ROLES = [(ADMIN, "Administrador"), (CAJERO, "Cajero")]

    usuario = models.OneToOneField(Usuario, on_delete=models.CASCADE, related_name="perfil")
    rol = models.CharField(max_length=10, choices=ROLES, default=CAJERO)

    class Meta:
        db_table = "perfiles"

    def __str__(self):
        return f"{self.usuario.username} ({self.rol})"


# ---------------------------------------------------------------------------
# Entidades de negocio
# ---------------------------------------------------------------------------
class Categoria(models.Model):
    nombre = models.CharField(max_length=80, unique=True)

    class Meta:
        db_table = "categorias"
        ordering = ["nombre"]

    def __str__(self):
        return self.nombre


class Cliente(models.Model):
    nombre = models.CharField(max_length=120)
    telefono = models.CharField(max_length=30, blank=True, default="")
    correo = models.EmailField(blank=True, default="")

    class Meta:
        db_table = "clientes"
        ordering = ["nombre"]

    def __str__(self):
        return self.nombre


class Proveedor(models.Model):
    nombre = models.CharField(max_length=120)
    nit = models.CharField(max_length=30, blank=True, default="")
    telefono = models.CharField(max_length=30, blank=True, default="")
    correo = models.EmailField(blank=True, default="")

    class Meta:
        db_table = "proveedores"
        ordering = ["nombre"]

    def __str__(self):
        return self.nombre


class Producto(models.Model):
    nombre = models.CharField(max_length=120, unique=True)
    codigo = models.CharField(max_length=40, unique=True, null=True, blank=True)
    categoria = models.ForeignKey(Categoria, on_delete=models.PROTECT, related_name="productos")
    precio = models.PositiveIntegerField()             # precio de venta (pesos, sin decimales)
    costo = models.PositiveIntegerField(default=0)     # precio de compra
    seguimiento_inventario = models.BooleanField(default=True)
    stock = models.IntegerField(default=0)

    class Meta:
        db_table = "productos"
        ordering = ["nombre"]
        constraints = [
            # Última barrera: la BD nunca acepta stock negativo
            models.CheckConstraint(condition=models.Q(stock__gte=0), name="producto_stock_no_negativo"),
        ]

    def __str__(self):
        return self.nombre


class Descuento(models.Model):
    """Catálogo reutilizable. Se aplica al TOTAL de la venta, nunca por producto."""
    PORCENTAJE = "porcentaje"
    VALOR = "valor"
    TIPOS = [(PORCENTAJE, "Porcentual"), (VALOR, "Valor fijo")]

    nombre = models.CharField(max_length=80, unique=True)
    tipo = models.CharField(max_length=12, choices=TIPOS)
    valor = models.PositiveIntegerField()   # 10 = 10 % o $10 según el tipo

    class Meta:
        db_table = "descuentos"
        ordering = ["nombre"]

    def __str__(self):
        return self.nombre


# ---------------------------------------------------------------------------
# Ventas
# ---------------------------------------------------------------------------
class Venta(models.Model):
    ABIERTA = "abierta"
    CERRADA = "cerrada"
    ESTADOS = [(ABIERTA, "Abierta"), (CERRADA, "Cerrada")]

    EFECTIVO, NEQUI, DEBE = "Efectivo", "Nequi", "Debe"
    METODOS = [(EFECTIVO, "Efectivo"), (NEQUI, "Nequi"), (DEBE, "Debe")]

    fecha = models.DateTimeField(auto_now_add=True)          # creación
    fecha_cierre = models.DateTimeField(null=True, blank=True)
    estado = models.CharField(max_length=10, choices=ESTADOS, default=ABIERTA)
    cliente = models.ForeignKey(Cliente, on_delete=models.PROTECT, null=True, blank=True, related_name="ventas")
    metodo_pago = models.CharField(max_length=10, choices=METODOS, default=EFECTIVO)

    # Totales (se recalculan en el backend, nunca se confía en lo que manda el navegador)
    subtotal = models.PositiveIntegerField(default=0)
    valor_descuento = models.PositiveIntegerField(default=0)
    total = models.PositiveIntegerField(default=0)
    valor_recibido = models.PositiveIntegerField(null=True, blank=True)
    cambio = models.PositiveIntegerField(null=True, blank=True)

    # Descuento aplicado: FK + copia de sus datos. Si el descuento se borra del
    # catálogo, la FK queda en NULL pero la venta conserva nombre/tipo/valor.
    descuento = models.ForeignKey(Descuento, on_delete=models.SET_NULL, null=True, blank=True, related_name="ventas")
    descuento_nombre = models.CharField(max_length=80, blank=True, default="")
    descuento_tipo = models.CharField(max_length=12, blank=True, default="")
    descuento_valor = models.PositiveIntegerField(default=0)

    # Trazabilidad
    creada_por = models.ForeignKey(Usuario, on_delete=models.PROTECT, related_name="ventas_creadas")
    cerrada_por = models.ForeignKey(Usuario, on_delete=models.PROTECT, null=True, blank=True, related_name="ventas_cerradas")
    corregida = models.BooleanField(default=False)
    corregida_por = models.ForeignKey(Usuario, on_delete=models.PROTECT, null=True, blank=True, related_name="ventas_corregidas")
    corregida_en = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "ventas"
        ordering = ["-fecha"]

    def __str__(self):
        return f"Venta #{self.pk} ({self.estado})"

    # Las propiedades recorren .all() (y no hacen aggregate) para aprovechar el
    # prefetch_related de las vistas: así el historial no hace una consulta por venta.
    @property
    def total_reembolsado(self):
        return sum(r.total for r in self.reembolsos.all())

    @property
    def estado_reembolso(self):
        """'ninguno' | 'parcial' | 'total' (total = se devolvió todo lo vendido)."""
        vendidas = sum(i.cantidad for i in self.items.all())
        devueltas = sum(i.cantidad_reembolsada for i in self.items.all())
        if devueltas == 0:
            return "ninguno"
        return "total" if devueltas >= vendidas else "parcial"


class ItemVenta(models.Model):
    venta = models.ForeignKey(Venta, on_delete=models.CASCADE, related_name="items")
    # SET_NULL: si el producto se elimina, la factura conserva el nombre copiado
    producto = models.ForeignKey(Producto, on_delete=models.SET_NULL, null=True, related_name="items_venta")
    nombre = models.CharField(max_length=120)
    precio = models.PositiveIntegerField()
    costo = models.PositiveIntegerField(default=0)
    cantidad = models.PositiveIntegerField()
    subtotal = models.PositiveIntegerField()

    class Meta:
        db_table = "items_venta"

    @property
    def cantidad_reembolsada(self):
        return sum(r.cantidad for r in self.reembolsado.all())


# ---------------------------------------------------------------------------
# Reembolsos
# ---------------------------------------------------------------------------
class Reembolso(models.Model):
    venta = models.ForeignKey(Venta, on_delete=models.PROTECT, related_name="reembolsos")
    fecha = models.DateTimeField(auto_now_add=True)
    usuario = models.ForeignKey(Usuario, on_delete=models.PROTECT, related_name="reembolsos")
    total = models.PositiveIntegerField()
    motivo = models.CharField(max_length=200, blank=True, default="")

    class Meta:
        db_table = "reembolsos"
        ordering = ["-fecha"]


class ItemReembolso(models.Model):
    reembolso = models.ForeignKey(Reembolso, on_delete=models.CASCADE, related_name="items")
    item_venta = models.ForeignKey(ItemVenta, on_delete=models.PROTECT, related_name="reembolsado")
    cantidad = models.PositiveIntegerField()
    valor = models.PositiveIntegerField()               # ya con el descuento proporcional
    retorna_inventario = models.BooleanField(default=True)

    class Meta:
        db_table = "items_reembolso"


# ---------------------------------------------------------------------------
# Compras
# ---------------------------------------------------------------------------
class Compra(models.Model):
    fecha = models.DateTimeField(auto_now_add=True)
    proveedor = models.ForeignKey(Proveedor, on_delete=models.PROTECT, related_name="compras")
    total = models.PositiveIntegerField(default=0)
    usuario = models.ForeignKey(Usuario, on_delete=models.PROTECT, related_name="compras")

    class Meta:
        db_table = "compras"
        ordering = ["-fecha"]


class ItemCompra(models.Model):
    compra = models.ForeignKey(Compra, on_delete=models.CASCADE, related_name="items")
    producto = models.ForeignKey(Producto, on_delete=models.SET_NULL, null=True, related_name="items_compra")
    nombre = models.CharField(max_length=120)
    cantidad = models.PositiveIntegerField()
    costo = models.PositiveIntegerField()
    subtotal = models.PositiveIntegerField()

    class Meta:
        db_table = "items_compra"


# ---------------------------------------------------------------------------
# Faltantes (demanda no atendida)
# ---------------------------------------------------------------------------
class Faltante(models.Model):
    INEXISTENTE = "inexistente"
    AGOTADO = "agotado"
    TIPOS = [(INEXISTENTE, "Producto inexistente"), (AGOTADO, "Agotado")]

    PENDIENTE = "pendiente"
    RESUELTO = "resuelto"
    ESTADOS = [(PENDIENTE, "Pendiente"), (RESUELTO, "Resuelto")]

    # Producto existente (agotado) o descrito en texto (inexistente)
    producto = models.ForeignKey(Producto, on_delete=models.SET_NULL, null=True, blank=True, related_name="faltantes")
    descripcion = models.CharField(max_length=120)
    # "Cofias" y "cofia" -> "cofia": sirve para agrupar en los reportes
    nombre_normalizado = models.CharField(max_length=120, db_index=True)
    cantidad = models.PositiveIntegerField(default=1)
    fecha = models.DateTimeField(auto_now_add=True)
    tipo = models.CharField(max_length=12, choices=TIPOS)
    proveedor = models.ForeignKey(Proveedor, on_delete=models.SET_NULL, null=True, blank=True, related_name="faltantes")
    observacion = models.CharField(max_length=200, blank=True, default="")
    estado = models.CharField(max_length=10, choices=ESTADOS, default=PENDIENTE)
    usuario = models.ForeignKey(Usuario, on_delete=models.PROTECT, related_name="faltantes")
    resuelto_en = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "faltantes"
        ordering = ["-fecha"]
