// js/catalogo.js
// Pinta el catálogo de productos de la venta y lo filtra con el buscador.
// Enter en el buscador agrega el producto si la búsqueda deja uno solo.
import { estado } from "./state.js";
import { formatearMoneda, escapeHTML, mismoId, ico, iniciales, tonoCategoria, normalizar } from "./utils.js";
import { alCambiar } from "./datos.js";
import { abrirFormularioFaltante } from "./faltantes.js";

const grid = document.getElementById("catalogo-grid");
const buscador = document.getElementById("buscador");
const contador = document.getElementById("contador-productos");

const POCO_STOCK = 5;   // desde aquí la ficha avisa "quedan pocas"
let alAgregar = () => {};   // lo define main.js
let cargado = false;

const controlaStock = (p) => p.seguimientoInventario === true;

export function mostrarErrorCatalogo(mensaje, reintentar) {
  grid.innerHTML = `
    <div class="estado-error">
      <p>${escapeHTML(mensaje)}</p>
      <button id="btn-reintentar" class="btn-add" type="button">${ico("recargar")}Reintentar</button>
    </div>`;
  document.getElementById("btn-reintentar").onclick = reintentar;
}

function filtrados() {
  const termino = normalizar(buscador.value);
  return estado.productos.filter((p) =>
    normalizar(p.nombre).includes(termino) || normalizar(p.codigo).includes(termino));
}

function textoStock(p) {
  if (!controlaStock(p)) return "";
  const n = Number(p.stock);
  if (n <= 0) return '<p class="product-stock agotado">Agotado</p>';
  if (n <= POCO_STOCK) return `<p class="product-stock poco">Quedan ${n}</p>`;
  return `<p class="product-stock">${n} en stock</p>`;
}

function dibujar() {
  if (!cargado) return;
  const termino = buscador.value.trim();
  const lista = filtrados();

  if (lista.length === 0) {
    // RF-150: si el cliente pide algo que no existe, se anota como faltante desde aquí
    grid.innerHTML = `
      <div class="catalog-empty">
        <p>${termino ? `No hay productos que coincidan con "${escapeHTML(termino)}".` : "Todavía no hay productos en el catálogo."}</p>
        ${termino ? `<p>Si un cliente lo pidió, anótalo para la próxima compra.</p>
        <button type="button" class="btn-add" id="btn-faltante-busqueda">${ico("nota")}Anotar como faltante</button>` : ""}
      </div>`;
    contador.textContent = "Sin resultados";
    const b = document.getElementById("btn-faltante-busqueda");
    if (b) b.onclick = () => abrirFormularioFaltante({ tipo: "inexistente", descripcion: termino });
    return;
  }

  grid.innerHTML = lista.map((p) => {
    const agotado = controlaStock(p) && Number(p.stock) <= 0;
    const id = escapeHTML(p.id);
    const accion = agotado
      ? `<button type="button" class="btn-vaciar btn-faltante" data-id="${id}">${ico("nota")}Anotar faltante</button>`
      : `<label class="solo-lector" for="cant-${id}">Cantidad de ${escapeHTML(p.nombre)}</label>
         <input type="number" class="qty-input" id="cant-${id}" min="1" value="1" inputmode="numeric">
         <button type="button" class="btn-add" data-id="${id}" aria-label="Agregar ${escapeHTML(p.nombre)}">${ico("mas")}Agregar</button>`;

    return `
      <article class="product-card ${agotado ? "sin-stock" : ""}">
        <div class="product-left">
          <div class="product-photo" style="--tono: var(--tono-${tonoCategoria(p.categoriaNombre)})" aria-hidden="true">${escapeHTML(iniciales(p.nombre))}</div>
          <div class="product-info">
            <h3 class="product-name">${escapeHTML(p.nombre)}</h3>
            <span class="product-category">${escapeHTML(p.categoriaNombre || "Sin categoría")}</span>
          </div>
        </div>
        <div>
          <p class="product-price">${formatearMoneda(p.precio)}</p>
          ${textoStock(p)}
        </div>
        <div class="product-actions">${accion}</div>
      </article>`;
  }).join("");

  contador.textContent = `${lista.length} producto${lista.length === 1 ? "" : "s"}`;
}

function esqueleto() {
  grid.innerHTML = Array.from({ length: 8 }, () => '<div class="esqueleto" aria-hidden="true"></div>').join("");
  contador.textContent = "Cargando productos…";
}

export function iniciarCatalogo(callbackAgregar) {
  alAgregar = callbackAgregar;
  esqueleto();
  buscador.addEventListener("input", dibujar);
  alCambiar(["productos"], () => { cargado = true; dibujar(); });

  // Enter: si la búsqueda deja un solo producto con stock, se agrega directo
  buscador.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const lista = filtrados().filter((p) => !(controlaStock(p) && Number(p.stock) <= 0));
    if (lista.length === 1) {
      alAgregar(lista[0], 1);
      buscador.select();
    }
  });

  // Un solo listener para todos los botones de las tarjetas
  grid.addEventListener("click", (evento) => {
    const faltante = evento.target.closest(".btn-faltante");
    if (faltante) return abrirFormularioFaltante({ tipo: "agotado", productoId: faltante.dataset.id });

    const boton = evento.target.closest(".btn-add[data-id]");
    if (!boton) return;
    const producto = estado.productos.find((p) => mismoId(p.id, boton.dataset.id));
    if (!producto) return;

    const input = boton.closest(".product-card").querySelector(".qty-input");
    let cantidad = parseInt(input.value, 10);
    if (isNaN(cantidad) || cantidad < 1) cantidad = 1;
    input.value = 1;

    alAgregar(producto, cantidad);
  });
}

export function redibujarCatalogo() {
  dibujar();
}
