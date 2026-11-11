// js/historial.js
// Historial de ventas cerradas: listado con filtros, detalle y factura (imprimir / PDF).
// La factura muestra si la venta fue corregida (por quién y cuándo) y sus reembolsos.
import { listar } from "./api.js";
import { estado } from "./state.js";
import {
  formatearMoneda, escapeHTML, mismoId, leerItems, formatearFecha, fechaLocalISO, numeroVenta,
  opcionesSelect, ico
} from "./utils.js";
import { abrirModal, cerrarModal } from "./modal.js";
import { esAdmin } from "./sesion.js";
import { alCambiar } from "./datos.js";
import { irA, alMostrar } from "./navegacion.js";
import { abrirCorreccion, abrirReembolso } from "./ventas-admin.js";
import { nuevaVenta } from "./venta.js";

const el = (id) => document.getElementById(id);

const COMERCIO = { nombre: "Papel y Luna", descripcion: "Papelería y miscelánea", logo: "img/logo.png" };

let ventasCerradas = [];

// ---------- Marcas (chips) ----------
function chipsVenta(v) {
  const chips = [];
  if (v.corregida) chips.push('<span class="chip chip-corregida">Corregida</span>');
  if (v.estadoReembolso === "parcial") chips.push('<span class="chip chip-parcial">Reembolso parcial</span>');
  if (v.estadoReembolso === "total") chips.push('<span class="chip chip-total">Reembolsada total</span>');
  return chips.join("");
}

