// js/productos.js
// Vista de productos (listar, crear, editar, eliminar) y el modal de edición.
// El mismo modal se reutiliza desde la venta, en modo "básico" (sin código ni stock).
import { listar, crear, actualizar, eliminar } from "./api.js";
import { estado } from "./state.js";
import { formatearMoneda, escapeHTML, mismoId, mostrarToast, parseItems } from "./utils.js";
import { redibujarCatalogo } from "./catalogo.js";

const el = (id) => document.getElementById(id);
const controla = (p) => p.seguimientoInventario === true || p.seguimientoInventario === "true";

let editando = null;     // producto que se edita (null = producto nuevo)
let modoBasico = false;  // true: solo nombre, categoría, precio y costo
let alGuardar = null;    // función que se llama con el producto ya guardado
let guardando = false;

function nombreCategoria(id) {
  const c = estado.categorias.find((c) => mismoId(c.id, id));
  return c ? c.nombre : "Sin categoría";
}

// ---------- Listado ----------
export async function cargarProductos() {
  const cont = el("tabla-productos");
  cont.innerHTML = '<p class="estado-carga">Cargando productos...</p>';
  try {
    const [productos, categorias] = await Promise.all([listar("productos"), listar("categorias")]);
    estado.productos = productos;
    estado.categorias = categorias;
    dibujarTabla();
  } catch (e) {
    cont.innerHTML = `<div class="estado-error"><p>${escapeHTML(e.message)}</p>
      <button id="btn-reintentar-prod" class="btn-add">Reintentar</button></div>`;
    el("btn-reintentar-prod").onclick = cargarProductos;
  }
}

function dibujarTabla() {
  const cont = el("tabla-productos");
  if (estado.productos.length === 0) {
    cont.innerHTML = '<p class="estado-carga">Aún no hay productos. Crea el primero.</p>';
    return;
  }
  cont.innerHTML = `<table>
    <thead><tr><th>Código</th><th>Nombre</th><th>Categoría</th><th>Precio</th><th>Costo</th><th>Stock</th><th></th></tr></thead>
    <tbody>${estado.productos.map((p) => {
      const id = escapeHTML(p.id);
      return `<tr>
        <td>${escapeHTML(p.codigo)}</td>
        <td>${escapeHTML(p.nombre)}</td>
        <td>${escapeHTML(nombreCategoria(p.categoriaId))}</td>
        <td>${formatearMoneda(p.precio)}</td>
        <td>${formatearMoneda(p.costo)}</td>
        <td>${controla(p) ? Number(p.stock) : "—"}</td>
        <td class="acciones">
          <button class="btn-recuperar" data-accion="editar" data-id="${id}">Editar</button>
          <button class="btn-mini-peligro" data-accion="eliminar" data-id="${id}">🗑️</button>
        </td></tr>`;
    }).join("")}</tbody></table>`;
}

// ---------- Modal ----------
function ajustarCampos() {
  document.querySelectorAll(".campo-avanzado").forEach((c) => c.classList.toggle("oculto", modoBasico));
  if (!modoBasico) el("p-stock-campo").classList.toggle("oculto", !el("p-seguimiento").checked);
}

export function abrirEditorProducto(producto = null, opciones = {}) {
  editando = producto;
  modoBasico = !!opciones.soloBasico;
  alGuardar = opciones.alGuardar || null;

  el("titulo-modal-producto").textContent = producto ? "Editar producto" : "Nuevo producto";
  el("p-categoria").innerHTML = '<option value="">Selecciona una categoría...</option>' +
    estado.categorias.map((c) => `<option value="${escapeHTML(c.id)}">${escapeHTML(c.nombre)}</option>`).join("");

  el("p-codigo").value = producto ? producto.codigo : "";
  el("p-nombre").value = producto ? producto.nombre : "";
  el("p-categoria").value = producto ? String(producto.categoriaId) : "";
  el("p-precio").value = producto ? producto.precio : "";
  el("p-costo").value = producto ? producto.costo : "";
  el("p-seguimiento").checked = producto ? controla(producto) : true;
  el("p-stock").value = producto ? Number(producto.stock) || 0 : 0;
  el("p-error").textContent = "";

  ajustarCampos();
  el("modal-producto").classList.remove("oculto");
  el("p-nombre").focus();
}

