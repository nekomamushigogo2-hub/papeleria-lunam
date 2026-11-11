// js/ventas-admin.js
// Operaciones administrativas sobre ventas cerradas (solo administrador):
//   - Corrección: cambiar productos, cantidades, cliente, método de pago y descuento.
//   - Reembolso: parcial o total, por producto, indicando si vuelve al inventario.
// Los totales se recalculan aquí para mostrarlos al instante, pero el valor que
// cuenta es el que calcula el backend dentro de una transacción.
import { ejecutar } from "./api.js";
import { estado } from "./state.js";
import {
  formatearMoneda, escapeHTML, mismoId, mostrarToast, calcularDescuento, textoDescuento,
  opcionesSelect, numeroVenta, ico
} from "./utils.js";
import { abrirModal, confirmar } from "./modal.js";
import { recargar } from "./datos.js";
import { mostrarFactura, cargarHistorial } from "./historial.js";

const el = (id) => document.getElementById(id);
const METODOS = ["Efectivo", "Nequi", "Debe"];

// ===================================================================
// CORRECCIÓN DE VENTA CERRADA
// ===================================================================
export function abrirCorreccion(venta) {
  if ((venta.reembolsos || []).length) {
    return mostrarToast("Esta venta ya tiene reembolsos: no se puede corregir.", 4000);
  }

  // Copia editable de las líneas (el precio original se conserva si el producto ya estaba)
  let lineas = venta.items.filter((i) => i.productoId).map((i) => ({
    productoId: i.productoId, nombre: i.nombre, precio: i.precio, cantidad: i.cantidad
  }));
  const precioOriginal = Object.fromEntries(venta.items.map((i) => [i.productoId, i.precio]));
  const tieneDescuento = Boolean(venta.descuentoNombre);

  const opcionesDescuento =
    (tieneDescuento ? `<option value="__conservar">Conservar: ${escapeHTML(venta.descuentoNombre)}</option>` : "") +
    '<option value="">Sin descuento</option>' +
    estado.descuentos.map((d) => `<option value="${d.id}">${escapeHTML(d.nombre)} (${textoDescuento(d)})</option>`).join("");

  abrirModal(`
    <h3>Corregir venta #${numeroVenta(venta.id)}</h3>
    <p class="nota-rol">La venta conserva su número. El inventario se ajusta por la diferencia con la venta original.</p>

    <div class="editor-lineas" id="corr-lineas"></div>

    <div class="editor-agregar">
      <div class="campo">
        <label for="corr-producto">Agregar producto</label>
        <select id="corr-producto">${opcionesSelect(estado.productos, { vacio: "Selecciona producto..." })}</select>
      </div>
      <button type="button" class="btn-add" id="corr-agregar">${ico("mas")}Agregar</button>
    </div>

    <div class="form-modal" style="margin-top: 12px;">
      <div class="form-modal-fila">
        <div class="campo">
          <label for="corr-cliente">Cliente</label>
          <select id="corr-cliente">${opcionesSelect(estado.clientes, { vacio: "Sin cliente", elegido: venta.clienteId })}</select>
        </div>
        <div class="campo">
          <label for="corr-metodo">Método de pago</label>
          <select id="corr-metodo">${METODOS.map((m) => `<option ${m === venta.metodoPago ? "selected" : ""}>${m}</option>`).join("")}</select>
        </div>
      </div>
      <div class="form-modal-fila">
        <div class="campo">
          <label for="corr-descuento">Descuento</label>
          <select id="corr-descuento">${opcionesDescuento}</select>
        </div>
        <div class="campo" id="corr-campo-recibido">
          <label for="corr-recibido">Valor recibido</label>
          <input type="number" id="corr-recibido" min="0" step="100" value="${venta.valorRecibido ?? ""}">
        </div>
      </div>
    </div>

    <div class="resumen-modal" id="corr-resumen"></div>

    <div class="modal-buttons">
      <button type="button" class="btn-modal-secundario" data-cerrar-modal>Cancelar</button>
      <button type="button" class="btn-add" id="corr-guardar">Guardar corrección</button>
    </div>`);

  function descuentoActual(subtotal) {
    const valor = el("corr-descuento").value;
    if (valor === "__conservar") {
      return { nombre: venta.descuentoNombre, monto: calcularDescuento(subtotal, venta.descuentoTipo, venta.descuentoValor) };
    }
    const d = estado.descuentos.find((x) => mismoId(x.id, valor));
    return d ? { nombre: d.nombre, monto: calcularDescuento(subtotal, d.tipo, d.valor) } : null;
  }

  function dibujar() {
    el("corr-lineas").innerHTML = lineas.length ? lineas.map((l, i) => `
      <div class="editor-linea">
        <span>${escapeHTML(l.nombre)}<br><small>${formatearMoneda(l.precio)} c/u</small></span>
        <input type="number" min="1" step="1" value="${l.cantidad}" data-idx="${i}" aria-label="Cantidad de ${escapeHTML(l.nombre)}">
        <span class="num" data-subtotal="${i}">${formatearMoneda(l.precio * l.cantidad)}</span>
        <button type="button" class="btn-eliminar" data-quitar="${i}" aria-label="Quitar ${escapeHTML(l.nombre)}">${ico("eliminar")}</button>
      </div>`).join("") : '<p class="historial-vacio">La venta debe tener al menos un producto.</p>';
    return dibujarResumen();
  }

  // Solo el resumen: se usa mientras se escribe una cantidad para no perder el cursor
  function dibujarResumen() {
    const subtotal = lineas.reduce((a, l) => a + l.precio * l.cantidad, 0);
    const d = descuentoActual(subtotal);
    const total = subtotal - (d ? d.monto : 0);
    const efectivo = el("corr-metodo").value === "Efectivo";
    el("corr-campo-recibido").classList.toggle("oculto", !efectivo);
    const recibido = Number(el("corr-recibido").value) || 0;

    el("corr-resumen").innerHTML = `
      <div class="row"><span>Subtotal</span><span>${formatearMoneda(subtotal)}</span></div>
      ${d ? `<div class="row"><span>Descuento: ${escapeHTML(d.nombre)}</span><span>-${formatearMoneda(d.monto)}</span></div>` : ""}
      <div class="row total"><span>Total corregido</span><span>${formatearMoneda(total)}</span></div>
      <div class="row"><span>Total original</span><span>${formatearMoneda(venta.total)}</span></div>
      ${efectivo ? `<div class="row"><span>Cambio</span><span>${formatearMoneda(Math.max(0, recibido - total))}</span></div>` : ""}`;
    return total;
  }

  el("corr-lineas").addEventListener("input", (e) => {
    const input = e.target.closest("input[data-idx]");
    if (!input) return;
    const idx = Number(input.dataset.idx);
    const n = parseInt(input.value, 10);
    if (n >= 1) lineas[idx].cantidad = n;
    el("corr-lineas").querySelector(`[data-subtotal="${idx}"]`).textContent =
      formatearMoneda(lineas[idx].precio * lineas[idx].cantidad);
    dibujarResumen();
  });
  el("corr-lineas").addEventListener("click", (e) => {
    const b = e.target.closest("[data-quitar]");
    if (!b) return;
    lineas.splice(Number(b.dataset.quitar), 1);
    dibujar();
  });
  el("corr-agregar").addEventListener("click", () => {
    const p = estado.productos.find((x) => mismoId(x.id, el("corr-producto").value));
    if (!p) return mostrarToast("Selecciona un producto.");
    const linea = lineas.find((l) => mismoId(l.productoId, p.id));
    if (linea) linea.cantidad++;
    else lineas.push({ productoId: p.id, nombre: p.nombre, precio: precioOriginal[p.id] ?? Number(p.precio), cantidad: 1 });
    el("corr-producto").value = "";
    dibujar();
  });

  ["corr-metodo", "corr-descuento", "corr-recibido", "corr-cliente"].forEach((id) =>
    el(id).addEventListener(id === "corr-recibido" ? "input" : "change", dibujarResumen));

  el("corr-guardar").addEventListener("click", async () => {
    const total = dibujarResumen();
    const metodo = el("corr-metodo").value;
    const recibido = el("corr-recibido").value;
    if (!lineas.length) return mostrarToast("La venta debe tener al menos un producto.");
    if (metodo === "Debe" && !el("corr-cliente").value) return mostrarToast("Para el método Debe elige un cliente.", 3500);
    if (metodo === "Efectivo" && (recibido === "" || Number(recibido) < total)) {
      return mostrarToast("El valor recibido no cubre el total corregido.", 3500);
    }

    const datos = {
      items: lineas.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad })),
      clienteId: el("corr-cliente").value || null,
      metodoPago: metodo,
      valorRecibido: metodo === "Efectivo" ? Number(recibido) : null
    };
    // Si se elige "Conservar", no se manda descuentoId y el backend deja el que tenía
    if (el("corr-descuento").value !== "__conservar") datos.descuentoId = el("corr-descuento").value || null;

    const boton = el("corr-guardar");
    boton.disabled = true;
    boton.textContent = "Guardando...";
    try {
      const corregida = await ejecutar(`/ventas/${venta.id}/corregir/`, datos);
      cargarHistorial();
      recargar("productos");
      mostrarFactura(corregida, { titulo: "Corrección guardada. Esta es la factura actualizada." });
      mostrarToast("Venta corregida ✓");
    } catch (e) {
      mostrarToast(e.message, 5000);
      boton.disabled = false;
      boton.textContent = "Guardar corrección";
    }
  });

  dibujar();
}