// ---------- Factura ----------
// opciones.recienCerrada: muestra las acciones de continuidad (nueva venta / corregir)
export function mostrarFactura(venta, { recienCerrada = false, titulo = "" } = {}) {
  const filas = leerItems(venta).map((l) => `
    <tr>
      <td>${escapeHTML(l.nombre)}${l.cantidadReembolsada ? ` <small>(${l.cantidadReembolsada} reemb.)</small>` : ""}</td>
      <td class="num">${Number(l.cantidad)}</td>
      <td class="num">${formatearMoneda(l.precio)}</td>
      <td class="num">${formatearMoneda(l.subtotal)}</td>
    </tr>`).join("");

  const pagoEfectivo = venta.metodoPago === "Efectivo" && venta.valorRecibido != null ? `
    <div class="row"><span>Recibido</span><span>${formatearMoneda(venta.valorRecibido)}</span></div>
    <div class="row"><span>Cambio</span><span>${formatearMoneda(venta.cambio)}</span></div>` : "";

  const descuento = venta.valorDescuento ? `
    <div class="row"><span>Descuento: ${escapeHTML(venta.descuentoNombre)}</span><span>-${formatearMoneda(venta.valorDescuento)}</span></div>` : "";

  const marcaCorreccion = venta.corregida ? `
    <p class="factura-marca"><strong>Venta corregida</strong> por ${escapeHTML(venta.corregidaPor)} el ${formatearFecha(venta.corregidaEn)}</p>` : "";

  const reembolsos = (venta.reembolsos || []).length ? `
    <div class="factura-reembolsos">
      <h4>Reembolsos (${venta.estadoReembolso === "total" ? "total" : "parcial"})</h4>
      <table class="tabla-detalle">
        <tbody>
          ${venta.reembolsos.map((r) => `
            <tr>
              <td>${formatearFecha(r.fecha)} · ${escapeHTML(r.usuario)}<br>
                <small>${r.items.map((i) => `${i.cantidad} × ${escapeHTML(i.nombre)}${i.retornaInventario ? "" : " (no retorna)"}`).join(", ")}</small></td>
              <td class="num">-${formatearMoneda(r.total)}</td>
            </tr>`).join("")}
        </tbody>
      </table>
      <div class="invoice-totals"><div class="row total"><span>Neto después de reembolsos</span><span>${formatearMoneda(venta.total - venta.totalReembolsado)}</span></div></div>
    </div>` : "";

  const puedeCorregir = esAdmin() && !(venta.reembolsos || []).length;
  const acciones = `
    ${recienCerrada || titulo ? `<button type="button" class="btn-add" id="btn-factura-nueva">${ico("venta")}Nueva venta</button>` : ""}
    ${puedeCorregir ? `<button type="button" class="btn-modal-secundario" id="btn-factura-corregir">${ico("editar")}Corregir</button>` : ""}
    <button type="button" class="btn-imprimir" id="btn-imprimir-factura">${ico("imprimir")}Imprimir o guardar PDF</button>
    <button type="button" class="btn-modal-secundario" data-cerrar-modal>Cerrar</button>`;

  abrirModal(`
    ${titulo ? `<p class="resumen-modal aviso-exito no-imprimir">${ico("check")}${titulo}</p>` : ""}
    ${recienCerrada ? `<p class="resumen-modal aviso-exito no-imprimir">${ico("check")}Venta cobrada${venta.metodoPago === "Efectivo" ? `. Cambio: ${formatearMoneda(venta.cambio ?? 0)}` : ""}</p>` : ""}
    <div class="factura-doc">
      <div class="factura-encabezado">
        <img src="${COMERCIO.logo}" alt="Logo ${COMERCIO.nombre}">
        <div>
          <h3>${COMERCIO.nombre}</h3>
          <p>${COMERCIO.descripcion}</p>
        </div>
      </div>

      <div class="factura-datos">
        <p><strong>Factura N°:</strong> ${numeroVenta(venta.id)}</p>
        <p><strong>Fecha:</strong> ${formatearFecha(venta.fechaCierre || venta.fecha)}</p>
        <p><strong>Cliente:</strong> ${escapeHTML(venta.clienteNombre || "Sin cliente")}</p>
        <p><strong>Método de pago:</strong> ${escapeHTML(venta.metodoPago)}</p>
        <p><strong>Atendió:</strong> ${escapeHTML(venta.cerradaPor || venta.creadaPor || "")}</p>
      </div>
      ${marcaCorreccion}

      <div class="tabla-scroll">
        <table class="tabla-detalle">
          <thead>
            <tr><th>Producto</th><th class="num">Cant.</th><th class="num">Precio</th><th class="num">Subtotal</th></tr>
          </thead>
          <tbody>${filas || '<tr><td colspan="4">Sin productos</td></tr>'}</tbody>
        </table>
      </div>

      <div class="invoice-totals">
        <div class="row"><span>Subtotal</span><span>${formatearMoneda(venta.subtotal)}</span></div>
        ${descuento}
        <div class="row total"><span>Total</span><span>${formatearMoneda(venta.total)}</span></div>
        ${pagoEfectivo}
      </div>
      ${reembolsos}

      <p class="factura-gracias">¡Gracias por tu compra!</p>
    </div>

    <div class="modal-buttons no-imprimir">${acciones}</div>`);

  el("btn-imprimir-factura").addEventListener("click", () => window.print());
  el("btn-factura-nueva")?.addEventListener("click", () => { cerrarModal(); nuevaVenta(); irA("venta"); });
  el("btn-factura-corregir")?.addEventListener("click", () => abrirCorreccion(venta));
}

// ---------- Listado ----------
export async function cargarHistorial() {
  const lista = el("historial-ventas-lista");
  if (!ventasCerradas.length) lista.innerHTML = '<p class="estado-carga">Cargando historial...</p>';
  try {
    ventasCerradas = await listar("ventas", { estado: "cerrada" });
    ventasCerradas.sort((a, b) => new Date(b.fechaCierre) - new Date(a.fechaCierre));
    dibujarHistorial();
  } catch (e) {
    lista.innerHTML = `
      <div class="estado-error">
        <p>${escapeHTML(e.message)}</p>
        <button type="button" id="btn-reintentar-historial" class="btn-add">Reintentar</button>
      </div>`;
    el("btn-reintentar-historial").onclick = cargarHistorial;
  }
}

