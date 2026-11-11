"""
RUTAS DE LA API (todas cuelgan de /api/)
========================================
El router de DRF genera las rutas REST de cada recurso:
  GET /recurso/   POST /recurso/   GET|PUT|PATCH|DELETE /recurso/{id}/
"""
from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from .views import auth, catalogo, compras, faltantes, reportes, terceros, ventas

router = DefaultRouter()
router.register("categorias", catalogo.CategoriaViewSet)
router.register("productos", catalogo.ProductoViewSet)
router.register("descuentos", catalogo.DescuentoViewSet)
router.register("clientes", terceros.ClienteViewSet)
router.register("proveedores", terceros.ProveedorViewSet)
router.register("ventas", ventas.VentaViewSet, basename="venta")
router.register("compras", compras.CompraViewSet, basename="compra")
router.register("faltantes", faltantes.FaltanteViewSet, basename="faltante")

urlpatterns = [
    path("auth/login/", auth.LoginView.as_view(), name="login"),
    path("auth/refresh/", TokenRefreshView.as_view(), name="refresh"),
    path("auth/yo/", auth.yo, name="yo"),
    path("reportes/ventas/", reportes.ventas),
    path("reportes/productos-mas-vendidos/", reportes.productos_mas_vendidos),
    path("reportes/compras/", reportes.compras),
    path("reportes/faltantes/", reportes.faltantes),
    path("", include(router.urls)),
]
