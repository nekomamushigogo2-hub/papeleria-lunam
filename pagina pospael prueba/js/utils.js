// js/utils.js
// Funciones pequeñas que usan todas las vistas.

export function formatearMoneda(valor) {
  return Number(valor || 0).toLocaleString("es-CO", {
    style: "currency", currency: "COP", minimumFractionDigits: 0
  });
}

// Evita que un nombre con < > " se interprete como HTML (los datos vienen de afuera)
export function escapeHTML(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// Sheets a veces devuelve como número un id que parece número: se compara como texto
export function mismoId(a, b) {
  return String(a) === String(b);
}

export function mostrarToast(mensaje, duracionMs = 2500) {
  const toast = document.getElementById("notificacion");
  if (!toast) return;
  toast.textContent = mensaje;
  toast.classList.add("visible");
  clearTimeout(toast._timeoutId);
  toast._timeoutId = setTimeout(() => toast.classList.remove("visible"), duracionMs);
}
