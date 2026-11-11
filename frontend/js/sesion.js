// js/sesion.js
// Persistencia de la sesión: los tokens JWT y los datos del usuario quedan en
// localStorage, así la sesión sobrevive a recargar la página o cerrar la pestaña.

const CLAVE = "pos_sesion";

export function leerSesion() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE)) || null;
  } catch (e) {
    return null;
  }
}

export function guardarSesion({ access, refresh, usuario }) {
  const actual = leerSesion() || {};
  localStorage.setItem(CLAVE, JSON.stringify({
    access: access ?? actual.access,
    refresh: refresh ?? actual.refresh,
    usuario: usuario ?? actual.usuario
  }));
}

export function usuarioActual() {
  return leerSesion()?.usuario || null;
}

export function esAdmin() {
  return usuarioActual()?.rol === "admin";
}

// Cerrar sesión = olvidar los tokens (JWT no guarda estado en el servidor).
// Las ventas abiertas NO se pierden: están guardadas en la base de datos.
export function cerrarSesion({ expirada = false } = {}) {
  localStorage.removeItem(CLAVE);
  location.href = "login.html" + (expirada ? "?expirada=1" : "");
}
