// js/productos.js
// CRUD de productos (solo admin) y edición "en caliente" desde la venta (admin y cajero).
import { crear, actualizar, eliminar } from "./api.js";
import { estado } from "./state.js";
import { formatearMoneda, escapeHTML, mismoId, mostrarToast, opcionesSelect, ico, normalizar } from "./utils.js";
import { abrirModal, cerrarModal, confirmar } from "./modal.js";
import { alCambiar, avisarCambio, recargar } from "./datos.js";
import { esAdmin } from "./sesion.js";

const el = (id) => document.getElementById(id);
const controlaStock = (p) => p.seguimientoInventario === true;

let guardando = false;

// ---------- Listado ----------
export function redibujarProductos() {
  const lista = el("productos-lista");
  const termino = normalizar(el("buscador-productos").value);
  const productos = estado.productos.filter((p) =>
    normalizar(p.nombre).includes(termino) || normalizar(p.codigo).includes(termino));

  if (productos.length === 0) {
    lista.innerHTML = '<p class="historial-vacio">No hay productos que coincidan.</p>';
    return;
  }

  const admin = esAdmin();
  lista.innerHTML = productos.map((p) => {
    const stock = controlaStock(p)
      ? (Number(p.stock) <= 0 ? '<b style="color: var(--margen)">Agotado</b>' : `Stock: ${Number(p.stock)}`)
      : "Sin seguimiento";
    const codigo = p.codigo ? `${escapeHTML(p.codigo)} · ` : "";
    const acciones = admin ? `
        <div class="registro-acciones">
          <button type="button" class="btn-vaciar btn-editar-producto" data-id="${escapeHTML(p.id)}">${ico("editar")}Editar</button>
          <button type="button" class="btn-vaciar btn-eliminar-producto" data-id="${escapeHTML(p.id)}">${ico("eliminar")}Eliminar</button>
        </div>` : "";
    return `
      <div class="registro-fila">
        <div class="registro-info">
          <strong>${escapeHTML(p.nombre)}</strong>
          <span>${codigo}${escapeHTML(p.categoriaNombre || "Sin categoría")} · Precio ${formatearMoneda(p.precio)} · Costo ${formatearMoneda(p.costo)} · ${stock}</span>
        </div>${acciones}
      </div>`;
  }).join("");
}

async function cargarProductos() {
  el("productos-lista").innerHTML = '<p class="estado-carga">Cargando productos...</p>';
  try {
    await recargar("productos", "categorias");
  } catch (e) {
    el("productos-lista").innerHTML = `
      <div class="estado-error">
        <p>${escapeHTML(e.message)}</p>
        <button type="button" id="btn-reintentar-productos" class="btn-add">Reintentar</button>
      </div>`;
    el("btn-reintentar-productos").onclick = cargarProductos;
  }
}

// ---------- Formulario (crear / editar / edición rápida desde la venta) ----------
// rapido = true: solo nombre, categoría, precio y costo (lo que el cajero puede tocar)
export function abrirFormularioProducto(id = null, { rapido = false } = {}) {
  const p = id ? estado.productos.find((x) => mismoId(x.id, id)) : null;
  if (id && !p) return mostrarToast("El producto ya no existe. Recarga el catálogo.", 3500);

  const sigue = p ? controlaStock(p) : true;
  const camposCompletos = rapido ? "" : `
    <div class="campo">
      <label for="prod-codigo">Código</label>
      <input type="text" id="prod-codigo" value="${escapeHTML(p?.codigo ?? "")}" placeholder="Ej: CUA-001">
    </div>
    <label class="check-linea">
      <input type="checkbox" id="prod-seguimiento" ${sigue ? "checked" : ""}>
      Llevar seguimiento de inventario
    </label>
    <div class="campo" id="campo-prod-stock">
      <label for="prod-stock">Stock</label>
      <input type="number" id="prod-stock" min="0" step="1" value="${p ? Number(p.stock) || 0 : 0}">
    </div>`;

  const titulo = rapido ? "Editar producto (venta en curso)" : (p ? "Editar producto" : "Nuevo producto");

  abrirModal(`
    <h3>${titulo}</h3>
    <form id="form-producto" class="form-modal" novalidate>
      <div class="campo">
        <label for="prod-nombre">Nombre *</label>
        <input type="text" id="prod-nombre" value="${escapeHTML(p?.nombre ?? "")}" required>
      </div>
      <div class="campo">
        <label for="prod-categoria">Categoría *</label>
        <select id="prod-categoria">${opcionesSelect(estado.categorias, { vacio: "Selecciona categoría...", elegido: p?.categoriaId })}</select>
      </div>
      <div class="form-modal-fila">
        <div class="campo">
          <label for="prod-precio">Precio de venta *</label>
          <input type="number" id="prod-precio" min="1" step="1" value="${p ? Number(p.precio) || 0 : ""}">
        </div>
        <div class="campo">
          <label for="prod-costo">Costo</label>
          <input type="number" id="prod-costo" min="0" step="1" value="${p ? Number(p.costo) || 0 : ""}">
        </div>
      </div>
      ${camposCompletos}
      <div class="modal-buttons">
        <button type="button" class="btn-modal-secundario" data-cerrar-modal>Cancelar</button>
        <button type="submit" class="btn-add" id="btn-guardar-producto">${p ? "Guardar cambios" : "Crear producto"}</button>
      </div>
    </form>`);

  const check = el("prod-seguimiento");
  if (check) {
    const alternar = () => el("campo-prod-stock").classList.toggle("oculto", !check.checked);
    check.addEventListener("change", alternar);
    alternar();
  }

  el("form-producto").addEventListener("submit", (e) => {
    e.preventDefault();
    guardarProducto(p, rapido);
  });
  el("prod-nombre").focus();
}

