"""
Genera sql/01_esquema_postgresql.sql a partir de las migraciones de Django,
SIN necesitar un servidor PostgreSQL encendido.

    cd backend
    python sql/generar_sql.py

Normalmente NO hace falta: `python manage.py migrate` crea las tablas solo.
El archivo .sql existe para poder revisar o crear el esquema a mano.
"""
import os
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE))
os.environ["DATABASE_URL"] = "postgresql://usuario:clave@localhost:5432/pos_papel_luna"
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django  # noqa: E402

django.setup()

from django.db import connection  # noqa: E402
from django.db.migrations.loader import MigrationLoader  # noqa: E402

# Sin servidor: le decimos a Django qué versión de PostgreSQL asumir
connection.get_database_version = lambda: (16, 0)
connection.features.__dict__["can_rollback_ddl"] = False  # evita abrir una transacción (y una conexión)



def literal(valor):
    """Convierte un parámetro a literal SQL (lo que normalmente hace el driver conectado)."""
    if valor is None:
        return "NULL"
    if isinstance(valor, bool):
        return "true" if valor else "false"
    if isinstance(valor, (int, float)):
        return str(valor)
    return "'" + str(valor).replace("'", "''") + "'"


connection.ops.compose_sql = lambda sql, params: sql % tuple(literal(p) for p in params) if params else sql

loader = MigrationLoader(None, ignore_no_migrations=True)   # None = no consulta la base
plan = [(loader.graph.nodes[n], False) for n in loader.graph.leaf_nodes() for n in loader.graph.forwards_plan(n)]
vistos, plan_unico = set(), []
for migracion, atras in plan:
    clave = (migracion.app_label, migracion.name)
    if clave not in vistos:
        vistos.add(clave)
        plan_unico.append((migracion, atras))

loader.connection = connection          # para escribir SQL sí usa el dialecto de PostgreSQL
lineas = loader.collect_sql(plan_unico)
destino = BASE / "sql" / "01_esquema_postgresql.sql"
destino.write_text(
    "-- Esquema completo de la base de datos del POS Papel y Luna (PostgreSQL)\n"
    "-- Generado desde las migraciones de Django con: python sql/generar_sql.py\n"
    "-- Incluye las tablas de autenticación de Django (auth_user...) y las del POS.\n\n"
    + "\n".join(lineas) + "\n",
    encoding="utf-8",
)
print(f"Escrito {destino} ({len(lineas)} sentencias)")

# ---------------------------------------------------------------------------
# 02_datos_iniciales.sql: usuarios iniciales + datos de ejemplo (mismos que
# `python manage.py inicializar_datos`, que es la forma recomendada).
# ---------------------------------------------------------------------------
from django.contrib.auth.hashers import make_password  # noqa: E402

from pos.management.commands import inicializar_datos as ini  # noqa: E402

sql = ["-- Datos iniciales del POS Papel y Luna (PostgreSQL). Ejecutar DESPUÉS de 01_esquema_postgresql.sql",
       "-- Usuarios: admin / Admin2026*  (administrador)   ·   cajero / Cajero2026*  (cajero)",
       "-- Las claves van cifradas con el algoritmo de Django (pbkdf2_sha256).", "BEGIN;", ""]
for i, (user, clave, _var, rol, nombre, apellido, su) in enumerate(ini.USUARIOS, start=1):
    sql.append(
        "INSERT INTO auth_user (id, password, is_superuser, username, first_name, last_name, email, is_staff, is_active, date_joined) "
        f"VALUES ({i}, {literal(make_password(clave))}, {literal(su)}, {literal(user)}, {literal(nombre)}, {literal(apellido)}, '', {literal(su)}, true, now()) ON CONFLICT DO NOTHING;")
    sql.append(f"INSERT INTO perfiles (id, usuario_id, rol) VALUES ({i}, {i}, {literal(rol)}) ON CONFLICT DO NOTHING;")
sql.append("")
for i, nombre in enumerate(ini.CATEGORIAS, start=1):
    sql.append(f"INSERT INTO categorias (id, nombre) VALUES ({i}, {literal(nombre)}) ON CONFLICT DO NOTHING;")
for i, (nombre, codigo, cat, precio, costo, stock) in enumerate(ini.PRODUCTOS, start=1):
    sql.append("INSERT INTO productos (id, nombre, codigo, categoria_id, precio, costo, seguimiento_inventario, stock) "
               f"VALUES ({i}, {literal(nombre)}, {literal(codigo)}, {ini.CATEGORIAS.index(cat) + 1}, {precio}, {costo}, true, {stock}) ON CONFLICT DO NOTHING;")
for i, (nombre, tel, correo) in enumerate(ini.CLIENTES, start=1):
    sql.append(f"INSERT INTO clientes (id, nombre, telefono, correo) VALUES ({i}, {literal(nombre)}, {literal(tel)}, {literal(correo)}) ON CONFLICT DO NOTHING;")
for i, (nombre, nit, tel, correo) in enumerate(ini.PROVEEDORES, start=1):
    sql.append(f"INSERT INTO proveedores (id, nombre, nit, telefono, correo) VALUES ({i}, {literal(nombre)}, {literal(nit)}, {literal(tel)}, {literal(correo)}) ON CONFLICT DO NOTHING;")
for i, (nombre, tipo, valor) in enumerate(ini.DESCUENTOS, start=1):
    sql.append(f"INSERT INTO descuentos (id, nombre, tipo, valor) VALUES ({i}, {literal(nombre)}, {literal(tipo)}, {valor}) ON CONFLICT DO NOTHING;")
sql += ["", "-- Los ids se insertaron a mano: se mueven los contadores para que los nuevos registros no choquen"]
for tabla in ("auth_user", "perfiles", "categorias", "productos", "clientes", "proveedores", "descuentos"):
    sql.append(f"SELECT setval(pg_get_serial_sequence('{tabla}', 'id'), (SELECT MAX(id) FROM {tabla}));")
sql += ["", "COMMIT;", ""]
(BASE / "sql" / "02_datos_iniciales.sql").write_text("\n".join(sql), encoding="utf-8")
print("Escrito sql/02_datos_iniciales.sql")
