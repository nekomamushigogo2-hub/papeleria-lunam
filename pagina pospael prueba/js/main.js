// js/main.js
import { iniciarCatalogo } from "./catalogo.js";
import { iniciarVenta, agregarAVenta } from "./venta.js";
import { iniciarCompras } from "./compras.js";
import { iniciarEntidades } from "./entidades.js";

// --- MODO OSCURO ---
const btnTema = document.getElementById("btn-tema");
if (btnTema) {
  // Aplicar preferencia guardada
  if (localStorage.getItem("tema") === "oscuro") {
    document.body.classList.add("dark-mode");
    btnTema.textContent = "☀️";
  }

  btnTema.addEventListener("click", () => {
    const esOscuro = document.body.classList.toggle("dark-mode");
    btnTema.textContent = esOscuro ? "☀️" : "🌙";
    localStorage.setItem("tema", esOscuro ? "oscuro" : "claro");
  });
}

iniciarVenta();
iniciarCatalogo((producto, cantidad) => agregarAVenta(producto, cantidad));
iniciarCompras();
iniciarEntidades();