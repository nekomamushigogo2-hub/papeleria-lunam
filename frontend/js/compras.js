// js/compras.js
// Registro de compras a proveedores, listado y detalle (solo administrador).
// El backend crea la compra, sus líneas y suma el stock en una sola transacción.
import { listar, crear } from "./api.js";
import { estado } from "./state.js";
import {
  formatearMoneda, escapeHTML, mismoId, mostrarToast, leerItems, formatearFecha, fechaLocalISO,
  opcionesSelect, ico
} from "./utils.js";
import { abrirModal } from "./modal.js";
import { alCambiar, recargar } from "./datos.js";
import { alMostrar } from "./navegacion.js";
import { esAdmin } from "./sesion.js";

const el = (id) => document.getElementById(id);

let itemsCompra = [];
let guardandoCompra = false;
let compras = [];

const totalCompra = () => itemsCompra.reduce((acc, it) => acc + it.costo * it.cantidad, 0);

function dibujarItemsCompra() {
  const contenedor = el("compra-items-lista");
  if (itemsCompra.length === 0) {
    contenedor.innerHTML = '<p class="nota-rol">No has agregado productos a la compra.</p>';
    el("compra-total-txt").textContent = "$0";
    return;
  }
  contenedor.innerHTML = itemsCompra.map((it, idx) => `
    <div class="compra-item">
      <span><strong>${escapeHTML(it.nombre)}</strong> (${it.cantidad} u. × ${formatearMoneda(it.costo)})</span>
      <span>
        <strong>${formatearMoneda(it.costo * it.cantidad)}</strong>
        <button type="button" data-idx="${idx}" class="btn-eliminar btn-eliminar-item-compra" aria-label="Quitar ${escapeHTML(it.nombre)}">${ico("eliminar")}</button>
      </span>
    </div>`).join("");
  el("compra-total-txt").textContent = formatearMoneda(totalCompra());
}

function llenarSelectores() {
  el("compra-proveedor").innerHTML = opcionesSelect(estado.proveedores, { vacio: "Selecciona proveedor...", elegido: el("compra-proveedor").value });
  el("compra-producto").innerHTML = opcionesSelect(estado.productos, { vacio: "Selecciona producto...", elegido: el("compra-producto").value });
  el("filtro-compra-proveedor").innerHTML = opcionesSelect(estado.proveedores, { vacio: "Todos los proveedores", elegido: el("filtro-compra-proveedor").value });
}

function agregarItemCompra() {
  const prod = estado.productos.find((p) => mismoId(p.id, el("compra-producto").value));
  const cantidad = Number(el("compra-cantidad").value);
  const costoTxt = el("compra-costo").value;
  const costo = costoTxt === "" ? Number(prod?.costo || 0) : Number(costoTxt);

  if (!prod) return mostrarToast("Selecciona un producto.");
  if (!Number.isInteger(cantidad) || cantidad <= 0) return mostrarToast("Ingresa una cantidad entera mayor que 0.");
  if (!Number.isInteger(costo) || costo < 0) return mostrarToast("El costo debe ser un número entero mayor o igual a 0.");

  itemsCompra.push({ productoId: prod.id, nombre: prod.nombre, cantidad, costo });
  el("compra-producto").value = "";
  el("compra-cantidad").value = "1";
  el("compra-costo").value = "";
  dibujarItemsCompra();
}

async function guardarCompra() {
  if (guardandoCompra) return;
  const proveedorId = el("compra-proveedor").value;
  if (!proveedorId) return mostrarToast("Selecciona un proveedor.");
  if (itemsCompra.length === 0) return mostrarToast("Agrega al menos un producto a la compra.");

  const btn = el("btn-guardar-compra");
  guardandoCompra = true;
  btn.disabled = true;
  btn.textContent = "Registrando...";

  try {
    const compra = await crear("compras", {
      proveedorId: Number(proveedorId),
      items: itemsCompra.map(({ productoId, cantidad, costo }) => ({ productoId, cantidad, costo }))
    });
    itemsCompra = [];
    dibujarItemsCompra();
    recargar("productos");            // stock y costo actualizados
    cargarHistorialCompras();
    mostrarToast(`Compra registrada por ${formatearMoneda(compra.total)} y stock actualizado ✓`, 3500);
  } catch (e) {
    mostrarToast("Error al registrar la compra: " + e.message, 4500);
  } finally {
    guardandoCompra = false;
    btn.disabled = false;
    btn.textContent = "Registrar compra";
  }
}

// ---------- Historial de compras ----------
async function cargarHistorialCompras() {
  if (!esAdmin()) return;
  const lista = el("historial-compras-lista");
  if (!compras.length) lista.innerHTML = '<p class="estado-carga">Cargando compras...</p>';
  try {
    compras = await listar("compras");
    dibujarHistorialCompras();
  } catch (e) {
    lista.innerHTML = `
      <div class="estado-error">
        <p>${escapeHTML(e.message)}</p>
        <button type="button" id="btn-reintentar-compras" class="btn-add">Reintentar</button>
      </div>`;
    el("btn-reintentar-compras").onclick = cargarHistorialCompras;
  }
}

