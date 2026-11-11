"""
LÓGICA DE NEGOCIO DE VENTAS (servicio)
======================================
Los controladores (views/) solo reciben la petición y responden; las reglas viven
aquí para que sea fácil leerlas y probarlas.

Cada operación que toca a la vez la venta y el inventario va dentro de
`transaction.atomic()`: si algo falla a mitad de camino (stock insuficiente, un
error de la base...), la base de datos deshace TODO y no quedan datos a medias.

`select_for_update()` bloquea las filas de los productos mientras dura la
transacción: si dos cajas venden el último cuaderno al mismo tiempo, la segunda
espera a la primera y luego ve el stock real (en PostgreSQL).
"""
from collections import OrderedDict

from django.db import transaction
from django.utils import timezone

from ..excepciones import ReglaNegocio
from ..models import Cliente, Descuento, ItemReembolso, ItemVenta, Producto, Reembolso, Venta


# ---------------------------------------------------------------------------
# Cálculos
# ---------------------------------------------------------------------------
def calcular_descuento(subtotal, tipo, valor):
    """Devuelve cuánto se descuenta. Nunca permite un total negativo."""
    if not tipo:
        return 0
    if tipo == Descuento.PORCENTAJE:
        return round(subtotal * valor / 100)
    if valor > subtotal:
        raise ReglaNegocio(
            f"El descuento de ${valor:,} deja el total negativo (subtotal ${subtotal:,}).".replace(",", "."))
    return valor


def _agrupar_lineas(items):
    """Suma cantidades si el mismo producto viene en dos líneas."""
    cantidades = OrderedDict()
    for linea in items:
        pid = linea["productoId"]
        cantidades[pid] = cantidades.get(pid, 0) + linea["cantidad"]
    return cantidades


def _bloquear_productos(ids):
    """Trae los productos con la fila bloqueada hasta el fin de la transacción."""
    productos = {p.id: p for p in Producto.objects.select_for_update().filter(id__in=ids)}
    faltan = set(ids) - set(productos)
    if faltan:
        raise ReglaNegocio(f"El producto con id {sorted(faltan)[0]} ya no existe. Recarga el catálogo.")
    return productos


def _obtener_cliente(cliente_id):
    if not cliente_id:
        return None
    try:
        return Cliente.objects.get(pk=cliente_id)
    except Cliente.DoesNotExist:
        raise ReglaNegocio("El cliente seleccionado no existe.")


def _obtener_descuento(descuento_id):
    if not descuento_id:
        return None
    try:
        return Descuento.objects.get(pk=descuento_id)
    except Descuento.DoesNotExist:
        raise ReglaNegocio("El descuento seleccionado ya no existe.")


def _aplicar_totales(venta, subtotal, metodo, valor_recibido):
    """Calcula descuento, total, recibido y cambio sobre la venta (sin guardar)."""
    venta.subtotal = subtotal
    venta.valor_descuento = calcular_descuento(subtotal, venta.descuento_tipo, venta.descuento_valor)
    venta.total = subtotal - venta.valor_descuento
    venta.metodo_pago = metodo
    if metodo == Venta.EFECTIVO and valor_recibido is not None:
        venta.valor_recibido = valor_recibido
        venta.cambio = max(0, valor_recibido - venta.total)
    else:
        venta.valor_recibido = None
        venta.cambio = None


def _poner_descuento(venta, descuento):
    venta.descuento = descuento
    venta.descuento_nombre = descuento.nombre if descuento else ""
    venta.descuento_tipo = descuento.tipo if descuento else ""
    venta.descuento_valor = descuento.valor if descuento else 0


def _validar_cierre(venta):
    if venta.metodo_pago == Venta.DEBE and not venta.cliente_id:
        raise ReglaNegocio("Para el método de pago Debe debes elegir un cliente.")
    if venta.metodo_pago == Venta.EFECTIVO:
        if venta.valor_recibido is None:
            raise ReglaNegocio("Ingresa el valor recibido en efectivo.")
        if venta.valor_recibido < venta.total:
            raise ReglaNegocio("El valor recibido no cubre el total.")


def _validar_stock(producto, nuevo_stock, pedido):
    if producto.seguimiento_inventario and nuevo_stock < 0:
        raise ReglaNegocio(
            f'Stock insuficiente de "{producto.nombre}": hay {producto.stock} y se necesitan {pedido}.')


