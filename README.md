# Sistema POS — Papel y Luna (MVP 3 · Entrega final)

Punto de venta para una papelería, desarrollado en la asignatura **Desarrollo de Aplicaciones Web**.
En esta entrega el sistema dejó Google Sheets y ahora es **full-stack**: frontend en JavaScript vanilla,
backend propio en **Django REST Framework** y base de datos **PostgreSQL** (SQLite en local).

## 👥 Integrantes

- Samuel Mathias Garzón García
- Duvan Camilo Ayala León

## 🌐 Enlaces

| Qué | URL |
|---|---|
| Frontend (Vercel) | https://papeleria-lunam.vercel.app |
| Backend / API (Render) | https://papeleria-lunam-api.onrender.com/api/ |
| Repositorio | https://github.com/nekomamushigogo2-hub/papeleria-lunam |

> El backend usa el plan gratuito de Render: si lleva un rato sin uso, la **primera** petición puede tardar
> hasta un minuto mientras el servidor "despierta". El login lo avisa en pantalla.

## 🔑 Credenciales iniciales

| Rol | Usuario | Contraseña |
|---|---|---|
| Administrador | `admin` | `Admin2026*` |
| Cajero | `cajero` | `Cajero2026*` |

Las crea el script `python manage.py inicializar_datos` (también `backend/sql/02_datos_iniciales.sql`).

---

## 🏗️ Arquitectura

```
┌──────────────────────────┐   fetch + JSON (REST)    ┌───────────────────────────────┐    ORM     ┌──────────────┐
│ Frontend (Vercel)        │  Authorization: Bearer   │ Backend Django + DRF (Render) │  ───────▶  │ PostgreSQL   │
│ HTML + CSS + JS módulos  │ ───────────────────────▶ │ rutas → controladores →       │            │ (Render)     │
│ js/api.js = único fetch  │ ◀─────────────────────── │ servicios → modelos           │  ◀───────  │ SQLite local │
└──────────────────────────┘                          └───────────────────────────────┘            └──────────────┘
```

**Flujo de una venta**: el cajero agrega productos → `venta.js` arma `{ items: [{productoId, cantidad}], metodoPago, ... }` →
`api.js` hace `POST /api/ventas/` con el token JWT → la **ruta** (`pos/urls.py`) llega al **controlador**
(`pos/views/ventas.py`) → el controlador valida con un **serializador** y llama al **servicio**
(`pos/services/ventas.py`) → el servicio, dentro de `transaction.atomic()`, bloquea los productos, toma los
precios **de la base de datos**, valida stock, descuenta inventario y guarda la venta y sus líneas → responde la
venta en JSON → el frontend muestra la factura.

### Separación de responsabilidades (backend)

| Capa | Archivo(s) | Qué hace |
|---|---|---|
| Rutas | `backend/pos/urls.py` | URL → controlador (router REST de DRF) |
| Controladores | `backend/pos/views/*.py` | Reciben la petición, revisan permisos, validan y responden |
| Servicios | `backend/pos/services/*.py` | Reglas de negocio y transacciones (ventas, corrección, reembolsos, compras, reportes) |
| Serializadores | `backend/pos/serializers.py` | Modelo ⇄ JSON (camelCase) y validación de entrada |
| Modelos | `backend/pos/models.py` | Tablas de la base de datos y relaciones |
| Permisos | `backend/pos/permisos.py` | Matriz de roles admin / cajero |
| Errores | `backend/pos/excepciones.py` | Todas las respuestas de error con forma `{ "detail": "..." }` |

### Modelo de datos

`Producto` → `Categoria` · `Venta` → `ItemVenta` (detalle) · `Venta` → `Reembolso` → `ItemReembolso` ·
`Compra` → `ItemCompra` (detalle) · `Venta` → `Cliente`, `Descuento` · `Faltante` → `Producto?`, `Proveedor?` ·
`Perfil` (rol) → `User` de Django. Esquema completo en `backend/sql/01_esquema_postgresql.sql`.

