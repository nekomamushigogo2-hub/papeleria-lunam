// js/compras.js
import { listar, crear, actualizar, nuevoId } from "./api.js";
import { estado } from "./state.js";
import { formatearMoneda, escapeHTML, mismoId, mostrarToast } from "./utils.js";
import { redibujarCatalogo } from "./catalogo.js";

const el = (id) => document.getElementById(id);

let itemsCompra = [];
let guardandoCompra = false;

function calcularTotalCompra() {
  return itemsCompra.reduce((acc, it) => acc + (it.costo * it.cantidad), 0);
}

function dibujarItemsCompra() {
  const contenedor = el("compra-items-lista");
  if (itemsCompra.length === 0) {
    contenedor.innerHTML = '<p style="color: var(--color-ink-soft); font-size: 0.85rem;">No has agregado productos a la compra.</p>';
    el("compra-total-txt").textContent = "$0";
    return;
  }

  contenedor.innerHTML = itemsCompra.map((it, idx) => `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; border-bottom: 1px solid var(--color-line); font-size: 0.85rem;">
      <span><strong>${escapeHTML(it.nombre)}</strong> (${it.cantidad} u. × ${formatearMoneda(it.costo)})</span>
      <div>
        <span style="font-weight: 600; margin-right: 12px;">${formatearMoneda(it.costo * it.cantidad)}</span>
        <button type="button" data-idx="${idx}" class="btn-eliminar-item-compra" style="background:none; border:none; cursor:pointer;">🗑️</button>
      </div>
    </div>
  `).join("");

  el("compra-total-txt").textContent = formatearMoneda(calcularTotalCompra());
}

async function cargarSelectores() {
  try {
    const [proveedores, productos] = await Promise.all([
      listar("proveedores"),
      listar("productos")
    ]);
    
    estado.productos = productos;

    el("compra-proveedor").innerHTML = '<option value="">Selecciona proveedor...</option>' +
      proveedores.map(p => `<option value="${escapeHTML(p.id)}">${escapeHTML(p.nombre)}</option>`).join("");

    el("compra-producto").innerHTML = '<option value="">Selecciona producto...</option>' +
      productos.map(p => `<option value="${escapeHTML(p.id)}">${escapeHTML(p.nombre)}</option>`).join("");
  } catch (e) {
    mostrarToast("Error al cargar datos para compras: " + e.message, 4000);
  }
}

function agregarItemCompra() {
  const prodId = el("compra-producto").value;
  const cantidad = Number(el("compra-cantidad").value) || 0;
  const costo = Number(el("compra-costo").value) || 0;

  if (!prodId) return mostrarToast("Selecciona un producto.");
  if (cantidad <= 0) return mostrarToast("Ingresa una cantidad válida.");

  const prod = estado.productos.find(p => mismoId(p.id, prodId));
  if (!prod) return mostrarToast("Producto no encontrado.");

  itemsCompra.push({
    productoId: prod.id,
    nombre: prod.nombre,
    cantidad,
    costo: costo || Number(prod.costo) || 0
  });

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
  btn.textContent = "Guardando compra...";

  try {
    const total = calcularTotalCompra();
    const ahora = new Date().toISOString();

    // 1. Guardar registro en la pestaña 'compras'
    await crear("compras", {
      id: nuevoId(),
      fecha: ahora,
      proveedorId,
      total,
      itemsJson: itemsCompra
    });

    // 2. Aumentar stock y actualizar costo en la pestaña 'productos'
    for (const item of itemsCompra) {
      const prod = estado.productos.find(p => mismoId(p.id, item.productoId));
      if (prod) {
        const nuevoStock = Number(prod.stock || 0) + item.cantidad;
        await actualizar("productos", {
          id: prod.id,
          stock: nuevoStock,
          costo: item.costo
        });
        prod.stock = nuevoStock;
        prod.costo = item.costo;
      }
    }

    itemsCompra = [];
    dibujarItemsCompra();
    redibujarCatalogo();
    mostrarToast("¡Compra registrada y stock actualizado! ✓");
  } catch (e) {
    mostrarToast("Error al registrar la compra: " + e.message, 4500);
  } finally {
    guardandoCompra = false;
    btn.disabled = false;
    btn.textContent = "💾 Registrar Compra";
  }
}

export function iniciarCompras() {
  cargarSelectores();
  dibujarItemsCompra();

  el("btn-agregar-item-compra").addEventListener("click", agregarItemCompra);
  el("btn-guardar-compra").addEventListener("click", guardarCompra);

  el("compra-items-lista").addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-eliminar-item-compra");
    if (!btn) return;
    const idx = Number(btn.dataset.idx);
    itemsCompra.splice(idx, 1);
    dibujarItemsCompra();
  });

  // Al cambiar de producto, sugerir su costo actual
  el("compra-producto").addEventListener("change", (e) => {
    const prod = estado.productos.find(p => mismoId(p.id, e.target.value));
    if (prod && prod.costo) {
      el("compra-costo").value = prod.costo;
    }
  });
}