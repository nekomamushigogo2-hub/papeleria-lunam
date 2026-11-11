from django.contrib import admin

from . import models

for modelo in (models.Perfil, models.Categoria, models.Cliente, models.Proveedor, models.Producto,
               models.Descuento, models.Venta, models.ItemVenta, models.Reembolso, models.ItemReembolso,
               models.Compra, models.ItemCompra, models.Faltante):
    admin.site.register(modelo)