Decisiones importantes:

- **Líneas en tablas de detalle**, no JSON en una columna (`items_venta`, `items_compra`).
- Cada línea **copia nombre y precio** del producto: si el producto cambia o se elimina, la factura no cambia.
- La venta guarda una **copia del descuento** (nombre, tipo y valor): eliminar un descuento del catálogo no altera ventas.
- `on_delete=PROTECT`: no se puede borrar una categoría con productos, un cliente con ventas ni un proveedor con compras (la API responde **409**).
- `CHECK (stock >= 0)` en la base de datos como última barrera contra stock negativo.

### Inventario consistente (transacciones)

Toda operación que toca venta + inventario corre en `transaction.atomic()` con `select_for_update()`:
si falla cualquier paso (por ejemplo, un producto sin stock), la base de datos **deshace todo**.

| Operación | Efecto en stock |
|---|---|
| Cerrar venta | Resta la cantidad vendida (si el producto lleva inventario). Si quedaría negativo → se rechaza indicando el producto. |
| Venta abierta | No toca el stock hasta que se cierre. |
| Compra | Suma la cantidad comprada y actualiza el costo. |
| Corrección | Ajusta por la **diferencia** entre la venta original y la corregida. Si deja stock negativo → se rechaza indicando el producto. |
| Reembolso | Suma solo si se marca "retorna al inventario". |

---

## ✅ Funcionalidades

**Heredadas (MVP 1 y 2), ahora sobre el backend propio**: flujo de venta con Efectivo/Nequi/Debe, valor recibido y
cambio · factura con imprimir/PDF · historial con filtros · ventas abiertas (guardar, retomar, descartar, cerrar) ·
edición de producto en caliente desde la venta · CRUD de productos, categorías, clientes y proveedores · compras
(registro, listado y detalle) · cliente obligatorio con "Debe" · no se borran entidades con registros asociados.

**Nuevas (MVP 3)**:

- **Login y roles** (`login.html`): JWT, sesión persistente (localStorage + refresh token), cierre de sesión.
- **Corrección de ventas cerradas** (admin): productos, cantidades, cliente, método de pago y descuento. Conserva el
  número de venta y muestra "Venta corregida por X el Y" en el historial y en la factura.
- **Reembolsos parciales y totales** (admin): por producto y cantidad, respeta el descuento de forma proporcional,
  indica si el producto retorna al inventario y registra usuario y fecha. Una venta con reembolsos ya no se corrige.