// ===================================================================
// REEMBOLSOS (parciales o totales)
// ===================================================================
export function abrirReembolso(venta) {
  const items = venta.items.map((i) => ({ ...i, disponible: i.cantidad - i.cantidadReembolsada }));
  if (!items.some((i) => i.disponible > 0)) return mostrarToast("Esta venta ya fue reembolsada por completo.");
  const quedaDinero = venta.total - venta.totalReembolsado;
  const factor = venta.subtotal ? venta.total / venta.subtotal : 0;   // descuento proporcional

  abrirModal(`
    <h3>Reembolsar venta #${numeroVenta(venta.id)}</h3>
    <p class="nota-rol">Elige cuántas unidades devolver de cada producto.
      ${venta.valorDescuento ? `La venta tuvo descuento (${escapeHTML(venta.descuentoNombre)}): el reembolso lo respeta de forma proporcional.` : ""}</p>

    <div class="editor-lineas" id="reem-lineas">
      ${items.map((i, idx) => `
        <div class="editor-linea reembolso-linea">
          <span>${escapeHTML(i.nombre)}
            <small>Vendidas ${i.cantidad}${i.cantidadReembolsada ? ` · ya reembolsadas ${i.cantidadReembolsada}` : ""} · ${formatearMoneda(i.precio)} c/u</small></span>
          <input type="number" min="0" max="${i.disponible}" step="1" value="0" data-idx="${idx}"
                 ${i.disponible === 0 ? "disabled" : ""} aria-label="Unidades a reembolsar de ${escapeHTML(i.nombre)}">
          <span class="num" data-valor="${idx}">${formatearMoneda(0)}</span>
          <label class="check-linea">
            <input type="checkbox" data-retorna="${idx}" ${i.productoId ? "checked" : "disabled"}>
            Retorna al inventario ${i.productoId ? "" : "(el producto ya no existe)"}
          </label>
        </div>`).join("")}
    </div>

    <div class="campo">
      <label for="reem-motivo">Motivo (opcional)</label>
      <input type="text" id="reem-motivo" maxlength="200" placeholder="Ej: producto defectuoso">
    </div>

    <div class="resumen-modal" id="reem-resumen"></div>

    <div class="modal-buttons">
      <button type="button" class="btn-modal-secundario" id="reem-todo">Reembolsar todo</button>
      <button type="button" class="btn-modal-secundario" data-cerrar-modal>Cancelar</button>
      <button type="button" class="btn-add" id="reem-guardar">Reembolsar</button>
    </div>`);

  const inputs = () => [...el("reem-lineas").querySelectorAll("input[data-idx]")];

  function calcular() {
    let total = 0;
    let todo = true;
    inputs().forEach((input) => {
      const idx = Number(input.dataset.idx);
      let n = parseInt(input.value, 10) || 0;
      n = Math.max(0, Math.min(n, items[idx].disponible));
      const valor = Math.round(items[idx].precio * n * factor);
      el("reem-lineas").querySelector(`[data-valor="${idx}"]`).textContent = formatearMoneda(valor);
      total += valor;
      if (n < items[idx].disponible) todo = false;
    });
    if (todo) total = quedaDinero;   // el último reembolso toma exactamente lo que falta
    el("reem-resumen").innerHTML = `
      <div class="row total"><span>A reembolsar${todo ? " (total)" : ""}</span><span>${formatearMoneda(total)}</span></div>
      <div class="row"><span>Pagado en la venta</span><span>${formatearMoneda(venta.total)}</span></div>
      ${venta.totalReembolsado ? `<div class="row"><span>Ya reembolsado</span><span>${formatearMoneda(venta.totalReembolsado)}</span></div>` : ""}`;
    return total;
  }

  el("reem-lineas").addEventListener("input", calcular);
  el("reem-todo").addEventListener("click", () => {
    inputs().forEach((input) => (input.value = items[Number(input.dataset.idx)].disponible));
    calcular();
  });

  el("reem-guardar").addEventListener("click", async () => {
    const lineas = inputs()
      .map((input) => ({ idx: Number(input.dataset.idx), cantidad: parseInt(input.value, 10) || 0 }))
      .filter((l) => l.cantidad > 0);
    if (!lineas.length) return mostrarToast("Indica al menos una unidad a reembolsar.");
    const invalida = lineas.find((l) => l.cantidad > items[l.idx].disponible);
    if (invalida) return mostrarToast(`De "${items[invalida.idx].nombre}" solo quedan ${items[invalida.idx].disponible} por reembolsar.`, 4000);

    const total = calcular();
    if (!(await confirmar({
      titulo: `¿Reembolsar ${formatearMoneda(total)}?`,
      texto: "Entrega este valor al cliente. El reembolso queda registrado con tu usuario y la fecha.",
      aceptar: `Reembolsar ${formatearMoneda(total)}`, cancelar: "Volver"
    }))) return;

    const boton = el("reem-guardar");
    boton.disabled = true;
    boton.textContent = "Procesando...";
    try {
      const r = await ejecutar(`/ventas/${venta.id}/reembolsos/`, {
        motivo: el("reem-motivo").value.trim(),
        items: lineas.map((l) => ({
          itemId: items[l.idx].id,
          cantidad: l.cantidad,
          retornaInventario: el("reem-lineas").querySelector(`[data-retorna="${l.idx}"]`).checked
        }))
      });
      cargarHistorial();
      recargar("productos");
      mostrarConfirmacionReembolso(r.reembolso, r.venta);
    } catch (e) {
      mostrarToast(e.message, 5000);
      boton.disabled = false;
      boton.textContent = "Reembolsar";
    }
  });

  calcular();
}

function mostrarConfirmacionReembolso(reembolso, venta) {
  abrirModal(`
    <h3>Reembolso registrado</h3>
    <div class="resumen-modal">
      <div class="row total"><span>Valor reembolsado</span><span>${formatearMoneda(reembolso.total)}</span></div>
      <div class="row"><span>Venta</span><span>#${numeroVenta(venta.id)} (${venta.estadoReembolso === "total" ? "reembolsada total" : "reembolso parcial"})</span></div>
      <div class="row"><span>Registrado por</span><span>${escapeHTML(reembolso.usuario)}</span></div>
    </div>
    <ul class="nota-rol">
      ${reembolso.items.map((i) => `<li>${i.cantidad} × ${escapeHTML(i.nombre)} — ${formatearMoneda(i.valor)} ${i.retornaInventario ? "· volvió al inventario" : "· no retorna"}</li>`).join("")}
    </ul>
    <div class="modal-buttons">
      <button type="button" class="btn-modal-secundario" id="reem-ver-factura">Ver factura</button>
      <button type="button" class="btn-add" data-cerrar-modal>Volver al historial</button>
    </div>`);
  el("reem-ver-factura").addEventListener("click", () => mostrarFactura(venta));
}