# ---------------------------------------------------------------------------
# Crear / actualizar / cerrar una venta (abierta o directamente cerrada)
# ---------------------------------------------------------------------------
@transaction.atomic
def guardar_venta(usuario, datos, venta=None):
    """Crea una venta nueva o actualiza una abierta. Si datos['estado'] es
    'cerrada', además valida el pago y descuenta el inventario."""
    if venta is not None:
        venta = Venta.objects.select_for_update().get(pk=venta.pk)
        if venta.estado != Venta.ABIERTA:
            raise ReglaNegocio("Esta venta ya está cerrada. Para cambiarla usa 'Corregir venta'.")
    else:
        venta = Venta(creada_por=usuario)

    cantidades = _agrupar_lineas(datos["items"])
    if not cantidades:
        raise ReglaNegocio("Agrega al menos un producto a la venta.")

    productos = _bloquear_productos(list(cantidades))
    venta.cliente = _obtener_cliente(datos.get("clienteId"))
    _poner_descuento(venta, _obtener_descuento(datos.get("descuentoId")))

    # El precio sale de la base (lo que diga el navegador no cuenta)
    lineas = []
    subtotal = 0
    for pid, cantidad in cantidades.items():
        p = productos[pid]
        lineas.append(ItemVenta(producto=p, nombre=p.nombre, precio=p.precio, costo=p.costo,
                                cantidad=cantidad, subtotal=p.precio * cantidad))
        subtotal += p.precio * cantidad

    _aplicar_totales(venta, subtotal, datos.get("metodoPago", Venta.EFECTIVO), datos.get("valorRecibido"))

    cerrar = datos.get("estado") == Venta.CERRADA
    if cerrar:
        _validar_cierre(venta)
        for pid, cantidad in cantidades.items():
            p = productos[pid]
            _validar_stock(p, p.stock - cantidad, cantidad)
        for pid, cantidad in cantidades.items():
            p = productos[pid]
            if p.seguimiento_inventario:
                p.stock -= cantidad
                p.save(update_fields=["stock"])
        venta.estado = Venta.CERRADA
        venta.fecha_cierre = timezone.now()
        venta.cerrada_por = usuario

    venta.save()
    venta.items.all().delete()          # en una venta abierta se reemplazan las líneas
    for linea in lineas:
        linea.venta = venta
    ItemVenta.objects.bulk_create(lineas)
    return venta


# ---------------------------------------------------------------------------
# Corrección de una venta cerrada (solo administrador)
# ---------------------------------------------------------------------------
@transaction.atomic
def corregir_venta(usuario, venta, datos):
    """Modifica productos, cantidades, cliente, método de pago (y descuento) de una
    venta cerrada. El inventario se ajusta por la DIFERENCIA entre la venta
    original y la corregida. La venta conserva su id y queda marcada."""
    venta = Venta.objects.select_for_update().get(pk=venta.pk)
    if venta.estado != Venta.CERRADA:
        raise ReglaNegocio("Solo se pueden corregir ventas cerradas.")
    if venta.reembolsos.exists():
        raise ReglaNegocio("La venta tiene reembolsos registrados; ya no se puede corregir.")

    nuevas = _agrupar_lineas(datos["items"])
    if not nuevas:
        raise ReglaNegocio("La venta corregida debe tener al menos un producto.")

    originales = {}           # producto_id -> ItemVenta original
    for item in venta.items.all():
        if item.producto_id:
            originales[item.producto_id] = item

    productos = _bloquear_productos(list(set(nuevas) | set(originales)))

    # Diferencia de inventario: positivo = se vende más que antes (sale stock)
    for pid in set(nuevas) | set(originales):
        p = productos[pid]
        antes = originales[pid].cantidad if pid in originales else 0
        diferencia = nuevas.get(pid, 0) - antes
        if diferencia and p.seguimiento_inventario:
            _validar_stock(p, p.stock - diferencia, diferencia)
            p.stock -= diferencia
            p.save(update_fields=["stock"])

    # Líneas nuevas: si el producto ya estaba, conserva el precio con que se vendió
    lineas, subtotal = [], 0
    for pid, cantidad in nuevas.items():
        p = productos[pid]
        precio = originales[pid].precio if pid in originales else p.precio
        costo = originales[pid].costo if pid in originales else p.costo
        nombre = originales[pid].nombre if pid in originales else p.nombre
        lineas.append(ItemVenta(venta=venta, producto=p, nombre=nombre, precio=precio, costo=costo,
                                cantidad=cantidad, subtotal=precio * cantidad))
        subtotal += precio * cantidad

    venta.cliente = _obtener_cliente(datos.get("clienteId"))
    if "descuentoId" in datos:  # si no viene, se conserva el descuento original (aunque ya no exista en el catálogo)
        _poner_descuento(venta, _obtener_descuento(datos["descuentoId"]))
    _aplicar_totales(venta, subtotal, datos["metodoPago"], datos.get("valorRecibido"))
    _validar_cierre(venta)

    venta.corregida = True
    venta.corregida_por = usuario
    venta.corregida_en = timezone.now()
    venta.save()

    venta.items.all().delete()
    ItemVenta.objects.bulk_create(lineas)
    return venta


