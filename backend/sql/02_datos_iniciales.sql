-- Datos iniciales del POS Papel y Luna (PostgreSQL). Ejecutar DESPUÉS de 01_esquema_postgresql.sql
-- Usuarios: admin / Admin2026*  (administrador)   ·   cajero / Cajero2026*  (cajero)
-- Las claves van cifradas con el algoritmo de Django (pbkdf2_sha256).
BEGIN;

INSERT INTO auth_user (id, password, is_superuser, username, first_name, last_name, email, is_staff, is_active, date_joined) VALUES (1, 'pbkdf2_sha256$1000000$AXjipba4bumro0ngFDFazI$he5ZCxgII7LU5pCh2aOLpuF7eqBIMAFTMmm4AponyOk=', true, 'admin', 'Administradora', 'Papel y Luna', '', true, true, now()) ON CONFLICT DO NOTHING;
INSERT INTO perfiles (id, usuario_id, rol) VALUES (1, 1, 'admin') ON CONFLICT DO NOTHING;
INSERT INTO auth_user (id, password, is_superuser, username, first_name, last_name, email, is_staff, is_active, date_joined) VALUES (2, 'pbkdf2_sha256$1000000$NsTKlx476Iv7beBicNB1eR$GKyRGmdMME4ipXdK6SMDVZFzQQsDbyZaliu7AFEFCrE=', false, 'cajero', 'Cajero', 'Turno mañana', '', false, true, now()) ON CONFLICT DO NOTHING;
INSERT INTO perfiles (id, usuario_id, rol) VALUES (2, 2, 'cajero') ON CONFLICT DO NOTHING;

INSERT INTO categorias (id, nombre) VALUES (1, 'Escritura') ON CONFLICT DO NOTHING;
INSERT INTO categorias (id, nombre) VALUES (2, 'Cuadernos') ON CONFLICT DO NOTHING;
INSERT INTO categorias (id, nombre) VALUES (3, 'Arte y color') ON CONFLICT DO NOTHING;
INSERT INTO categorias (id, nombre) VALUES (4, 'Oficina') ON CONFLICT DO NOTHING;
INSERT INTO productos (id, nombre, codigo, categoria_id, precio, costo, seguimiento_inventario, stock) VALUES (1, 'Lápiz HB', 'LAP-001', 1, 1200, 600, true, 120) ON CONFLICT DO NOTHING;
INSERT INTO productos (id, nombre, codigo, categoria_id, precio, costo, seguimiento_inventario, stock) VALUES (2, 'Esfero negro', 'ESF-001', 1, 1800, 900, true, 80) ON CONFLICT DO NOTHING;
INSERT INTO productos (id, nombre, codigo, categoria_id, precio, costo, seguimiento_inventario, stock) VALUES (3, 'Marcador permanente', 'MAR-001', 1, 3500, 1900, true, 40) ON CONFLICT DO NOTHING;
INSERT INTO productos (id, nombre, codigo, categoria_id, precio, costo, seguimiento_inventario, stock) VALUES (4, 'Resaltador amarillo', 'RES-001', 1, 2800, 1400, true, 35) ON CONFLICT DO NOTHING;
INSERT INTO productos (id, nombre, codigo, categoria_id, precio, costo, seguimiento_inventario, stock) VALUES (5, 'Cuaderno cuadriculado 100 hojas', 'CUA-001', 2, 6500, 3800, true, 50) ON CONFLICT DO NOTHING;
INSERT INTO productos (id, nombre, codigo, categoria_id, precio, costo, seguimiento_inventario, stock) VALUES (6, 'Colores x12', 'COL-012', 3, 9800, 6000, true, 25) ON CONFLICT DO NOTHING;
INSERT INTO productos (id, nombre, codigo, categoria_id, precio, costo, seguimiento_inventario, stock) VALUES (7, 'Témperas x6', 'TEM-006', 3, 8500, 5200, true, 15) ON CONFLICT DO NOTHING;
INSERT INTO productos (id, nombre, codigo, categoria_id, precio, costo, seguimiento_inventario, stock) VALUES (8, 'Tijeras escolares', 'TIJ-001', 4, 4200, 2300, true, 20) ON CONFLICT DO NOTHING;
INSERT INTO productos (id, nombre, codigo, categoria_id, precio, costo, seguimiento_inventario, stock) VALUES (9, 'Cinta transparente', 'CIN-001', 4, 2500, 1200, true, 30) ON CONFLICT DO NOTHING;
INSERT INTO productos (id, nombre, codigo, categoria_id, precio, costo, seguimiento_inventario, stock) VALUES (10, 'Corrector líquido', 'COR-001', 4, 3000, 1600, true, 3) ON CONFLICT DO NOTHING;
INSERT INTO clientes (id, nombre, telefono, correo) VALUES (1, 'María Fernanda Ruiz', '3001234567', 'maria.ruiz@correo.com') ON CONFLICT DO NOTHING;
INSERT INTO clientes (id, nombre, telefono, correo) VALUES (2, 'Colegio San José', '6015551234', 'compras@colegiosanjose.edu.co') ON CONFLICT DO NOTHING;
INSERT INTO clientes (id, nombre, telefono, correo) VALUES (3, 'Andrés Gómez', '3109876543', '') ON CONFLICT DO NOTHING;
INSERT INTO proveedores (id, nombre, nit, telefono, correo) VALUES (1, 'Distribuidora Escolar S.A.S.', '900123456-1', '6017654321', 'ventas@distriescolar.com') ON CONFLICT DO NOTHING;
INSERT INTO proveedores (id, nombre, nit, telefono, correo) VALUES (2, 'Papelería Mayorista El Punto', '800987654-2', '3201112233', '') ON CONFLICT DO NOTHING;
INSERT INTO descuentos (id, nombre, tipo, valor) VALUES (1, 'Cliente frecuente 10 %', 'porcentaje', 10) ON CONFLICT DO NOTHING;
INSERT INTO descuentos (id, nombre, tipo, valor) VALUES (2, 'Temporada escolar 5 %', 'porcentaje', 5) ON CONFLICT DO NOTHING;
INSERT INTO descuentos (id, nombre, tipo, valor) VALUES (3, 'Bono $2.000', 'valor', 2000) ON CONFLICT DO NOTHING;

-- Los ids se insertaron a mano: se mueven los contadores para que los nuevos registros no choquen
SELECT setval(pg_get_serial_sequence('auth_user', 'id'), (SELECT MAX(id) FROM auth_user));
SELECT setval(pg_get_serial_sequence('perfiles', 'id'), (SELECT MAX(id) FROM perfiles));
SELECT setval(pg_get_serial_sequence('categorias', 'id'), (SELECT MAX(id) FROM categorias));
SELECT setval(pg_get_serial_sequence('productos', 'id'), (SELECT MAX(id) FROM productos));
SELECT setval(pg_get_serial_sequence('clientes', 'id'), (SELECT MAX(id) FROM clientes));
SELECT setval(pg_get_serial_sequence('proveedores', 'id'), (SELECT MAX(id) FROM proveedores));
SELECT setval(pg_get_serial_sequence('descuentos', 'id'), (SELECT MAX(id) FROM descuentos));

COMMIT;
