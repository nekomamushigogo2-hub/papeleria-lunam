// js/api.js
// ÚNICO archivo que hace fetch. Habla con el backend propio (Django REST) usando
// los verbos HTTP: GET listar/consultar · POST crear · PATCH/PUT editar · DELETE eliminar.
// Antes (MVP 2) este archivo hablaba con Google Sheets; el resto del frontend casi no cambió.
import { API_URL } from "./config.js";
import { leerSesion, guardarSesion, cerrarSesion } from "./sesion.js";

// ---------- Núcleo ----------
async function pedir(metodo, ruta, datos, puedeRefrescar = true) {
  const sesion = leerSesion();
  const headers = { "Content-Type": "application/json" };
  if (sesion?.access) headers.Authorization = `Bearer ${sesion.access}`;

  let respuesta;
  try {
    respuesta = await fetch(API_URL + ruta, {
      method: metodo,
      headers,
      body: datos === undefined ? undefined : JSON.stringify(datos)
    });
  } catch (e) {
    throw new Error("No se pudo conectar con el servidor. Si acaba de iniciar, espera unos segundos y reintenta.");
  }

  // 401 = token vencido: se intenta renovar una vez con el refresh token
  if (respuesta.status === 401 && puedeRefrescar && sesion?.refresh) {
    if (await refrescarToken(sesion.refresh)) return pedir(metodo, ruta, datos, false);
    cerrarSesion({ expirada: true });
    throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
  }

  if (respuesta.status === 204) return null;   // DELETE correcto: sin contenido

  let json = null;
  try {
    json = await respuesta.json();
  } catch (e) {
    if (!respuesta.ok) throw new Error(`El servidor respondió con error ${respuesta.status}.`);
  }

  if (!respuesta.ok) {
    const error = new Error(json?.detail || `Error ${respuesta.status}`);
    error.status = respuesta.status;
    throw error;
  }
  return json;
}

async function refrescarToken(refresh) {
  try {
    const r = await fetch(`${API_URL}/auth/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh })
    });
    if (!r.ok) return false;
    const { access } = await r.json();
    guardarSesion({ access });
    return true;
  } catch (e) {
    return false;
  }
}

// { estado: "cerrada", desde: "" } -> "?estado=cerrada" (omite vacíos)
function query(filtros = {}) {
  const p = new URLSearchParams();
  Object.entries(filtros).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") p.append(k, v);
  });
  const texto = p.toString();
  return texto ? `?${texto}` : "";
}

// ---------- Operaciones REST genéricas por recurso ----------
export const listar = (recurso, filtros) => pedir("GET", `/${recurso}/${query(filtros)}`);
export const obtener = (recurso, id) => pedir("GET", `/${recurso}/${id}/`);
export const crear = (recurso, datos) => pedir("POST", `/${recurso}/`, datos);
export const reemplazar = (recurso, id, datos) => pedir("PUT", `/${recurso}/${id}/`, datos);
export const eliminar = (recurso, id) => pedir("DELETE", `/${recurso}/${id}/`);

// Actualizar: datos incluye el id y solo los campos que cambian (PATCH)
export function actualizar(recurso, datos) {
  const { id, ...cambios } = datos;
  return pedir("PATCH", `/${recurso}/${id}/`, cambios);
}

// Acciones que no son CRUD: /ventas/5/corregir/, /faltantes/3/resolver/ ...
export const ejecutar = (ruta, datos = {}) => pedir("POST", ruta, datos);
export const consultar = (ruta, filtros) => pedir("GET", `${ruta}${query(filtros)}`);

// ---------- Autenticación ----------
export async function iniciarSesion(username, password) {
  const datos = await pedir("POST", "/auth/login/", { username, password }, false);
  guardarSesion(datos);
  return datos.usuario;
}

export const quienSoy = () => pedir("GET", "/auth/yo/");