function leerFormulario(rapido) {
  const nombre = el("prod-nombre").value.trim();
  const categoriaId = el("prod-categoria").value;
  const precio = Number(el("prod-precio").value);
  const costoTxt = el("prod-costo").value;
  const costo = costoTxt === "" ? 0 : Number(costoTxt);

  if (!nombre) throw new Error("El nombre es obligatorio.");
  if (!categoriaId) throw new Error("Selecciona una categoría.");
  if (!Number.isInteger(precio) || precio <= 0) throw new Error("El precio debe ser un número entero mayor que 0.");
  if (!Number.isInteger(costo) || costo < 0) throw new Error("El costo debe ser un número entero mayor o igual a 0.");

  const datos = { nombre, categoriaId: Number(categoriaId), precio, costo };
  if (rapido) return datos;

  const seguimientoInventario = el("prod-seguimiento").checked;
  const stock = seguimientoInventario ? Number(el("prod-stock").value) : 0;
  if (seguimientoInventario && (!Number.isInteger(stock) || stock < 0)) {
    throw new Error("El stock debe ser un número entero mayor o igual a 0.");
  }
  return { ...datos, codigo: el("prod-codigo").value.trim(), seguimientoInventario, stock };
}

async function guardarProducto(original, rapido) {
  if (guardando) return;
  let datos;
  try {
    datos = leerFormulario(rapido);
  } catch (e) {
    return mostrarToast(e.message, 3500);
  }

  const boton = el("btn-guardar-producto");
  guardando = true;
  boton.disabled = true;
  boton.textContent = "Guardando...";

  try {
    // El backend valida nombre/código repetidos y responde con el producto guardado
    const guardado = original
      ? await actualizar("productos", { id: original.id, ...datos })
      : await crear("productos", datos);

    if (original) Object.assign(original, guardado);
    else estado.productos.push(guardado);
    estado.productos.sort((a, b) => a.nombre.localeCompare(b.nombre));

    cerrarModal();
    avisarCambio("productos");      // catálogo, venta en curso, compras y faltantes se redibujan
    mostrarToast(original ? "Producto actualizado ✓" : "Producto creado ✓");
  } catch (e) {
    mostrarToast("Error al guardar: " + e.message, 4000);
    boton.disabled = false;
    boton.textContent = original ? "Guardar cambios" : "Crear producto";
  } finally {
    guardando = false;
  }
}

// ---------- Eliminar ----------
async function eliminarProducto(id, boton) {
  const p = estado.productos.find((x) => mismoId(x.id, id));
  if (!p) return;
  if (estado.venta.some((l) => mismoId(l.productoId, id))) {
    return mostrarToast("Quita el producto de la venta en curso antes de eliminarlo.", 4000);
  }
  const ok = await confirmar({
    titulo: `¿Eliminar "${p.nombre}"?`,
    texto: "Desaparece del catálogo. Las facturas anteriores conservan su nombre y precio. No se puede deshacer.",
    aceptar: "Eliminar producto", cancelar: "Conservar", peligro: true
  });
  if (!ok) return;

  boton.disabled = true;
  try {
    await eliminar("productos", id);   // el backend lo impide si está en una venta abierta
    estado.productos = estado.productos.filter((x) => !mismoId(x.id, id));
    avisarCambio("productos");
    mostrarToast("Producto eliminado ✓");
  } catch (e) {
    boton.disabled = false;
    mostrarToast(e.message, 4500);
  }
}

// ---------- Arranque ----------
export function iniciarProductos() {
  el("buscador-productos").addEventListener("input", redibujarProductos);
  el("btn-nuevo-producto").addEventListener("click", () => abrirFormularioProducto());
  el("btn-recargar-productos").addEventListener("click", cargarProductos);
  alCambiar(["productos", "categorias"], redibujarProductos);

  el("productos-lista").addEventListener("click", (e) => {
    const editar = e.target.closest(".btn-editar-producto");
    const borrar = e.target.closest(".btn-eliminar-producto");
    if (editar) abrirFormularioProducto(editar.dataset.id);
    if (borrar) eliminarProducto(borrar.dataset.id, borrar);
  });

  el("productos-lista").innerHTML = '<p class="estado-carga">Cargando productos...</p>';
}
