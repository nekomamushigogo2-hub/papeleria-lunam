// js/utils.js
// Funciones pequeñas que usan todas las vistas.

export function formatearMoneda(valor) {
  return Number(valor || 0).toLocaleString("es-CO", {
    style: "currency", currency: "COP", minimumFractionDigits: 0, maximumFractionDigits: 0
  });
}

// Evita que un nombre con < > " se interprete como HTML (los datos vienen de afuera)
export function escapeHTML(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// Los ids llegan como número y los <select> los devuelven como texto: se comparan como texto
export function mismoId(a, b) {
  return String(a) === String(b);
}

// Para buscar sin importar tildes ni mayúsculas: "Lápiz" -> "lapiz"
export function normalizar(texto) {
  return String(texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

// Ícono del sprite de index.html: ico("editar") -> <svg ...><use href="#i-editar"/></svg>
export function ico(nombre) {
  return `<svg class="icono" aria-hidden="true"><use href="#i-${nombre}"/></svg>`;
}

// Iniciales para la ficha del producto: "Cuaderno cuadriculado" -> "CC"
export function iniciales(nombre) {
  return String(nombre || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

// Cada categoría recibe siempre el mismo color de resaltador (0..5)
export function tonoCategoria(nombre) {
  let h = 0;
  for (const c of String(nombre || "")) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 6;
}

// Tipo del aviso: los mensajes de éxito terminan en "✓" (se muestra verde, sin el símbolo);
// los de error se llaman con duración de 4 s o más (rojo); el resto es neutro.
export function mostrarToast(mensaje, duracionMs = 2500) {
  const toast = document.getElementById("notificacion");
  if (!toast) return;
  const exito = /✓\s*$/.test(mensaje);
  toast.className = "toast " + (exito ? "exito" : duracionMs >= 4000 ? "error" : "");
  toast.innerHTML = (exito ? ico("check") : "") + escapeHTML(String(mensaje).replace(/\s*✓\s*$/, ""));
  void toast.offsetWidth;
  toast.classList.add("visible");
  clearTimeout(toast._timeoutId);
  toast._timeoutId = setTimeout(() => toast.classList.remove("visible"), duracionMs);
}

// Las líneas de venta y compra llegan del backend como arreglo "items"
export function leerItems(registro) {
  return Array.isArray(registro?.items) ? registro.items : [];
}

// "2026-10-06T15:30:00-05:00" -> "6/10/26, 3:30 p. m." (hora local)
export function formatearFecha(fecha) {
  if (!fecha) return "Sin fecha";
  const d = new Date(fecha);
  if (isNaN(d)) return "Sin fecha";
  return d.toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
}

// Fecha local en formato YYYY-MM-DD, para comparar con un <input type="date">
export function fechaLocalISO(fecha) {
  const d = new Date(fecha);
  if (isNaN(d)) return "";
  const dos = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

// Número de factura legible: 7 -> "000007"
export function numeroVenta(id) {
  return String(id).padStart(6, "0");
}

// Mismo cálculo que el backend (services/ventas.py): porcentaje o valor fijo, nunca negativo
export function calcularDescuento(subtotal, tipo, valor) {
  if (!tipo) return 0;
  if (tipo === "porcentaje") return Math.round(subtotal * Number(valor) / 100);
  return Math.min(Number(valor), subtotal);
}

export function textoDescuento(d) {
  if (!d) return "";
  return d.tipo === "porcentaje" ? `${d.valor} %` : formatearMoneda(d.valor);
}

export function opcionesSelect(lista, { vacio, elegido, texto = (x) => x.nombre } = {}) {
  const inicio = vacio !== undefined ? `<option value="">${escapeHTML(vacio)}</option>` : "";
  return inicio + lista.map((x) =>
    `<option value="${escapeHTML(x.id)}" ${elegido != null && mismoId(x.id, elegido) ? "selected" : ""}>${escapeHTML(texto(x))}</option>`
  ).join("");
}
