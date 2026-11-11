// js/main.js
// Punto de entrada: valida la sesión, aplica el rol, arranca cada módulo y carga
// los datos iniciales del backend.
import { quienSoy } from "./api.js";
import { leerSesion, guardarSesion, cerrarSesion, esAdmin } from "./sesion.js";
import { recargar } from "./datos.js";
import { iniciarNavegacion, irA } from "./navegacion.js";
import { iniciarModal, confirmar } from "./modal.js";
import { iniciarCatalogo, mostrarErrorCatalogo } from "./catalogo.js";
import { iniciarVenta, agregarAVenta, cobrarConTeclado } from "./venta.js";
import { iniciarProductos } from "./productos.js";
import { iniciarHistorial } from "./historial.js";
import { iniciarCompras } from "./compras.js";
import { iniciarEntidades } from "./entidades.js";
import { iniciarDescuentos } from "./descuentos.js";
import { iniciarFaltantes } from "./faltantes.js";
import { iniciarReportes } from "./reportes.js";
import { mostrarToast, iniciales } from "./utils.js";

const el = (id) => document.getElementById(id);

// ---------- Sesión y rol ----------
function pintarUsuario() {
  const u = leerSesion()?.usuario;
  if (!u) return cerrarSesion();
  el("usuario-nombre").textContent = u.nombre || u.username;
  el("usuario-rol").textContent = u.rol === "admin" ? "Administrador" : "Cajero";
  el("usuario-inicial").textContent = iniciales(u.nombre || u.username).slice(0, 1);
  // Con este atributo, todo lo marcado data-solo-admin desaparece (ver css/pos.css)
  document.body.dataset.rol = esAdmin() ? "admin" : "cajero";
}

el("btn-salir").addEventListener("click", async () => {
  const ok = await confirmar({
    titulo: "¿Cerrar sesión?",
    texto: "Las ventas guardadas para después se conservan y cualquier usuario puede retomarlas.",
    aceptar: "Cerrar sesión", cancelar: "Seguir aquí"
  });
  if (ok) cerrarSesion();
});

// ---------- Modo oscuro (preferencia del navegador) ----------
const btnTema = el("btn-tema");
function pintarTema(oscuro) {
  document.body.classList.toggle("dark-mode", oscuro);
  btnTema.setAttribute("aria-pressed", String(oscuro));
  btnTema.querySelector("span").textContent = oscuro ? "Modo claro" : "Modo oscuro";
}
pintarTema(localStorage.getItem("tema") === "oscuro");
btnTema.addEventListener("click", () => {
  const oscuro = !document.body.classList.contains("dark-mode");
  pintarTema(oscuro);
  localStorage.setItem("tema", oscuro ? "oscuro" : "claro");
});

// ---------- Atajos de teclado para la caja ----------
//   /            -> buscar producto
//   Ctrl+Enter   -> cobrar la venta
document.addEventListener("keydown", (e) => {
  const escribiendo = e.target.matches("input, select, textarea");
  const hayVentana = !el("modal").classList.contains("oculto") || !el("dialogo").classList.contains("oculto");
  if (e.key === "/" && !escribiendo && !hayVentana) {
    e.preventDefault();
    irA("venta");
    el("buscador").focus();
  }
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !hayVentana) {
    e.preventDefault();
    irA("venta");
    cobrarConTeclado();
  }
});

// ---------- Arranque ----------
async function cargarDatosIniciales() {
  try {
    await recargar();   // productos, categorías, clientes, proveedores y descuentos en paralelo
  } catch (e) {
    mostrarErrorCatalogo(e.message, cargarDatosIniciales);
    mostrarToast(e.message, 5000);
  }
}

pintarUsuario();
iniciarModal();
iniciarVenta();
iniciarCatalogo(agregarAVenta);
iniciarProductos();
iniciarHistorial();
iniciarCompras();
iniciarEntidades();
iniciarDescuentos();
iniciarFaltantes();
iniciarReportes();
iniciarNavegacion();
cargarDatosIniciales();

// Confirma con el backend que el token sigue vigente y que el rol no cambió
quienSoy()
  .then((usuario) => { guardarSesion({ usuario }); pintarUsuario(); })
  .catch(() => {});
