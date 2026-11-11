// js/venta.js
// Venta en curso: carrito, cliente, descuento, método de pago, ventas abiertas y cierre.
// El navegador solo manda { productoId, cantidad }: precios, descuento, totales y
// stock los calcula y valida el backend (dentro de una transacción).
import { listar, crear, reemplazar, eliminar } from "./api.js";
import { estado } from "./state.js";
import {
  formatearMoneda, escapeHTML, mismoId, mostrarToast, calcularDescuento, textoDescuento,
  opcionesSelect, numeroVenta, formatearFecha, ico
} from "./utils.js";
import { confirmar } from "./modal.js";
import { alCambiar, recargar } from "./datos.js";
import { abrirFormularioProducto } from "./productos.js";
import { mostrarFactura, cargarHistorial } from "./historial.js";

const METODOS_PAGO = ["Efectivo", "Nequi", "Debe"];

const el = (id) => document.getElementById(id);
let metodo = "Efectivo";
let guardando = false;
let ventaAbiertaIdActual = null; // si se retomó una venta abierta, su id

const subtotalVenta = () => estado.venta.reduce((acc, l) => acc + l.precio * l.cantidad, 0);
const descuentoElegido = () => estado.descuentos.find((d) => mismoId(d.id, el("descuento").value)) || null;

function totales() {
  const subtotal = subtotalVenta();
  const d = descuentoElegido();
  const descuento = d ? calcularDescuento(subtotal, d.tipo, d.valor) : 0;
  return { subtotal, descuento, total: subtotal - descuento, d };
}

// ---------- Carrito ----------
export function agregarAVenta(producto, cantidad) {
  const linea = estado.venta.find((l) => mismoId(l.productoId, producto.id));
  const nueva = (linea ? linea.cantidad : 0) + cantidad;
  if (producto.seguimientoInventario && nueva > Number(producto.stock)) {
    mostrarToast(`Solo hay ${producto.stock} de "${producto.nombre}" en inventario.`, 3500);
  }
  if (linea) {
    linea.cantidad = nueva;
  } else {
    estado.venta.push({ productoId: producto.id, nombre: producto.nombre, precio: Number(producto.precio), cantidad });
  }
  dibujarVenta();
}

// Edición en caliente: tras editar un producto, la venta en curso toma nombre y precio nuevos
export function actualizarLineasProducto() {
  estado.venta.forEach((l) => {
    const p = estado.productos.find((x) => mismoId(x.id, l.productoId));
    if (p) {
      l.nombre = p.nombre;
      l.precio = Number(p.precio);
    }
  });
  dibujarVenta();
}

function dibujarVenta() {
  const lista = el("factura-lista");
  const hayItems = estado.venta.length > 0;
  lista.classList.toggle("oculto", !hayItems);
  el("factura-vacia").classList.toggle("oculto", hayItems);

  lista.innerHTML = estado.venta.map((l) => {
    const id = escapeHTML(l.productoId);
    return `
      <div class="factura-linea">
        <span class="factura-linea-nombre">${escapeHTML(l.nombre)}</span>
        <div class="factura-linea-cantidad">
          <button data-accion="restar" data-id="${id}" aria-label="Restar">-</button>
          <span>${l.cantidad}</span>
          <button data-accion="sumar" data-id="${id}" aria-label="Sumar">+</button>
        </div>
        <span class="factura-linea-subtotal">${formatearMoneda(l.precio * l.cantidad)}</span>
        <button class="btn-eliminar" data-accion="editar" data-id="${id}" aria-label="Editar ${escapeHTML(l.nombre)}">${ico("editar")}</button>
        <button class="btn-eliminar" data-accion="eliminar" data-id="${id}" aria-label="Quitar ${escapeHTML(l.nombre)}">${ico("eliminar")}</button>
      </div>`;
  }).join("");

  const { subtotal, descuento, total, d } = totales();
  el("factura-subtotal").textContent = formatearMoneda(subtotal);
  el("fila-descuento").classList.toggle("oculto", !d);
  el("factura-descuento-nombre").textContent = d ? `Descuento (${textoDescuento(d)})` : "Descuento";
  el("factura-descuento").textContent = "-" + formatearMoneda(descuento);
  el("factura-total").textContent = formatearMoneda(total);

  // Un descuento de valor fijo mayor al subtotal dejaría el total negativo: se avisa
  if (d && d.tipo === "valor" && Number(d.valor) > subtotal && subtotal > 0) {
    el("factura-descuento").textContent = "No aplica";
  }

  const esEfectivo = metodo === "Efectivo";
  el("campo-recibido").classList.toggle("oculto", !esEfectivo);
  el("fila-cambio").classList.toggle("oculto", !esEfectivo);
  const recibido = Number(el("recibido").value) || 0;
  el("factura-cambio").textContent = formatearMoneda(Math.max(0, recibido - total));

  const unidades = estado.venta.reduce((a, l) => a + l.cantidad, 0);
  el("ir-venta-items").textContent = unidades ? `Ver venta · ${unidades} producto${unidades === 1 ? "" : "s"}` : "Venta vacía";
  el("ir-venta-total").textContent = formatearMoneda(total);

  el("titulo-venta").textContent = ventaAbiertaIdActual
    ? `Venta guardada #${numeroVenta(ventaAbiertaIdActual)}` : "Venta actual";
  pintarBotonCobrar();
}

