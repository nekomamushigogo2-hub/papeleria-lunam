// js/main.js
// Punto de entrada: arranca los módulos y maneja la navegación entre vistas.
import { iniciarCatalogo } from "./catalogo.js";
import { iniciarVenta, agregarAVenta } from "./venta.js";
import { iniciarProductos, cargarProductos } from "./productos.js";

// Cada vista: id de su contenedor y qué hacer al mostrarla
const VISTAS = {
  venta: { id: "vista-venta" },
  productos: { id: "vista-productos", alMostrar: cargarProductos }
};

function mostrarVista(nombre) {
  Object.entries(VISTAS).forEach(([n, v]) =>
    document.getElementById(v.id).classList.toggle("oculto", n !== nombre));
  document.querySelectorAll(".nav-btn").forEach((b) =>
    b.classList.toggle("activo", b.dataset.vista === nombre));
  if (VISTAS[nombre].alMostrar) VISTAS[nombre].alMostrar();
}

document.querySelector(".app-nav").addEventListener("click", (e) => {
  const b = e.target.closest(".nav-btn");
  if (b) mostrarVista(b.dataset.vista);
});

iniciarProductos();
iniciarVenta();
iniciarCatalogo((producto, cantidad) => agregarAVenta(producto, cantidad));