function dibujarHistorialCompras() {
  const lista = el("historial-compras-lista");
  const proveedor = el("filtro-compra-proveedor").value;
  const desde = el("filtro-compra-desde").value;
  const hasta = el("filtro-compra-hasta").value;

  const filtradas = compras.filter((c) => {
    const dia = fechaLocalISO(c.fecha);
    if (proveedor && !mismoId(c.proveedorId, proveedor)) return false;
    if (desde && dia < desde) return false;
    if (hasta && dia > hasta) return false;
    return true;
  });

  const total = filtradas.reduce((acc, c) => acc + Number(c.total || 0), 0);
  el("historial-compras-resumen").textContent =
    `${filtradas.length} compra${filtradas.length === 1 ? "" : "s"} · Total ${formatearMoneda(total)}`;

  if (filtradas.length === 0) {
    lista.innerHTML = '<p class="historial-vacio">No hay compras con esos filtros.</p>';
    return;
  }

  lista.innerHTML = filtradas.map((c) => {
    const unidades = leerItems(c).reduce((acc, it) => acc + Number(it.cantidad || 0), 0);
    return `
      <div class="registro-fila">
        <div class="registro-info">
          <strong>#${c.id} · ${formatearMoneda(c.total)}</strong>
          <span>${formatearFecha(c.fecha)} · ${escapeHTML(c.proveedorNombre)} · ${unidades} unidad${unidades === 1 ? "" : "es"} · ${escapeHTML(c.usuario)}</span>
        </div>
        <button type="button" class="btn-recuperar btn-ver-compra" data-id="${escapeHTML(c.id)}">Ver detalle</button>
      </div>`;
  }).join("");
}

function mostrarDetalleCompra(compra) {
  const filas = leerItems(compra).map((it) => `
    <tr>
      <td>${escapeHTML(it.nombre)}</td>
      <td class="num">${Number(it.cantidad)}</td>
      <td class="num">${formatearMoneda(it.costo)}</td>
      <td class="num">${formatearMoneda(it.subtotal)}</td>
    </tr>`).join("");

  abrirModal(`
    <h3>Detalle de compra</h3>
    <div class="factura-datos">
      <p><strong>Compra N°:</strong> ${compra.id}</p>
      <p><strong>Fecha:</strong> ${formatearFecha(compra.fecha)}</p>
      <p><strong>Proveedor:</strong> ${escapeHTML(compra.proveedorNombre)}</p>
      <p><strong>Registró:</strong> ${escapeHTML(compra.usuario)}</p>
    </div>
    <div class="tabla-scroll">
      <table class="tabla-detalle">
        <thead>
          <tr><th>Producto</th><th class="num">Cant.</th><th class="num">Costo unit.</th><th class="num">Subtotal</th></tr>
        </thead>
        <tbody>${filas || '<tr><td colspan="4">Sin productos</td></tr>'}</tbody>
      </table>
    </div>
    <div class="invoice-totals">
      <div class="row total"><span>Total</span><span>${formatearMoneda(compra.total)}</span></div>
    </div>
    <div class="modal-buttons">
      <button type="button" class="btn-modal-secundario" data-cerrar-modal>Cerrar</button>
    </div>`);
}

export function iniciarCompras() {
  dibujarItemsCompra();
  alCambiar(["productos", "proveedores"], llenarSelectores);
  alMostrar("compras", cargarHistorialCompras);

  ["filtro-compra-proveedor", "filtro-compra-desde", "filtro-compra-hasta"]
    .forEach((id) => el(id).addEventListener("change", dibujarHistorialCompras));
  el("btn-recargar-compras").addEventListener("click", cargarHistorialCompras);

  el("historial-compras-lista").addEventListener("click", (e) => {
    const b = e.target.closest(".btn-ver-compra");
    if (!b) return;
    const compra = compras.find((c) => mismoId(c.id, b.dataset.id));
    if (compra) mostrarDetalleCompra(compra);
  });

  el("btn-agregar-item-compra").addEventListener("click", agregarItemCompra);
  el("btn-guardar-compra").addEventListener("click", guardarCompra);

  el("compra-items-lista").addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-eliminar-item-compra");
    if (!btn) return;
    itemsCompra.splice(Number(btn.dataset.idx), 1);
    dibujarItemsCompra();
  });

  // Al elegir producto se sugiere su costo actual
  el("compra-producto").addEventListener("change", (e) => {
    const prod = estado.productos.find((p) => mismoId(p.id, e.target.value));
    el("compra-costo").value = prod ? prod.costo : "";
  });
}
