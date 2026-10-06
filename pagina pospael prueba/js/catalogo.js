// js/catalogo.js
// Carga productos y categorías desde el servicio, los pinta y filtra con el buscador.
import { listar } from "./api.js";
import { estado } from "./state.js";
import { formatearMoneda, escapeHTML, mismoId } from "./utils.js";

const grid = document.getElementById("catalogo-grid");
const buscador = document.getElementById("buscador");
const contador = document.getElementById("contador-productos");

let alAgregar = () => {};   // lo define main.js

export async function cargarCatalogo() {
  grid.innerHTML = '<p class="estado-carga">Cargando productos...</p>';
  contador.textContent = "";
  try {
    // Las dos peticiones salen al mismo tiempo
    const [productos, categorias] = await Promise.all([
      listar("productos"),
      listar("categorias")
    ]);
    estado.productos = productos;
    estado.categorias = categorias;
    dibujar();
  } catch (e) {
    grid.innerHTML = `
      <div class="estado-error">
        <p>${escapeHTML(e.message)}</p>
        <button id="btn-reintentar" class="btn-add">Reintentar</button>
      </div>`;
    document.getElementById("btn-reintentar").onclick = cargarCatalogo;
  }
}

function nombreCategoria(id) {
  const c = estado.categorias.find((c) => mismoId(c.id, id));
  return c ? c.nombre : "Sin categoría";
}

function dibujar() {
  const termino = buscador.value.trim().toLowerCase();
  const lista = estado.productos.filter((p) =>
    String(p.nombre).toLowerCase().includes(termino)
  );

  if (lista.length === 0) {
    grid.innerHTML = `<div class="catalog-empty"><p>No encontramos productos que coincidan.</p></div>`;
    contador.textContent = "0 productos";
    return;
  }

  grid.innerHTML = lista.map((p) => {
    const controla = p.seguimientoInventario === true || p.seguimientoInventario === "true";
    const agotado = controla && Number(p.stock) <= 0;
    const stockTxt = !controla ? "" :
      `<p class="product-stock ${agotado ? "agotado" : ""}">${agotado ? "Agotado" : "Stock: " + Number(p.stock)}</p>`;

    return `
      <article class="product-card">
        <div class="product-left">
          <div class="product-photo"></div>
          <span class="product-category">${escapeHTML(nombreCategoria(p.categoriaId))}</span>
        </div>
        <div class="product-info">
          <h3 class="product-name">${escapeHTML(p.nombre)}</h3>
          ${stockTxt}
        </div>
        <div class="product-right">
          <p class="product-price">${formatearMoneda(p.precio)}</p>
          <div class="product-actions">
            <input type="number" class="qty-input" min="1" value="1"
                   aria-label="Cantidad de ${escapeHTML(p.nombre)}">
            <button class="btn-add" data-id="${escapeHTML(p.id)}">Agregar</button>
          </div>
        </div>
      </article>`;
  }).join("");

  contador.textContent = `${lista.length} producto${lista.length === 1 ? "" : "s"}`;
}

export function iniciarCatalogo(callbackAgregar) {
  alAgregar = callbackAgregar;
  buscador.addEventListener("input", dibujar);

  // Un solo listener para todos los botones "Agregar"
  grid.addEventListener("click", (evento) => {
    const boton = evento.target.closest(".btn-add[data-id]");
    if (!boton) return;
    const producto = estado.productos.find((p) => mismoId(p.id, boton.dataset.id));
    if (!producto) return;

    const input = boton.closest(".product-card").querySelector(".qty-input");
    let cantidad = parseInt(input.value, 10);
    if (isNaN(cantidad) || cantidad < 1) { cantidad = 1; input.value = 1; }

    alAgregar(producto, cantidad);
  });

  return cargarCatalogo();
}

// La usa venta.js después de cerrar una venta, para mostrar el stock nuevo
export function redibujarCatalogo() {
  dibujar();
}
