// js/datos.js
// Carga los catálogos compartidos (productos, categorías, clientes, proveedores y
// descuentos) en `estado` y avisa a las vistas cuando cambian, para que cada una
// vuelva a dibujar sus listas y selectores sin recargar la página.
import { listar } from "./api.js";
import { estado } from "./state.js";

const oyentes = {};   // { productos: [fn, fn], clientes: [fn] ... }

// alCambiar(["productos", "categorias"], dibujar)
export function alCambiar(tipos, funcion) {
  [].concat(tipos).forEach((t) => (oyentes[t] ||= []).push(funcion));
}

export function avisarCambio(tipo) {
  (oyentes[tipo] || []).forEach((f) => {
    try { f(); } catch (e) { console.error(e); }
  });
}

// recargar("productos") | recargar("clientes", "proveedores") | recargar() = todos
export async function recargar(...tipos) {
  const lista = tipos.length ? tipos : ["productos", "categorias", "clientes", "proveedores", "descuentos"];
  const resultados = await Promise.all(lista.map((t) => listar(t)));   // en paralelo
  lista.forEach((t, i) => { estado[t] = resultados[i]; });
  lista.forEach(avisarCambio);
}
