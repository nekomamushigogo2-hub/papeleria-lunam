"""
SCRIPT DE INICIALIZACIÓN DE DATOS
=================================
    python manage.py inicializar_datos

Crea (o deja como están, si ya existen) los usuarios iniciales y unos datos de
ejemplo para poder demostrar el sistema. Se puede correr varias veces sin
duplicar nada (usa get_or_create).

Usuarios iniciales (cámbialos con las variables de entorno si quieres):
    admin   / Admin2026*    -> rol administrador
    cajero  / Cajero2026*   -> rol cajero
"""
import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from pos.models import Categoria, Cliente, Descuento, Perfil, Producto, Proveedor

USUARIOS = [
    # usuario, clave por defecto, variable de entorno, rol, nombre, apellido, superusuario
    ("admin", "Admin2026*", "CLAVE_ADMIN", Perfil.ADMIN, "Administradora", "Papel y Luna", True),
    ("cajero", "Cajero2026*", "CLAVE_CAJERO", Perfil.CAJERO, "Cajero", "Turno mañana", False),
]

CATEGORIAS = ["Escritura", "Cuadernos", "Arte y color", "Oficina"]

PRODUCTOS = [
    # nombre, código, categoría, precio, costo, stock
    ("Lápiz HB", "LAP-001", "Escritura", 1200, 600, 120),
    ("Esfero negro", "ESF-001", "Escritura", 1800, 900, 80),
    ("Marcador permanente", "MAR-001", "Escritura", 3500, 1900, 40),
    ("Resaltador amarillo", "RES-001", "Escritura", 2800, 1400, 35),
    ("Cuaderno cuadriculado 100 hojas", "CUA-001", "Cuadernos", 6500, 3800, 50),
    ("Colores x12", "COL-012", "Arte y color", 9800, 6000, 25),
    ("Témperas x6", "TEM-006", "Arte y color", 8500, 5200, 15),
    ("Tijeras escolares", "TIJ-001", "Oficina", 4200, 2300, 20),
    ("Cinta transparente", "CIN-001", "Oficina", 2500, 1200, 30),
    ("Corrector líquido", "COR-001", "Oficina", 3000, 1600, 3),
]

CLIENTES = [
    ("María Fernanda Ruiz", "3001234567", "maria.ruiz@correo.com"),
    ("Colegio San José", "6015551234", "compras@colegiosanjose.edu.co"),
    ("Andrés Gómez", "3109876543", ""),
]

PROVEEDORES = [
    ("Distribuidora Escolar S.A.S.", "900123456-1", "6017654321", "ventas@distriescolar.com"),
    ("Papelería Mayorista El Punto", "800987654-2", "3201112233", ""),
]

DESCUENTOS = [
    ("Cliente frecuente 10 %", Descuento.PORCENTAJE, 10),
    ("Temporada escolar 5 %", Descuento.PORCENTAJE, 5),
    ("Bono $2.000", Descuento.VALOR, 2000),
]


class Command(BaseCommand):
    help = "Crea los usuarios iniciales (admin y cajero) y datos de ejemplo."

    def add_arguments(self, parser):
        parser.add_argument("--solo-usuarios", action="store_true",
                            help="Crea únicamente los usuarios, sin datos de ejemplo.")

    @transaction.atomic
    def handle(self, *args, **opciones):
        User = get_user_model()
        for username, clave, variable, rol, nombre, apellido, superusuario in USUARIOS:
            usuario, creado = User.objects.get_or_create(
                username=username,
                defaults={"first_name": nombre, "last_name": apellido,
                          "is_staff": superusuario, "is_superuser": superusuario})
            if creado:
                usuario.set_password(os.environ.get(variable, clave))
                usuario.save()
            Perfil.objects.update_or_create(usuario=usuario, defaults={"rol": rol})
            self.stdout.write(f"  usuario {username} ({rol}) {'creado' if creado else 'ya existía'}")

        if opciones["solo_usuarios"]:
            return

        categorias = {n: Categoria.objects.get_or_create(nombre=n)[0] for n in CATEGORIAS}
        for nombre, codigo, cat, precio, costo, stock in PRODUCTOS:
            Producto.objects.get_or_create(nombre=nombre, defaults={
                "codigo": codigo, "categoria": categorias[cat], "precio": precio, "costo": costo,
                "seguimiento_inventario": True, "stock": stock})
        for nombre, telefono, correo in CLIENTES:
            Cliente.objects.get_or_create(nombre=nombre, defaults={"telefono": telefono, "correo": correo})
        for nombre, nit, telefono, correo in PROVEEDORES:
            Proveedor.objects.get_or_create(nombre=nombre, defaults={"nit": nit, "telefono": telefono, "correo": correo})
        for nombre, tipo, valor in DESCUENTOS:
            Descuento.objects.get_or_create(nombre=nombre, defaults={"tipo": tipo, "valor": valor})

        self.stdout.write(self.style.SUCCESS(
            f"Datos listos: {Categoria.objects.count()} categorías, {Producto.objects.count()} productos, "
            f"{Cliente.objects.count()} clientes, {Proveedor.objects.count()} proveedores, "
            f"{Descuento.objects.count()} descuentos."))
