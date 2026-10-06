// js/venta.js
// Carrito, método de pago, cliente, ventas abiertas y cierre de venta.
import { listar, crear, actualizar, nuevoId } from "./api.js";
import { estado } from "./state.js";
import { formatearMoneda, escapeHTML, mismoId, mostrarToast } from "./utils.js";
import { redibujarCatalogo } from "./catalogo.js";

// Constantes permitidas por el enunciado
const METODOS_PAGO = ["Efectivo", "Nequi", "Debe"];

const el = (id) => document.getElementById(id);
let metodo = "Efectivo";
let guardando = false;
let ventaAbiertaIdActual = null; // Si se retoma una venta abierta, guarda su id aquí

const controlaStock = (p) => p.seguimientoInventario === true || p.seguimientoInventario === "true";
const totalVenta = () => estado.venta.reduce((acc, l) => acc + l.precio * l.cantidad, 0);

// ---------- Carrito ----------
export function agregarAVenta(producto, cantidad) {
  const linea = estado.venta.find((l) => mismoId(l.productoId, producto.id));
  if (linea) {
    linea.cantidad += cantidad;
  } else {
    estado.venta.push({
      productoId: producto.id,
      nombre: producto.nombre,
      precio: Number(producto.precio),
      costo: Number(producto.costo),
      cantidad
    });
  }
  dibujarVenta();
}

function dibujarVenta() {
  const lista = el("factura-lista");
  const vacia = el("factura-vacia");
  const hayItems = estado.venta.length > 0;

  lista.classList.toggle("oculto", !hayItems);
  vacia.classList.toggle("oculto", hayItems);

  lista.innerHTML = estado.venta.map((l) => {
    const id = escapeHTML(l.productoId);
    return `
      <div class="factura-linea">
        <span class="factura-linea-nombre">${escapeHTML(l.nombre)}</span>
        <div class="factura-linea-cantidad">
          <button data-accion="restar" data-id="${id}">-</button>
          <span>${l.cantidad}</span>
          <button data-accion="sumar" data-id="${id}">+</button>
        </div>
        <span class="factura-linea-subtotal">${formatearMoneda(l.precio * l.cantidad)}</span>
        <button class="btn-eliminar" data-accion="eliminar" data-id="${id}">🗑️</button>
      </div>`;
  }).join("");

  const total = totalVenta();
  el("factura-subtotal").textContent = formatearMoneda(total);
  el("factura-total").textContent = formatearMoneda(total);

  // Valor recibido y cambio: solo aplican en efectivo
  const esEfectivo = metodo === "Efectivo";
  el("campo-recibido").classList.toggle("oculto", !esEfectivo);
  el("fila-cambio").classList.toggle("oculto", !esEfectivo);
  const recibido = Number(el("recibido").value) || 0;
  el("factura-cambio").textContent = formatearMoneda(Math.max(0, recibido - total));
}

function dibujarMetodos() {
  el("metodos-pago").innerHTML = METODOS_PAGO.map((m) =>
    `<button type="button" class="btn-payment ${m === metodo ? "selected" : ""}" data-metodo="${m}">${m}</button>`
  ).join("");
}

function llenarClientes() {
  const actual = el("cliente").value;
  el("cliente").innerHTML = '<option value="">Sin cliente</option>' +
    estado.clientes.map((c) => `<option value="${escapeHTML(c.id)}">${escapeHTML(c.nombre)}</option>`).join("");
  el("cliente").value = actual;
}

function limpiarVenta() {
  estado.venta = [];
  ventaAbiertaIdActual = null;
  el("recibido").value = "";
  el("cliente").value = "";
  dibujarVenta();
}