function cerrarModal() {
  el("modal-producto").classList.add("oculto");
}

async function guardar(e) {
  e.preventDefault();
  if (guardando) return;
  const error = (t) => { el("p-error").textContent = t; };

  const datos = {
    nombre: el("p-nombre").value.trim(),
    categoriaId: el("p-categoria").value,
    precio: Number(el("p-precio").value),
    costo: Number(el("p-costo").value)
  };
  if (!datos.nombre) return error("El nombre es obligatorio.");
  if (!datos.categoriaId) return error("Selecciona una categoría.");
  if (!(datos.precio > 0)) return error("El precio debe ser mayor que 0.");
  if (el("p-costo").value === "" || !(datos.costo >= 0)) return error("El costo no puede ser negativo.");

  if (!modoBasico) {
    datos.codigo = el("p-codigo").value.trim();
    if (!datos.codigo) return error("El código es obligatorio.");
    const repetido = estado.productos.some((p) =>
      String(p.codigo).toLowerCase() === datos.codigo.toLowerCase() &&
      !(editando && mismoId(p.id, editando.id)));
    if (repetido) return error("Ya existe un producto con ese código.");

    datos.seguimientoInventario = el("p-seguimiento").checked;
    const stock = Number(el("p-stock").value);
    if (datos.seguimientoInventario && (!Number.isInteger(stock) || stock < 0)) {
      return error("El stock debe ser un número entero de 0 en adelante.");
    }
    datos.stock = datos.seguimientoInventario ? stock : 0;
  }

  const boton = el("p-guardar");
  guardando = true;
  boton.disabled = true;
  boton.textContent = "Guardando...";
  try {
    let guardado;
    if (editando) {
      guardado = await actualizar("productos", { id: editando.id, ...datos });
      const i = estado.productos.findIndex((p) => mismoId(p.id, editando.id));
      estado.productos[i] = { ...estado.productos[i], ...guardado };
      guardado = estado.productos[i];
    } else {
      guardado = await crear("productos", datos);
      estado.productos.push(guardado);
    }
    cerrarModal();
    dibujarTabla();
    redibujarCatalogo();
    if (alGuardar) alGuardar(guardado);
    mostrarToast("Producto guardado ✓");
  } catch (err) {
    error(err.message);
  } finally {
    guardando = false;
    boton.disabled = false;
    boton.textContent = "Guardar";
  }
}

// ---------- Eliminar (solo si no tiene ventas ni compras asociadas) ----------
async function eliminarProducto(id) {
  const p = estado.productos.find((p) => mismoId(p.id, id));
  if (!p || !confirm(`¿Eliminar "${p.nombre}"?`)) return;
  try {
    const [ventas, compras] = await Promise.all([listar("ventas"), listar("compras")]);
    const enUso = [...ventas, ...compras].some((r) =>
      parseItems(r.itemsJson).some((it) => mismoId(it.productoId, id)));
    if (enUso) {
      return mostrarToast("No se puede eliminar: el producto tiene ventas o compras asociadas.", 4500);
    }
    await eliminar("productos", id);
    estado.productos = estado.productos.filter((p) => !mismoId(p.id, id));
    dibujarTabla();
    redibujarCatalogo();
    mostrarToast("Producto eliminado.");
  } catch (e) {
    mostrarToast(e.message, 4500);
  }
}

// ---------- Arranque ----------
export function iniciarProductos() {
  el("btn-nuevo-producto").addEventListener("click", () => abrirEditorProducto(null));
  el("form-producto").addEventListener("submit", guardar);
  el("p-cancelar").addEventListener("click", cerrarModal);
  el("p-seguimiento").addEventListener("change", ajustarCampos);
  el("tabla-productos").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-accion]");
    if (!b) return;
    if (b.dataset.accion === "editar") {
      abrirEditorProducto(estado.productos.find((p) => mismoId(p.id, b.dataset.id)));
    } else {
      eliminarProducto(b.dataset.id);
    }
  });
}