// El botón principal dice cuánto se va a cobrar: "Cobrar $13.320"
function pintarBotonCobrar() {
  const boton = el("btn-cerrar");
  if (guardando) return;
  const { total } = totales();
  boton.innerHTML = estado.venta.length
    ? `Cobrar ${formatearMoneda(total)} <kbd aria-hidden="true">Ctrl ↵</kbd>`
    : "Cobrar";
}

// Atajo Ctrl+Enter (main.js)
export function cobrarConTeclado() {
  cerrarVenta();
}

function dibujarMetodos() {
  el("metodos-pago").innerHTML = METODOS_PAGO.map((m) =>
    `<button type="button" class="btn-payment ${m === metodo ? "selected" : ""}" data-metodo="${m}" aria-pressed="${m === metodo}">${m}</button>`
  ).join("");
}

function llenarClientes() {
  el("cliente").innerHTML = opcionesSelect(estado.clientes, { vacio: "Sin cliente", elegido: el("cliente").value });
}

function llenarDescuentos() {
  el("descuento").innerHTML = opcionesSelect(estado.descuentos, {
    vacio: "Sin descuento", elegido: el("descuento").value,
    texto: (d) => `${d.nombre} (${textoDescuento(d)})`
  });
  dibujarVenta();
}

function limpiarVenta() {
  estado.venta = [];
  ventaAbiertaIdActual = null;
  metodo = "Efectivo";
  el("recibido").value = "";
  el("cliente").value = "";
  el("descuento").value = "";
  dibujarMetodos();
  dibujarVenta();
}

function datosVenta(estadoVenta) {
  return {
    estado: estadoVenta,
    items: estado.venta.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad })),
    clienteId: el("cliente").value || null,
    descuentoId: el("descuento").value || null,
    metodoPago: metodo,
    valorRecibido: metodo === "Efectivo" && el("recibido").value !== "" ? Number(el("recibido").value) : null
  };
}

// Guarda (crea o actualiza) en el backend. Con PUT si ya era una venta abierta.
function enviarVenta(estadoVenta) {
  const datos = datosVenta(estadoVenta);
  return ventaAbiertaIdActual
    ? reemplazar("ventas", ventaAbiertaIdActual, datos)
    : crear("ventas", datos);
}

// ---------- Ventas abiertas ----------
export async function cargarVentasAbiertas() {
  const lista = el("historial-lista");
  try {
    const abiertas = await listar("ventas", { estado: "abierta" });
    if (abiertas.length === 0) {
      lista.innerHTML = '<p class="historial-vacio">No hay ventas guardadas.</p>';
      return;
    }
    lista.innerHTML = abiertas.map((v) => `
      <div class="factura-card">
        <div>
          <h3>${formatearMoneda(v.total)}</h3>
          <p>#${numeroVenta(v.id)} · ${formatearFecha(v.fecha)} · ${escapeHTML(v.clienteNombre || "Sin cliente")}</p>
        </div>
        <div class="registro-acciones">
          <button class="btn-recuperar" data-retomar="${escapeHTML(v.id)}">Retomar</button>
          <button class="btn-eliminar" data-descartar="${escapeHTML(v.id)}" aria-label="Descartar venta guardada">${ico("eliminar")}</button>
        </div>
      </div>`).join("");
    lista._ventas = abiertas;
  } catch (e) {
    lista.innerHTML = `<p class="historial-vacio">Error al cargar ventas abiertas: ${escapeHTML(e.message)}</p>`;
  }
}

async function guardarVentaAbierta() {
  if (guardando) return;
  if (estado.venta.length === 0) return mostrarToast("Agrega al menos un producto.");
  const boton = el("btn-guardar-abierta");
  guardando = true;
  boton.disabled = true;
  try {
    const v = await enviarVenta("abierta");
    limpiarVenta();
    cargarVentasAbiertas();
    mostrarToast(`Venta #${numeroVenta(v.id)} guardada para después ✓`);
  } catch (e) {
    mostrarToast("Error al guardar: " + e.message, 4000);
  } finally {
    guardando = false;
    boton.disabled = false;
  }
}

