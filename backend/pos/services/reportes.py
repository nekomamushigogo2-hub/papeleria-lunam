"""
REPORTES BÁSICOS
================
Consultas de solo lectura agrupadas con el ORM (GROUP BY en SQL). Los rangos
de fecha son por DÍA en la zona horaria de Colombia (settings.TIME_ZONE) y
ambos extremos se incluyen: desde=hasta es un reporte de 1 día.
"""
from django.db.models import Count, F, Max, Q, Sum

from ..models import Compra, Faltante, ItemReembolso, ItemVenta, Reembolso, Venta


def _ventas_en_rango(desde, hasta):
    return Venta.objects.filter(estado=Venta.CERRADA,
                                fecha_cierre__date__gte=desde, fecha_cierre__date__lte=hasta)


def reporte_ventas(desde, hasta):
    ventas = _ventas_en_rango(desde, hasta)
    resumen = ventas.aggregate(numero=Count("id"), total=Sum("total"), descuentos=Sum("valor_descuento"))
    reembolsado = Reembolso.objects.filter(fecha__date__gte=desde, fecha__date__lte=hasta) \
        .aggregate(t=Sum("total"))["t"] or 0
    por_metodo = list(ventas.values("metodo_pago")
                      .annotate(numero=Count("id"), total=Sum("total"))
                      .order_by("-total"))
    por_dia = list(ventas.values(dia=F("fecha_cierre__date"))
                   .annotate(numero=Count("id"), total=Sum("total"))
                   .order_by("dia"))
    total = resumen["total"] or 0
    return {
        "desde": desde, "hasta": hasta,
        "numeroVentas": resumen["numero"],
        "totalVendido": total,
        "totalDescuentos": resumen["descuentos"] or 0,
        "totalReembolsado": reembolsado,
        "totalNeto": total - reembolsado,
        "porMetodo": [{"metodoPago": m["metodo_pago"], "numero": m["numero"], "total": m["total"]} for m in por_metodo],
        "porDia": [{"dia": d["dia"], "numero": d["numero"], "total": d["total"]} for d in por_dia],
    }


def productos_mas_vendidos(desde, hasta, limite=10):
    """Cantidad vendida menos la reembolsada, agrupada por producto."""
    items = ItemVenta.objects.filter(venta__in=_ventas_en_rango(desde, hasta))
    vendidos = (items.values("producto_id", "nombre")
                .annotate(cantidad=Sum("cantidad"), total=Sum("subtotal")))
    devueltos = dict(ItemReembolso.objects.filter(item_venta__in=items)
                     .values_list("item_venta__producto_id")
                     .annotate(c=Sum("cantidad")))

    # Un mismo producto pudo venderse con dos nombres (si se renombró): se agrupa por id
    agrupado = {}
    for v in vendidos:
        clave = v["producto_id"] or f"txt:{v['nombre']}"
        fila = agrupado.setdefault(clave, {"productoId": v["producto_id"], "nombre": v["nombre"],
                                           "cantidadVendida": 0, "totalVendido": 0})
        fila["cantidadVendida"] += v["cantidad"]
        fila["totalVendido"] += v["total"]
    for fila in agrupado.values():
        fila["cantidadReembolsada"] = devueltos.get(fila["productoId"], 0) if fila["productoId"] else 0
        fila["cantidadNeta"] = fila["cantidadVendida"] - fila["cantidadReembolsada"]

    filas = sorted(agrupado.values(), key=lambda f: (-f["cantidadNeta"], f["nombre"]))
    return {"desde": desde, "hasta": hasta, "productos": filas[:limite]}


def reporte_compras(desde, hasta):
    compras = Compra.objects.filter(fecha__date__gte=desde, fecha__date__lte=hasta)
    resumen = compras.aggregate(numero=Count("id"), total=Sum("total"))
    por_proveedor = (compras.values("proveedor_id", "proveedor__nombre")
                     .annotate(numero=Count("id"), total=Sum("total"))
                     .order_by("-total"))
    return {
        "desde": desde, "hasta": hasta,
        "numeroCompras": resumen["numero"],
        "totalComprado": resumen["total"] or 0,
        "porProveedor": [{"proveedorId": p["proveedor_id"], "proveedor": p["proveedor__nombre"],
                          "numero": p["numero"], "total": p["total"]} for p in por_proveedor],
    }


def faltantes_frecuentes(desde=None, hasta=None, limite=20):
    """Productos más pedidos que no se tenían (agrupados por nombre normalizado)."""
    faltantes = Faltante.objects.all()
    if desde:
        faltantes = faltantes.filter(fecha__date__gte=desde)
    if hasta:
        faltantes = faltantes.filter(fecha__date__lte=hasta)
    filas = (faltantes.values("nombre_normalizado")
             .annotate(solicitudes=Count("id"),
                       cantidadSolicitada=Sum("cantidad"),
                       pendientes=Count("id", filter=Q(estado=Faltante.PENDIENTE)),
                       ultimaFecha=Max("fecha"),
                       nombre=Max("descripcion"))
             .order_by("-solicitudes", "-cantidadSolicitada")[:limite])
    return {"desde": desde, "hasta": hasta, "faltantes": [
        {"nombreNormalizado": f["nombre_normalizado"], "nombre": f["nombre"],
         "solicitudes": f["solicitudes"], "cantidadSolicitada": f["cantidadSolicitada"],
         "pendientes": f["pendientes"], "ultimaFecha": f["ultimaFecha"],
         "estado": "pendiente" if f["pendientes"] else "resuelto"}
        for f in filas
    ]}


def faltantes_para_compras():
    """Faltantes PENDIENTES agrupados por producto y proveedor: la lista de qué pedir."""
    filas = (Faltante.objects.filter(estado=Faltante.PENDIENTE)
             .values("nombre_normalizado", "producto_id", "proveedor_id", "proveedor__nombre")
             .annotate(solicitudes=Count("id"), cantidadSolicitada=Sum("cantidad"),
                       ultimaFecha=Max("fecha"), nombre=Max("descripcion"))
             .order_by("proveedor__nombre", "-cantidadSolicitada"))
    return [{"nombre": f["nombre"], "nombreNormalizado": f["nombre_normalizado"],
             "productoId": f["producto_id"], "proveedorId": f["proveedor_id"],
             "proveedor": f["proveedor__nombre"] or "Sin proveedor",
             "solicitudes": f["solicitudes"], "cantidadSolicitada": f["cantidadSolicitada"],
             "ultimaFecha": f["ultimaFecha"]} for f in filas]
