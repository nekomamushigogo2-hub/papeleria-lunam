"""
PRUEBAS DE LA API (python manage.py test pos)
=============================================
Recorren los flujos principales contra la API real (con una base de prueba):
login, roles, venta, corrección, reembolso, compras, faltantes y reportes.
"""
from io import StringIO

from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APITestCase

from .models import Descuento, Producto, Venta


class FlujoPOSTest(APITestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("inicializar_datos", stdout=StringIO())

    # ---------- utilidades ----------
    def entrar(self, usuario, clave):
        r = self.client.post("/api/auth/login/", {"username": usuario, "password": clave}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {r.data['access']}")
        return r.data

    def admin(self):
        return self.entrar("admin", "Admin2026*")

    def cajero(self):
        return self.entrar("cajero", "Cajero2026*")

    def prod(self, nombre):
        return Producto.objects.get(nombre=nombre)

    def vender(self, lineas, **extra):
        datos = {"estado": "cerrada", "metodoPago": "Nequi",
                 "items": [{"productoId": self.prod(n).id, "cantidad": c} for n, c in lineas]}
        datos.update(extra)
        return self.client.post("/api/ventas/", datos, format="json")

    # ---------- autenticación y roles ----------
    def test_login_y_roles(self):
        r = self.client.post("/api/auth/login/", {"username": "admin", "password": "mala"}, format="json")
        self.assertEqual(r.status_code, 401)
        self.assertEqual(self.client.get("/api/productos/").status_code, 401)

        datos = self.cajero()
        self.assertEqual(datos["usuario"]["rol"], "cajero")
        self.assertEqual(self.client.get("/api/productos/").status_code, 200)
        self.assertEqual(self.client.get("/api/compras/").status_code, 403)
        self.assertEqual(self.client.get("/api/reportes/ventas/").status_code, 403)
        self.assertEqual(self.client.post("/api/descuentos/", {"nombre": "x", "tipo": "valor", "valor": 1}).status_code, 403)
        self.assertEqual(self.client.post("/api/clientes/", {"nombre": "Nuevo"}).status_code, 201)
        # Edición en caliente sí; stock no
        p = self.prod("Lápiz HB")
        self.assertEqual(self.client.patch(f"/api/productos/{p.id}/", {"precio": 1300}, format="json").status_code, 200)
        self.assertEqual(self.client.patch(f"/api/productos/{p.id}/", {"stock": 999}, format="json").status_code, 403)

    # ---------- ventas e inventario ----------
    def test_venta_cerrada_descuenta_stock_y_rechaza_negativo(self):
        self.cajero()
        r = self.vender([("Lápiz HB", 3), ("Esfero negro", 2)])
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.data["total"], 3 * 1200 + 2 * 1800)
        self.assertEqual(self.prod("Lápiz HB").stock, 117)

        r = self.vender([("Corrector líquido", 5)])
        self.assertEqual(r.status_code, 400)
        self.assertIn("Corrector", r.data["detail"])
        self.assertEqual(self.prod("Corrector líquido").stock, 3)   # nada a medias

    def test_debe_exige_cliente_y_efectivo_cambio(self):
        self.cajero()
        self.assertEqual(self.vender([("Lápiz HB", 1)], metodoPago="Debe").status_code, 400)
        r = self.vender([("Lápiz HB", 1)], metodoPago="Efectivo", valorRecibido=5000)
        self.assertEqual(r.data["cambio"], 3800)

    def test_venta_abierta_guardar_retomar_cerrar(self):
        self.cajero()
        lapiz = self.prod("Lápiz HB")
        r = self.client.post("/api/ventas/", {"estado": "abierta", "items": [{"productoId": lapiz.id, "cantidad": 2}]}, format="json")
        self.assertEqual(r.data["estado"], "abierta")
        self.assertEqual(self.prod("Lápiz HB").stock, 120)  # abierta no toca stock
        r = self.client.put(f"/api/ventas/{r.data['id']}/", {"estado": "cerrada", "metodoPago": "Nequi",
                                                             "items": [{"productoId": lapiz.id, "cantidad": 4}]}, format="json")
        self.assertEqual(r.data["estado"], "cerrada")
        self.assertEqual(self.prod("Lápiz HB").stock, 116)

    def test_descuentos(self):
        self.cajero()
        d10 = Descuento.objects.get(nombre__startswith="Cliente frecuente")
        r = self.vender([("Colores x12", 1)], descuentoId=d10.id)
        self.assertEqual(r.data["valorDescuento"], 980)
        self.assertEqual(r.data["total"], 8820)
        bono = Descuento.objects.create(nombre="Bono grande", tipo="valor", valor=50000)
        r = self.vender([("Lápiz HB", 1)], descuentoId=bono.id)
        self.assertEqual(r.status_code, 400)                      # total negativo
        # Eliminar el descuento no altera la venta
        self.admin()
        venta_id = self.vender([("Colores x12", 1)], descuentoId=d10.id).data["id"]
        self.assertEqual(self.client.delete(f"/api/descuentos/{d10.id}/").status_code, 204)
        v = self.client.get(f"/api/ventas/{venta_id}/").data
        self.assertEqual((v["total"], v["descuentoNombre"]), (8820, "Cliente frecuente 10 %"))

    # ---------- corrección ----------
    def test_correccion_ajusta_inventario_por_diferencia(self):
        self.cajero()
        venta = self.vender([("Lápiz HB", 5), ("Esfero negro", 2)]).data
        self.assertEqual(self.client.post(f"/api/ventas/{venta['id']}/corregir/", {}, format="json").status_code, 403)

        self.admin()
        cliente = self.client.get("/api/clientes/").data[0]
        r = self.client.post(f"/api/ventas/{venta['id']}/corregir/", {
            "items": [{"productoId": self.prod("Lápiz HB").id, "cantidad": 2},
                      {"productoId": self.prod("Tijeras escolares").id, "cantidad": 1}],
            "clienteId": cliente["id"], "metodoPago": "Debe"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data["id"], venta["id"])
        self.assertTrue(r.data["corregida"])
        self.assertEqual(r.data["corregidaPor"], "Administradora Papel y Luna")
        self.assertEqual(r.data["total"], 2 * 1200 + 4200)
        self.assertEqual(self.prod("Lápiz HB").stock, 118)        # 120 - 5 + 3
        self.assertEqual(self.prod("Esfero negro").stock, 80)     # se devolvieron los 2
        self.assertEqual(self.prod("Tijeras escolares").stock, 19)

        r = self.client.post(f"/api/ventas/{venta['id']}/corregir/", {
            "items": [{"productoId": self.prod("Corrector líquido").id, "cantidad": 10}],
            "metodoPago": "Nequi"}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("Corrector", r.data["detail"])
        self.assertEqual(self.prod("Lápiz HB").stock, 118)        # rollback completo

    # ---------- reembolsos ----------
    def test_reembolso_parcial_y_total_con_descuento(self):
        self.admin()
        d10 = Descuento.objects.get(nombre__startswith="Cliente frecuente")
        venta = self.vender([("Lápiz HB", 3), ("Cuaderno cuadriculado 100 hojas", 1)], descuentoId=d10.id).data
        self.assertEqual(venta["total"], round((3600 + 6500) * 0.9))
        lapiz = next(i for i in venta["items"] if i["nombre"] == "Lápiz HB")
        cuaderno = next(i for i in venta["items"] if i["nombre"].startswith("Cuaderno"))

        r = self.client.post(f"/api/ventas/{venta['id']}/reembolsos/", {
            "items": [{"itemId": lapiz["id"], "cantidad": 1, "retornaInventario": True}]}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.data["reembolso"]["total"], 1080)       # 1200 con 10 % menos
        self.assertEqual(r.data["venta"]["estadoReembolso"], "parcial")
        self.assertEqual(self.prod("Lápiz HB").stock, 118)

        r = self.client.post(f"/api/ventas/{venta['id']}/reembolsos/", {
            "items": [{"itemId": lapiz["id"], "cantidad": 3}]}, format="json")
        self.assertEqual(r.status_code, 400)                       # solo quedan 2

        r = self.client.post(f"/api/ventas/{venta['id']}/reembolsos/", {
            "items": [{"itemId": lapiz["id"], "cantidad": 2, "retornaInventario": False},
                      {"itemId": cuaderno["id"], "cantidad": 1}]}, format="json")
        self.assertEqual(r.data["venta"]["estadoReembolso"], "total")
        self.assertEqual(r.data["venta"]["totalReembolsado"], venta["total"])
        self.assertEqual(self.prod("Lápiz HB").stock, 118)         # no retornó
        self.assertEqual(self.prod("Cuaderno cuadriculado 100 hojas").stock, 50)

        # Con reembolsos ya no se corrige
        r = self.client.post(f"/api/ventas/{venta['id']}/corregir/", {
            "items": [{"productoId": self.prod("Lápiz HB").id, "cantidad": 1}], "metodoPago": "Nequi"}, format="json")
        self.assertEqual(r.status_code, 400)

    # ---------- compras, entidades protegidas ----------
    def test_compra_suma_stock_y_proveedor_protegido(self):
        self.admin()
        prov = self.client.get("/api/proveedores/").data[0]
        r = self.client.post("/api/compras/", {"proveedorId": prov["id"], "items": [
            {"productoId": self.prod("Corrector líquido").id, "cantidad": 10, "costo": 1500}]}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.data["total"], 15000)
        c = self.prod("Corrector líquido")
        self.assertEqual((c.stock, c.costo), (13, 1500))
        self.assertEqual(self.client.delete(f"/api/proveedores/{prov['id']}/").status_code, 409)
        cat = self.client.get("/api/categorias/").data[0]
        self.assertEqual(self.client.delete(f"/api/categorias/{cat['id']}/").status_code, 409)

    # ---------- faltantes y reportes ----------
    def test_faltantes_y_reportes(self):
        self.cajero()
        for texto in ("Cofias", "cofia", "Cófias"):
            r = self.client.post("/api/faltantes/", {"descripcion": texto, "cantidad": 2, "tipo": "inexistente"}, format="json")
            self.assertEqual(r.status_code, 201, r.content)
        r = self.client.post("/api/faltantes/", {"productoId": self.prod("Corrector líquido").id,
                                                 "cantidad": 1, "tipo": "agotado"}, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(len(self.client.get("/api/faltantes/?tipo=inexistente").data), 3)
        self.client.post(f"/api/faltantes/{r.data['id']}/resolver/")
        self.assertEqual(len(self.client.get("/api/faltantes/?estado=pendiente").data), 3)
        self.vender([("Lápiz HB", 4)])

        self.admin()
        hoy = str(timezone.localdate())
        rep = self.client.get(f"/api/reportes/faltantes/").data["faltantes"]
        self.assertEqual((rep[0]["nombreNormalizado"], rep[0]["solicitudes"], rep[0]["cantidadSolicitada"]), ("cofia", 3, 6))
        rv = self.client.get(f"/api/reportes/ventas/?desde={hoy}&hasta={hoy}").data
        self.assertEqual((rv["numeroVentas"], rv["totalVendido"]), (1, 4800))
        top = self.client.get(f"/api/reportes/productos-mas-vendidos/?desde={hoy}&hasta={hoy}").data["productos"]
        self.assertEqual(top[0]["nombre"], "Lápiz HB")
        self.assertEqual(self.client.get(f"/api/reportes/compras/?desde={hoy}").status_code, 200)
        self.assertEqual(self.client.get("/api/reportes/ventas/?desde=2026-12-01&hasta=2026-11-01").status_code, 400)
        self.assertEqual(Venta.objects.count(), 1)