function llenarFiltroClientes() {
  el("filtro-venta-cliente").innerHTML = opcionesSelect(estado.clientes, {
    vacio: "Todos los clientes", elegido: el("filtro-venta-cliente").value
  });
}

function dibujarHistorial() {
  const lista = el("historial-ventas-lista");
  const desde = el("filtro-venta-desde").value;
  const hasta = el("filtro-venta-hasta").value;
  const metodo = el("filtro-venta-metodo").value;
  const cliente = el("filtro-venta-cliente").value;
  const marca = el("filtro-venta-marca").value;

  const filtradas = ventasCerradas.filter((v) => {
    const dia = fechaLocalISO(v.fechaCierre);
    if (desde && dia < desde) return false;
    if (hasta && dia > hasta) return false;
    if (metodo && v.metodoPago !== metodo) return false;
    if (cliente && !mismoId(v.clienteId, cliente)) return false;
    if (marca === "corregida" && !v.corregida) return false;
    if (marca === "reembolso" && v.estadoReembolso === "ninguno") return false;
    return true;
  });

  const total = filtradas.reduce((acc, v) => acc + Number(v.total || 0), 0);
  el("historial-ventas-resumen").textContent =
    `${filtradas.length} venta${filtradas.length === 1 ? "" : "s"} · Total ${formatearMoneda(total)}`;

  if (filtradas.length === 0) {
    lista.innerHTML = '<p class="historial-vacio">No hay ventas cerradas con esos filtros.</p>';
    return;
  }

  const admin = esAdmin();
  lista.innerHTML = filtradas.map((v) => {
    const id = escapeHTML(v.id);
    const corregir = admin && v.estadoReembolso === "ninguno"
      ? `<button type="button" class="btn-vaciar" data-corregir="${id}">${ico("editar")}Corregir</button>` : "";
    const reembolsar = admin && v.estadoReembolso !== "total"
      ? `<button type="button" class="btn-vaciar" data-reembolsar="${id}">${ico("reembolso")}Reembolsar</button>` : "";
    return `
      <div class="registro-fila">
        <div class="registro-info">
          <strong>#${numeroVenta(v.id)} · ${formatearMoneda(v.total)}</strong>
          <span>${formatearFecha(v.fechaCierre)} · ${escapeHTML(v.metodoPago)} · ${escapeHTML(v.clienteNombre || "Sin cliente")}${v.descuentoNombre ? " · Descuento " + escapeHTML(v.descuentoNombre) : ""}</span>
          <div class="chips">${chipsVenta(v)}</div>
        </div>
        <div class="registro-acciones">
          ${corregir}${reembolsar}
          <button type="button" class="btn-recuperar" data-ver="${id}">Ver factura</button>
        </div>
      </div>`;
  }).join("");
}

export function iniciarHistorial() {
  const filtros = ["filtro-venta-desde", "filtro-venta-hasta", "filtro-venta-metodo", "filtro-venta-cliente", "filtro-venta-marca"];
  filtros.forEach((id) => el(id).addEventListener("change", dibujarHistorial));

  el("btn-limpiar-filtros-venta").addEventListener("click", () => {
    filtros.forEach((id) => (el(id).value = ""));
    dibujarHistorial();
  });

  el("btn-recargar-historial").addEventListener("click", cargarHistorial);
  alCambiar("clientes", llenarFiltroClientes);
  alMostrar("ventas", cargarHistorial);

  el("historial-ventas-lista").addEventListener("click", (e) => {
    const b = e.target.closest("[data-ver], [data-corregir], [data-reembolsar]");
    if (!b) return;
    const id = b.dataset.ver || b.dataset.corregir || b.dataset.reembolsar;
    const venta = ventasCerradas.find((v) => mismoId(v.id, id));
    if (!venta) return;
    if (b.dataset.ver) mostrarFactura(venta);
    if (b.dataset.corregir) abrirCorreccion(venta);
    if (b.dataset.reembolsar) abrirReembolso(venta);
  });
}
