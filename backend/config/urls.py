from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path


def salud(request):
    """GET / -> sirve para comprobar que el backend desplegado está vivo."""
    return JsonResponse({"servicio": "API POS Papel y Luna", "estado": "ok", "api": "/api/"})


urlpatterns = [
    path("", salud),
    path("admin/", admin.site.urls),
    path("api/", include("pos.urls")),
]
