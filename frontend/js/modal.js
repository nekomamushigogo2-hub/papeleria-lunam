// js/modal.js
// Ventana emergente reutilizable (factura, formularios, corrección, reembolso) y
// diálogo de confirmación propio (reemplaza a confirm() del navegador).
// Accesibilidad: al abrir se enfoca el contenido, Tab no se sale de la ventana,
// Esc la cierra y al cerrar el foco vuelve al botón que la abrió.

const modal = () => document.getElementById("modal");
const contenido = () => document.getElementById("modal-contenido");
const dialogo = () => document.getElementById("dialogo");

let focoAnterior = null;

const ENFOCABLES = 'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function atraparFoco(e, caja) {
  if (e.key !== "Tab") return;
  const lista = [...caja.querySelectorAll(ENFOCABLES)].filter((x) => x.offsetParent !== null);
  if (!lista.length) return;
  const primero = lista[0];
  const ultimo = lista[lista.length - 1];
  if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
  else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
}

export function abrirModal(html) {
  if (modal().classList.contains("oculto")) focoAnterior = document.activeElement;
  contenido().innerHTML = html;
  const titulo = contenido().querySelector("h3");
  if (titulo) {
    titulo.id = "modal-titulo";
    contenido().setAttribute("aria-labelledby", "modal-titulo");
  }
  modal().classList.remove("oculto");
  document.body.style.overflow = "hidden";
  // Enfoca el primer campo; si no hay, la ventana misma
  const campo = contenido().querySelector("input:not([type=hidden]):not([disabled]), select, textarea");
  (campo || contenido()).focus();
}

export function cerrarModal() {
  modal().classList.add("oculto");
  contenido().innerHTML = "";
  document.body.style.overflow = "";
  if (focoAnterior && document.contains(focoAnterior)) focoAnterior.focus();
  focoAnterior = null;
}

// ---------- Confirmación ----------
// const ok = await confirmar({ titulo, texto, aceptar: "Eliminar producto", cancelar: "Conservar", peligro: true })
export function confirmar({ titulo, texto = "", aceptar = "Aceptar", cancelar = "Cancelar", peligro = false }) {
  return new Promise((resolver) => {
    const caja = dialogo();
    const previo = document.activeElement;
    const btnSi = document.getElementById("dialogo-aceptar");
    const btnNo = document.getElementById("dialogo-cancelar");

    document.getElementById("dialogo-titulo").textContent = titulo;
    document.getElementById("dialogo-texto").textContent = texto;
    btnSi.textContent = aceptar;
    btnNo.textContent = cancelar;
    btnSi.classList.toggle("peligro", peligro);
    caja.classList.remove("oculto");
    // En acciones peligrosas el foco empieza en "Cancelar" para evitar confirmar por error
    (peligro ? btnNo : btnSi).focus();

    function terminar(valor) {
      caja.classList.add("oculto");
      btnSi.removeEventListener("click", si);
      btnNo.removeEventListener("click", no);
      caja.removeEventListener("keydown", teclas);
      caja.removeEventListener("click", fuera);
      if (previo && document.contains(previo)) previo.focus();
      resolver(valor);
    }
    const si = () => terminar(true);
    const no = () => terminar(false);
    const teclas = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); terminar(false); }
      atraparFoco(e, caja);
    };
    const fuera = (e) => { if (e.target === caja) terminar(false); };

    btnSi.addEventListener("click", si);
    btnNo.addEventListener("click", no);
    caja.addEventListener("keydown", teclas);
    caja.addEventListener("click", fuera);
  });
}

export function iniciarModal() {
  modal().addEventListener("click", (e) => {
    if (e.target === modal() || e.target.closest("[data-cerrar-modal]")) cerrarModal();
  });
  modal().addEventListener("keydown", (e) => atraparFoco(e, contenido()));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal().classList.contains("oculto") && dialogo().classList.contains("oculto")) cerrarModal();
  });
}