- **Descuentos**: catálogo (porcentual o valor fijo), uno por venta, sobre el total, nunca deja total negativo.
- **Faltantes**: registro (desde el módulo o desde el catálogo: "📝 Faltante" en un agotado o "Registrar como
  faltante" cuando la búsqueda no encuentra nada), filtros por tipo/proveedor/estado, marcar resuelto y lista
  "Para las próximas compras" agrupada por proveedor. Agrupa nombres normalizados ("Cofias" = "cofia").
- **Reportes** (admin): ventas por rango (total, n.º, reembolsado, neto, por método y por día), productos más
  vendidos, compras por rango (por proveedor) y faltantes frecuentes.

### Matriz de permisos (sección 3.8)

| Función | Admin | Cajero |
|---|:-:|:-:|
| Ventas: crear, guardar, retomar, cerrar; historial y factura | ✅ | ✅ |
| Aplicar un descuento existente · Registrar faltantes · Gestión de clientes | ✅ | ✅ |
| Consultar productos · Edición en caliente (nombre, categoría, precio, costo) | ✅ | ✅ |
| Crear, editar y eliminar productos y categorías | ✅ | ❌ |
| Compras y proveedores (el cajero solo consulta proveedores) | ✅ | ❌ |
| Catálogo de descuentos (crear, editar, eliminar) | ✅ | ❌ |
| Corrección de ventas · Reembolsos · Reportes | ✅ | ❌ |

Se aplica en **el backend** (permisos de DRF: 401 sin sesión, 403 sin rol) y en el frontend se ocultan las opciones
(`data-solo-admin` + clase `rol-cajero` en el `<body>`).

---

## 🎨 Diseño de la interfaz

- **Concepto:** útiles de papelería. Barra lateral color tinta de esfero, la venta en curso como una **hoja de
  cuaderno** (renglones y margen rojo) y un solo acento fuerte: el **resaltador amarillo** que marca el total.
- **Tipografía:** Bricolage Grotesque (títulos y montos) y Atkinson Hyperlegible Next (interfaz, pensada para
  leerse rápido). Cifras de ancho fijo para que los montos queden alineados.
- **Para la caja:** <kbd>/</kbd> busca un producto, <kbd>Enter</kbd> lo agrega si es el único resultado,
  <kbd>Ctrl</kbd>+<kbd>Enter</kbd> cobra. El botón principal dice cuánto se va a cobrar. La búsqueda ignora tildes.
- **Accesibilidad (WCAG 2.1 AA):** contraste mínimo 4.5:1 en textos, foco visible en todo, ventanas con el foco
  atrapado y Esc para cerrar, diálogos propios con botones que dicen la acción, controles de 44 px en pantallas
  táctiles, etiquetas en todos los campos y respeto a "reducir movimiento".
- **Responsive:** en celular el menú se abre con el botón ☰, las ventanas salen desde abajo y un botón fijo
  muestra el total y lleva a la venta. Modo oscuro opcional.
- **Reportes:** gráficas de una sola serie (sin leyenda), barras finas con el valor al final, tooltip con mouse o
  teclado y tabla con los datos.

## 🔌 Endpoints principales (`/api/...`)

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| POST | `/auth/login/` | — | `{username, password}` → `{access, refresh, usuario}` |
| POST | `/auth/refresh/` | — | Renueva el token de acceso |
| GET | `/auth/yo/` | todos | Usuario actual |
| GET · POST · PUT/PATCH · DELETE | `/productos/`, `/categorias/`, `/clientes/`, `/proveedores/`, `/descuentos/` | ver matriz | CRUD |
| GET | `/ventas/?estado=&metodoPago=&clienteId=&desde=&hasta=` | todos | Listado |
| POST | `/ventas/` | todos | Crea venta (`estado: "abierta"` o `"cerrada"`) |
| PUT · DELETE | `/ventas/{id}/` | todos | Actualiza / cierra / descarta una venta **abierta** |
| POST | `/ventas/{id}/corregir/` | admin | Corrección de venta cerrada |
| GET · POST | `/ventas/{id}/reembolsos/` | admin (POST) | Reembolsos de la venta |
| GET · POST | `/compras/` | admin | Compras |
| GET · POST | `/faltantes/?tipo=&proveedorId=&estado=` | todos | Faltantes |
| POST | `/faltantes/{id}/resolver/` | todos | Marcar resuelto |
| GET | `/faltantes/para-compras/` | todos | Pendientes por producto y proveedor |
| GET | `/reportes/ventas/`, `/reportes/productos-mas-vendidos/`, `/reportes/compras/`, `/reportes/faltantes/` | admin | `?desde=AAAA-MM-DD&hasta=AAAA-MM-DD` |

Colección lista para Postman: `postman/POS_Papel_y_Luna_MVP3.postman_collection.json`
(con Postman CLI: `postman collection run postman/POS_Papel_y_Luna_MVP3.postman_collection.json`).

---

## 💻 Instalación y ejecución local

Requisitos: **Python 3.12+** (probado con 3.13 y 3.14).

### 1. Backend

```bash
cd backend
python -m venv .venv
# Windows:            .venv\Scripts\activate
# macOS / Linux:      source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate            # crea las tablas (SQLite: backend/db.sqlite3)
python manage.py inicializar_datos  # usuarios admin/cajero + datos de ejemplo
python manage.py runserver          # http://127.0.0.1:8000/api/
```

Pruebas automáticas del backend (9 pruebas de los flujos principales):

```bash
python manage.py test pos
```

### 2. Frontend

Es estático: basta servir la carpeta `frontend/` (Live Server de VS Code, o):

```bash
cd frontend
python -m http.server 5500          # http://127.0.0.1:5500/login.html
```

En `localhost` el frontend usa automáticamente `http://127.0.0.1:8000/api` (ver `frontend/js/config.js`).

### 3. Base de datos con PostgreSQL (opcional en local)

```bash
# Con una base PostgreSQL creada:
set DATABASE_URL=postgresql://usuario:clave@localhost:5432/pos_papel_luna   # Windows (cmd)
export DATABASE_URL=postgresql://usuario:clave@localhost:5432/pos_papel_luna # macOS / Linux
python manage.py migrate && python manage.py inicializar_datos
```

Alternativa sin Django: ejecutar en orden `backend/sql/01_esquema_postgresql.sql` y `backend/sql/02_datos_iniciales.sql`
(se regeneran con `python sql/generar_sql.py`). Lo recomendado es `migrate`, porque deja registrado el estado de
las migraciones.

---

## 🚀 Despliegue

### Backend + base de datos en Render

1. En Render: **New + → Blueprint** y elegir este repositorio. `render.yaml` crea el servicio web
   (`backend/`, Python) y una base **PostgreSQL** gratuita, y conecta `DATABASE_URL` sola.
2. `backend/build.sh` instala dependencias, aplica migraciones y crea los usuarios iniciales en cada despliegue.
3. Revisar que `CORS_ALLOWED_ORIGINS` tenga la URL exacta del frontend (sin `/` al final).
4. Comprobar: abrir `https://<servicio>.onrender.com/` → `{"estado": "ok"}`.

> La base PostgreSQL gratuita de Render expira a los 30 días. Si hace falta más tiempo, se puede usar Neon o
> Supabase (también gratis) y pegar su cadena de conexión en la variable `DATABASE_URL` del servicio.

### Frontend en Vercel

1. Importar el repositorio en Vercel con **Root Directory = `frontend`** (sin build: es estático).
2. Si la URL del backend no es `https://papeleria-lunam-api.onrender.com/api`, cambiar `API_PRODUCCION` en
   `frontend/js/config.js`.

---

## 📁 Estructura

```
papeleria-lunam/
├── backend/
│   ├── config/            settings.py (BD, JWT, CORS por variables de entorno), urls.py
│   ├── pos/
│   │   ├── models.py      modelos (tablas)
│   │   ├── serializers.py modelo ⇄ JSON
│   │   ├── urls.py        rutas REST
│   │   ├── views/         controladores: auth, catalogo, terceros, ventas, compras, faltantes, reportes
│   │   ├── services/      reglas de negocio y transacciones: ventas, compras, reportes
│   │   ├── permisos.py    roles
│   │   ├── management/commands/inicializar_datos.py   usuarios y datos iniciales
│   │   └── tests.py       pruebas de la API
│   ├── sql/               01_esquema_postgresql.sql, 02_datos_iniciales.sql, generar_sql.py
│   ├── build.sh           construcción en Render
│   └── requirements.txt
├── frontend/
│   ├── index.html, login.html
│   ├── css/pos.css        sistema visual completo (tokens, componentes, responsive, impresión)
│   └── js/
│       ├── api.js         ÚNICO archivo con fetch (REST + JWT + refresh)
│       ├── config.js      URL del backend (local / producción)
│       ├── sesion.js      sesión persistente y rol
│       ├── datos.js       catálogos compartidos + aviso de cambios entre módulos
│       ├── navegacion.js  módulos (#venta, #ventas, ...) y menú lateral en celular
│       ├── modal.js       ventana emergente accesible y diálogos de confirmación
│       ├── venta.js, catalogo.js, historial.js, ventas-admin.js (corrección y reembolso)
│       └── productos.js, compras.js, entidades.js, descuentos.js, faltantes.js, reportes.js
├── postman/               colección de la API
└── render.yaml            blueprint de despliegue
```
