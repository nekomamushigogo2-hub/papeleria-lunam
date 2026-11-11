"""
LÓGICA DE NEGOCIO DE COMPRAS
============================
Registrar una compra crea la compra, sus líneas y suma el stock en UNA sola
transacción: o queda todo, o no queda nada.
"""
from collections import OrderedDict

from django.db import transaction

from ..excepciones import ReglaNegocio
from ..models import Compra, ItemCompra, Producto, Proveedor


@transaction.atomic
def registrar_compra(usuario, datos):
    try:
        proveedor = Proveedor.objects.get(pk=datos["proveedorId"])
    except Proveedor.DoesNotExist:
        raise ReglaNegocio("El proveedor seleccionado no existe.")
    if not datos["items"]:
        raise ReglaNegocio("Agrega al menos un producto a la compra.")

    # Si el mismo producto viene dos veces se suman cantidades (con el último costo)
    lineas = OrderedDict()
    for linea in datos["items"]:
        previa = lineas.get(linea["productoId"])
        if previa:
            previa["cantidad"] += linea["cantidad"]
            previa["costo"] = linea["costo"]
        else:
            lineas[linea["productoId"]] = dict(linea)

    productos = {p.id: p for p in Producto.objects.select_for_update().filter(id__in=list(lineas))}
    if len(productos) != len(lineas):
        raise ReglaNegocio("Uno de los productos de la compra ya no existe.")

    compra = Compra.objects.create(proveedor=proveedor, usuario=usuario, total=0)
    total = 0
    items = []
    for pid, linea in lineas.items():
        p = productos[pid]
        subtotal = linea["cantidad"] * linea["costo"]
        items.append(ItemCompra(compra=compra, producto=p, nombre=p.nombre, cantidad=linea["cantidad"],
                                costo=linea["costo"], subtotal=subtotal))
        total += subtotal
        # Regla MVP 2: la compra suma stock (si el producto lleva inventario) y actualiza el costo
        if p.seguimiento_inventario:
            p.stock += linea["cantidad"]
        p.costo = linea["costo"]
        p.save(update_fields=["stock", "costo"])

    ItemCompra.objects.bulk_create(items)
    compra.total = total
    compra.save(update_fields=["total"])
    return compra
