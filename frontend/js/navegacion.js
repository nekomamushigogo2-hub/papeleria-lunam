// js/navegacion.js
// Muestra un módulo a la vez (Nueva venta, Ventas, Productos...). La vista actual
// queda en la URL (#ventas) para que al recargar se vuelva al mismo módulo.
import { esAdmin } from "./sesion.js";

const oyentes = {};

export function alMostrar(vista, funcion) {
  (oyentes[vista] ||= []).push(funcion);
}

function botonDe(vista) {
  return document.querySelector(`#app-nav [data-ir="${vista}"]`);
}

function vistaPermitida(vista) {
  const boton = botonDe(vista);
  if (!boton) return false;
  return esAdmin() || !boton.hasAttribute("data-solo-admin");
}

// Menú lateral en celular
export function abrirMenu(abrir) {
  document.body.classList.toggle("menu-abierto", abrir);
  document.getElementById("btn-menu").setAttribute("aria-expanded", String(abrir));
  if (abrir) document.querySelector("#app-nav .selected")?.focus();
}

export function irA(vista) {
  if (!vistaPermitida(vista)) vista = "venta";
  document.querySelectorAll("[data-vista]").forEach((s) =>
    s.classList.toggle("oculto", s.dataset.vista !== vista));
  document.querySelectorAll("#app-nav [data-ir]").forEach((b) => {
    const activo = b.dataset.ir === vista;
    b.classList.toggle("selected", activo);
    if (activo) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });

  // La venta usa dos columnas (catálogo + cuaderno); el resto, una
  document.getElementById("contenido-principal").classList.toggle("vista-venta", vista === "venta");
  document.querySelector("[data-vista-ayuda]").classList.toggle("oculto", vista !== "venta");
  const titulo = botonDe(vista).dataset.titulo;
  document.getElementById("titulo-vista").textContent = titulo;
  document.title = `${titulo} — Papel y Luna`;

  if (location.hash !== `#${vista}`) history.replaceState(null, "", `#${vista}`);
  abrirMenu(false);
  window.scrollTo({ top: 0 });
  (oyentes[vista] || []).forEach((f) => f());
}

export function iniciarNavegacion() {
  document.getElementById("app-nav").addEventListener("click", (e) => {
    const b = e.target.closest("[data-ir]");
    if (b) irA(b.dataset.ir);
  });
  document.getElementById("btn-menu").addEventListener("click", () =>
    abrirMenu(!document.body.classList.contains("menu-abierto")));
  document.getElementById("velo").addEventListener("click", () => abrirMenu(false));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.body.classList.contains("menu-abierto")) abrirMenu(false);
  });

  // Atrás/adelante del navegador o un enlace a #ventas también cambian de módulo
  window.addEventListener("hashchange", () => irA(location.hash.slice(1) || "venta"));
  irA(location.hash.slice(1) || "venta");
}