# ---------------------------------------------------------------------------
# Reembolsos parciales o totales (solo administrador)
# ---------------------------------------------------------------------------
def valor_proporcional(venta, precio, cantidad):
    """Si la venta tuvo descuento, cada peso reembolsado se reduce en la misma
    proporción: valor = precio × cantidad × (total / subtotal)."""
    if venta.subtotal == 0:
        return 0
    return round(precio * cantidad * venta.total / venta.subtotal)


@transaction.atomic
def reembolsar(usuario, venta, datos):
    venta = Venta.objects.select_for_update().get(pk=venta.pk)
    if venta.estado != Venta.CERRADA:
        raise ReglaNegocio("Solo se pueden reembolsar productos de ventas cerradas.")
    if not datos["items"]:
        raise ReglaNegocio("Selecciona al menos un producto a reembolsar.")

    items_venta = {i.id: i for i in venta.items.prefetch_related("reembolsado")}
    pedidos = OrderedDict()
    for linea in datos["items"]:
        if linea["itemId"] not in items_venta:
            raise ReglaNegocio("Uno de los productos no pertenece a esta venta.")
        if linea["itemId"] in pedidos:
            raise ReglaNegocio("Un producto aparece repetido en el reembolso.")
        pedidos[linea["itemId"]] = linea

    ids_producto = [items_venta[i].producto_id for i in pedidos if items_venta[i].producto_id]
    productos = {p.id: p for p in Producto.objects.select_for_update().filter(id__in=ids_producto)}

    ya_reembolsado = venta.total_reembolsado
    disponible_dinero = venta.total - ya_reembolsado
    reembolso = Reembolso.objects.create(venta=venta, usuario=usuario, total=0, motivo=datos.get("motivo", ""))

    total = 0
    queda_algo = False
    lineas = []
    for item_id, linea in pedidos.items():
        item = items_venta[item_id]
        disponible = item.cantidad - item.cantidad_reembolsada
        if linea["cantidad"] > disponible:
            raise ReglaNegocio(
                f'No puedes reembolsar {linea["cantidad"]} de "{item.nombre}": quedan {disponible} por reembolsar.')
        valor = valor_proporcional(venta, item.precio, linea["cantidad"])
        lineas.append([item, linea, valor])
        total += valor

        retorna = linea["retornaInventario"] and item.producto_id in productos
        if retorna and productos[item.producto_id].seguimiento_inventario:
            p = productos[item.producto_id]
            p.stock += linea["cantidad"]
            p.save(update_fields=["stock"])

    # ¿Queda algo sin reembolsar en la venta después de este reembolso?
    for item in items_venta.values():
        pedido = pedidos[item.id]["cantidad"] if item.id in pedidos else 0
        if item.cantidad - item.cantidad_reembolsada - pedido > 0:
            queda_algo = True

    # Por redondeo, la suma de reembolsos podría pasarse o quedarse a $1 del total:
    # el último reembolso (el que deja la venta en cero) toma exactamente lo que falta.
    if not queda_algo:
        lineas[-1][2] = max(0, lineas[-1][2] + disponible_dinero - total)
        total = disponible_dinero
    elif total > disponible_dinero:
        raise ReglaNegocio("El valor a reembolsar supera lo que queda por devolver de la venta.")

    ItemReembolso.objects.bulk_create([
        ItemReembolso(reembolso=reembolso, item_venta=item, cantidad=linea["cantidad"],
                      valor=valor, retorna_inventario=linea["retornaInventario"])
        for item, linea, valor in lineas
    ])
    reembolso.total = total
    reembolso.save(update_fields=["total"])
    return reembolso
