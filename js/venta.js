// js/venta.js
// Carrito, método de pago, cliente y cierre de la venta (con descuento de stock).
import { listar, crear, actualizar, nuevoId } from "./api.js";
import { estado } from "./state.js";
import { formatearMoneda, escapeHTML, mismoId, mostrarToast } from "./utils.js";
import { redibujarCatalogo } from "./catalogo.js";
import { abrirEditorProducto } from "./productos.js";

// Constantes permitidas por el enunciado
const METODOS_PAGO = ["Efectivo", "Nequi", "Debe"];

const el = (id) => document.getElementById(id);
let metodo = "Efectivo";
let guardando = false;

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
        <button class="btn-eliminar" data-accion="editar" data-id="${id}" title="Editar producto">✏️</button>
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
  el("recibido").value = "";
  el("cliente").value = "";
  dibujarVenta();
}

// ---------- Cierre de la venta ----------
async function cerrarVenta() {
  if (guardando) return;                       // evita envíos duplicados

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
    // 1. Stock actualizado desde el servicio (otro equipo/caja pudo venderlo)
    estado.productos = await listar("productos");
    for (const l of estado.venta) {
      const p = estado.productos.find((p) => mismoId(p.id, l.productoId));
      if (!p) throw new Error(`El producto "${l.nombre}" ya no existe.`);
      if (controlaStock(p) && Number(p.stock) < l.cantidad) {
        throw new Error(`Stock insuficiente de "${l.nombre}": hay ${Number(p.stock)} y pides ${l.cantidad}.`);
      }
    }

    // 2. Registrar la venta
    const ahora = new Date().toISOString();
    await crear("ventas", {
      id: nuevoId(),
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
    });

    // 3. Solo si la venta se guardó, descontar el stock
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

// Después de editar un producto, la línea de la venta abierta toma los datos nuevos.
// (Las ventas ya cerradas no cambian: guardan su propia copia en itemsJson.)
function sincronizarLineas(p) {
  estado.venta.forEach((l) => {
    if (mismoId(l.productoId, p.id)) {
      l.nombre = p.nombre;
      l.precio = Number(p.precio);
      l.costo = Number(p.costo);
    }
  });
  dibujarVenta();
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
    if (b.dataset.accion === "editar") {
      const p = estado.productos.find((p) => mismoId(p.id, linea.productoId));
      if (!p) return mostrarToast("El producto ya no existe.");
      abrirEditorProducto(p, { soloBasico: true, alGuardar: sincronizarLineas });
      return;
    }
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
  el("btn-vaciar").addEventListener("click", () => {
    if (estado.venta.length && confirm("¿Vaciar la venta actual?")) limpiarVenta();
  });

  try {
    estado.clientes = await listar("clientes");
    llenarClientes();
  } catch (e) {
    mostrarToast("No se pudieron cargar los clientes: " + e.message, 4000);
  }
}
