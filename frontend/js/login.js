// js/login.js
// Pantalla de inicio de sesión: valida usuario y contraseña contra el backend
// (POST /api/auth/login/) y guarda los tokens para las siguientes peticiones.
import { iniciarSesion } from "./api.js";
import { leerSesion } from "./sesion.js";

const el = (id) => document.getElementById(id);

// Si ya hay sesión guardada, se entra directo
if (leerSesion()?.access) location.replace("index.html");
if (localStorage.getItem("tema") === "oscuro") document.body.classList.add("dark-mode");

function avisar(texto, tipo = "error") {
  el("login-aviso").textContent = texto;
  el("login-aviso").classList.toggle("info", tipo === "info");
  el("login-aviso").classList.toggle("oculto", !texto);
}

if (new URLSearchParams(location.search).get("expirada")) {
  avisar("Tu sesión expiró. Ingresa de nuevo para seguir.", "info");
}

// Mostrar / ocultar la contraseña
el("btn-ver-clave").addEventListener("click", () => {
  const visible = el("clave").type === "text";
  el("clave").type = visible ? "password" : "text";
  el("btn-ver-clave").setAttribute("aria-pressed", String(!visible));
  el("btn-ver-clave").setAttribute("aria-label", visible ? "Mostrar contraseña" : "Ocultar contraseña");
});

el("form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const usuario = el("usuario").value.trim();
  const clave = el("clave").value;
  if (!usuario || !clave) {
    avisar("Escribe tu usuario y tu contraseña.");
    (usuario ? el("clave") : el("usuario")).focus();
    return;
  }

  const boton = el("btn-entrar");
  boton.disabled = true;
  boton.textContent = "Ingresando…";
  avisar("");

  // El plan gratuito del backend se "duerme": si tarda, se avisa
  const lento = setTimeout(() => avisar("Despertando el servidor. La primera vez del día puede tardar hasta un minuto.", "info"), 4000);

  try {
    await iniciarSesion(usuario, clave);
    location.replace("index.html");
  } catch (err) {
    avisar(err.message === "Usuario o contraseña incorrectos."
      ? "Usuario o contraseña incorrectos. Revisa mayúsculas y vuelve a intentar."
      : err.message);
    boton.disabled = false;
    boton.textContent = "Ingresar";
    el("clave").select();
  } finally {
    clearTimeout(lento);
  }
});