// ---------- Ventas Abiertas ----------
async function cargarVentasAbiertas() {
  const lista = el("historial-lista");
  try {
    const todasVentas = await listar("ventas");
    const abiertas = todasVentas.filter((v) => v.estado === "abierta");

    if (abiertas.length === 0) {
      lista.innerHTML = '<p class="historial-vacio">No hay ventas abiertas.</p>';
      return;
    }

    lista.innerHTML = abiertas.map((v) => {
      const fechaTxt = new Date(v.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `
        <div class="factura-card">
          <div>
            <h3>${formatearMoneda(v.total)}</h3>
            <p>${fechaTxt} · ${v.metodoPago || "Efectivo"}</p>
          </div>
          <button class="btn-recuperar" data-id="${escapeHTML(v.id)}">Retomar</button>
        </div>`;
    }).join("");
  } catch (e) {
    lista.innerHTML = `<p class="historial-vacio">Error al cargar ventas abiertas.</p>`;
  }
}

async function guardarVentaAbierta() {
  if (guardando) return;
  if (estado.venta.length === 0) return mostrarToast("Agrega al menos un producto.");

  const total = totalVenta();
  const clienteId = el("cliente").value;
  const boton = el("btn-guardar-abierta");

  guardando = true;
  boton.disabled = true;

  try {
    const ahora = new Date().toISOString();
    const datosVenta = {
      fecha: ahora,
      estado: "abierta",
      clienteId,
      metodoPago: metodo,
      subtotal: total,
      total,
      itemsJson: estado.venta,
      actualizadoEn: ahora
    };

    if (ventaAbiertaIdActual) {
      // Si ya existía como abierta, se actualiza
      await actualizar("ventas", { id: ventaAbiertaIdActual, ...datosVenta });
    } else {
      // Si es nueva venta abierta, se crea
      await crear("ventas", { id: nuevoId(), ...datosVenta });
    }

    limpiarVenta();
    cargarVentasAbiertas();
    mostrarToast("Venta guardada como abierta ✓");
  } catch (e) {
    mostrarToast("Error al guardar: " + e.message, 4000);
  } finally {
    guardando = false;
    boton.disabled = false;
  }
}

async function retomarVentaAbierta(id) {
  try {
    const todasVentas = await listar("ventas");
    const venta = todasVentas.find((v) => mismoId(v.id, id));
    if (!venta) return mostrarToast("No se encontró la venta abierta.");

    ventaAbiertaIdActual = venta.id;
    metodo = venta.metodoPago || "Efectivo";
    el("cliente").value = venta.clienteId || "";

    // Parsear ítems si vienen como JSON string
    estado.venta = typeof venta.itemsJson === "string" ? JSON.parse(venta.itemsJson) : (venta.itemsJson || []);

    dibujarMetodos();
    dibujarVenta();
    mostrarToast("Venta retomada ✓");
  } catch (e) {
    mostrarToast("Error al retomar venta: " + e.message, 4000);
  }
}

// ---------- Cierre de la venta ----------
async function cerrarVenta() {
  if (guardando) return;

  const total = totalVenta();
  const clienteId = el("cliente").value;
  const recibido = Number(el("recibido").value) || 0;

  if (estado.venta.length === 0) return mostrarToast("Agrega al menos un producto.");
  if (metodo === "Debe" && !clienteId) return mostrarToast("Para el método Debe debes elegir un cliente.", 3500);
  if (metodo === "Efectivo" && recibido < total) return mostrarToast("El valor recibido no cubre el total.", 3500);

  const boton = el("btn-cerrar");
  guardando = true;
  boton.disabled = true;
  boton.textContent = "Guardando...";

  try {
    // 1. Verificar stock actual en Google Sheets
    estado.productos = await listar("productos");
    for (const l of estado.venta) {
      const p = estado.productos.find((p) => mismoId(p.id, l.productoId));
      if (!p) throw new Error(`El producto "${l.nombre}" ya no existe.`);
      if (controlaStock(p) && Number(p.stock) < l.cantidad) {
        throw new Error(`Stock insuficiente de "${l.nombre}": hay ${Number(p.stock)} y pides ${l.cantidad}.`);
      }
    }

    // 2. Registrar o actualizar venta a estado "cerrada"
    const ahora = new Date().toISOString();
    const datosVenta = {
      fecha: ahora,
      estado: "cerrada",
      clienteId,
      metodoPago: metodo,
      subtotal: total,
      total,
      valorRecibido: metodo === "Efectivo" ? recibido : "",
      cambio: metodo === "Efectivo" ? recibido - total : "",
      itemsJson: estado.venta,
      actualizadoEn: ahora
    };

    if (ventaAbiertaIdActual) {
      await actualizar("ventas", { id: ventaAbiertaIdActual, ...datosVenta });
    } else {
      await crear("ventas", { id: nuevoId(), ...datosVenta });
    }

    // 3. Descontar el stock de los productos vendidos
    const fallos = [];
    for (const l of estado.venta) {
      const p = estado.productos.find((p) => mismoId(p.id, l.productoId));
      if (!controlaStock(p)) continue;
      try {
        const act = await actualizar("productos", { id: p.id, stock: Number(p.stock) - l.cantidad });
        p.stock = act.stock;
      } catch (e) {
        fallos.push(l.nombre);
      }
    }

    limpiarVenta();
    cargarVentasAbiertas();
    redibujarCatalogo();
    mostrarToast(fallos.length
      ? `Venta guardada, pero no se pudo descontar el stock de: ${fallos.join(", ")}`
      : "Venta cerrada ✓", fallos.length ? 5000 : 2500);
  } catch (e) {
    mostrarToast(e.message, 4500);
  } finally {
    guardando = false;
    boton.disabled = false;
    boton.textContent = "Cerrar venta";
  }
}

// ---------- Arranque ----------
export async function iniciarVenta() {
  dibujarMetodos();
  dibujarVenta();

  el("factura-lista").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-accion]");
    if (!b) return;
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
  el("btn-cerrar").addEventListener("click", cerrarVenta);
  
  const btnGuardarAbierta = el("btn-guardar-abierta");
  if (btnGuardarAbierta) btnGuardarAbierta.addEventListener("click", guardarVentaAbierta);

  el("btn-vaciar").addEventListener("click", () => {
    if (estado.venta.length && confirm("¿Vaciar la venta actual?")) limpiarVenta();
  });

  // Event listener para retomar ventas abiertas de la lista
  el("historial-lista").addEventListener("click", (e) => {
    const b = e.target.closest(".btn-recuperar");
    if (!b) return;
    retomarVentaAbierta(b.dataset.id);
  });

  try {
    estado.clientes = await listar("clientes");
    llenarClientes();
    cargarVentasAbiertas();
  } catch (e) {
    mostrarToast("No se pudieron cargar datos: " + e.message, 4000);
  }
  
}