async function retomarVentaAbierta(id) {
  const venta = (el("historial-lista")._ventas || []).find((v) => mismoId(v.id, id));
  if (!venta) return mostrarToast("No se encontró la venta abierta.");
  if (estado.venta.length && !(await confirmar({
    titulo: "¿Reemplazar la venta actual?",
    texto: `Los productos que tienes ahora se quitan y se carga la venta guardada #${numeroVenta(venta.id)}.`,
    aceptar: "Cargar venta guardada", cancelar: "Seguir con la actual"
  }))) return;

  ventaAbiertaIdActual = venta.id;
  metodo = venta.metodoPago || "Efectivo";
  el("cliente").value = venta.clienteId || "";
  el("descuento").value = venta.descuentoId || "";
  el("recibido").value = venta.valorRecibido ?? "";
  // Las líneas toman el precio actual del producto (al cerrar, el backend usa ese precio)
  estado.venta = venta.items.filter((i) => i.productoId).map((i) => {
    const p = estado.productos.find((x) => mismoId(x.id, i.productoId));
    return { productoId: i.productoId, nombre: p ? p.nombre : i.nombre, precio: p ? Number(p.precio) : i.precio, cantidad: i.cantidad };
  });
  dibujarMetodos();
  dibujarVenta();
  mostrarToast(`Venta #${numeroVenta(venta.id)} retomada ✓`);
}

async function descartarVentaAbierta(id) {
  if (!(await confirmar({
    titulo: `¿Descartar la venta #${numeroVenta(id)}?`,
    texto: "Se borra la venta guardada y sus productos. No se puede deshacer.",
    aceptar: "Descartar venta", cancelar: "Conservar", peligro: true
  }))) return;
  try {
    await eliminar("ventas", id);
    if (mismoId(id, ventaAbiertaIdActual)) limpiarVenta();
    cargarVentasAbiertas();
    mostrarToast("Venta guardada descartada ✓");
  } catch (e) {
    mostrarToast("Error al descartar: " + e.message, 4000);
  }
}

// ---------- Cierre de la venta ----------
async function cerrarVenta() {
  if (guardando) return;
  const { total } = totales();
  const recibido = Number(el("recibido").value) || 0;

  // Validaciones rápidas en el navegador (el backend las repite: es la fuente de verdad)
  if (estado.venta.length === 0) return mostrarToast("Agrega al menos un producto.");
  if (metodo === "Debe" && !el("cliente").value) return mostrarToast("Para el método Debe debes elegir un cliente.", 3500);
  if (metodo === "Efectivo" && recibido < total) return mostrarToast("El valor recibido no cubre el total.", 3500);

  const boton = el("btn-cerrar");
  guardando = true;
  boton.disabled = true;
  boton.textContent = "Cobrando...";

  try {
    const venta = await enviarVenta("cerrada");
    limpiarVenta();
    cargarVentasAbiertas();
    cargarHistorial();
    recargar("productos");             // el stock cambió
    mostrarFactura(venta, { recienCerrada: true });
    mostrarToast("Venta cobrada ✓");
  } catch (e) {
    mostrarToast(e.message, 5000);
    recargar("productos").catch(() => {});
  } finally {
    guardando = false;
    boton.disabled = false;
    pintarBotonCobrar();
  }
}

// ---------- Arranque ----------
export function iniciarVenta() {
  dibujarMetodos();
  dibujarVenta();
  alCambiar("clientes", llenarClientes);
  alCambiar("descuentos", llenarDescuentos);
  alCambiar("productos", actualizarLineasProducto);

  el("factura-lista").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-accion]");
    if (!b) return;
    if (b.dataset.accion === "editar") return abrirFormularioProducto(b.dataset.id, { rapido: true });
    const i = estado.venta.findIndex((l) => mismoId(l.productoId, b.dataset.id));
    if (i === -1) return;
    const linea = estado.venta[i];
    if (b.dataset.accion === "sumar") linea.cantidad++;
    else if (b.dataset.accion === "restar") linea.cantidad--;
    else linea.cantidad = 0;
    if (linea.cantidad <= 0) estado.venta.splice(i, 1);
    dibujarVenta();
  });

  el("metodos-pago").addEventListener("click", (e) => {
    const b = e.target.closest(".btn-payment");
    if (!b) return;
    metodo = b.dataset.metodo;
    dibujarMetodos();
    dibujarVenta();
  });

  el("recibido").addEventListener("input", dibujarVenta);
  el("btn-ir-venta").addEventListener("click", () =>
    document.querySelector(".invoice-panel").scrollIntoView({ behavior: "smooth" }));
  el("descuento").addEventListener("change", dibujarVenta);
  el("btn-cerrar").addEventListener("click", cerrarVenta);
  el("btn-guardar-abierta").addEventListener("click", guardarVentaAbierta);

  el("btn-vaciar").addEventListener("click", async () => {
    if (estado.venta.length && await confirmar({
      titulo: "¿Vaciar la venta actual?", texto: "Se quitan todos los productos, el cliente y el descuento.",
      aceptar: "Vaciar venta", cancelar: "Conservar", peligro: true
    })) limpiarVenta();
  });

  el("historial-lista").addEventListener("click", (e) => {
    const retomar = e.target.closest("[data-retomar]");
    const descartar = e.target.closest("[data-descartar]");
    if (retomar) retomarVentaAbierta(retomar.dataset.retomar);
    if (descartar) descartarVentaAbierta(descartar.dataset.descartar);
  });

  cargarVentasAbiertas();
}

// "Nueva venta" desde la confirmación de pago o desde una corrección
export function nuevaVenta() {
  limpiarVenta();
}
