// js/entidades.js
// CRUD de clientes, categorías y proveedores.
// Cajero: gestiona clientes; categorías y proveedores solo los consulta (matriz 3.8).
// El backend impide borrar registros con datos asociados (responde 409).
import { crear, actualizar, eliminar } from "./api.js";
import { estado } from "./state.js";
import { escapeHTML, mismoId, mostrarToast, ico } from "./utils.js";
import { confirmar } from "./modal.js";
import { alCambiar, avisarCambio, recargar } from "./datos.js";
import { esAdmin } from "./sesion.js";

const el = (id) => document.getElementById(id);

let recursoActual = "clientes"; // "clientes" | "categorias" | "proveedores"
let guardando = false;

const puedeEditar = () => recursoActual === "clientes" || esAdmin();
const registros = () => estado[recursoActual];

function dibujarLista() {
  const contenedor = el("entidades-lista");
  const lista = registros();
  const editable = puedeEditar();

  el("form-entidades").classList.toggle("oculto", !editable);
  el("nota-entidades").textContent = editable ? "" : "Solo el administrador puede modificar este listado.";

  if (lista.length === 0) {
    contenedor.innerHTML = '<p class="historial-vacio">No hay registros creados.</p>';
    return;
  }

  contenedor.innerHTML = lista.map((r) => {
    let extra = "";
    if (recursoActual !== "categorias") {
      const partes = [];
      if (r.nit) partes.push(`NIT ${escapeHTML(r.nit)}`);
      partes.push(r.telefono ? `Tel. ${escapeHTML(r.telefono)}` : "Sin teléfono");
      if (r.correo) partes.push(escapeHTML(r.correo));
      extra = `<span>${partes.join(" · ")}</span>`;
    }
    const acciones = editable ? `
        <div class="registro-acciones">
          <button type="button" class="btn-vaciar btn-editar-entidad" data-id="${escapeHTML(r.id)}">${ico("editar")}Editar</button>
          <button type="button" class="btn-vaciar btn-eliminar-entidad btn-peligro" data-id="${escapeHTML(r.id)}">${ico("eliminar")}Eliminar</button>
        </div>` : "";
    return `
      <div class="registro-fila">
        <div class="registro-info"><strong>${escapeHTML(r.nombre)}</strong>${extra}</div>${acciones}
      </div>`;
  }).join("");
}

function cambiarPestana(nueva) {
  recursoActual = nueva;
  ["clientes", "categorias", "proveedores"].forEach((t) =>
    el(`tab-${t}`).classList.toggle("selected", t === nueva));

  const esCategoria = nueva === "categorias";
  document.querySelectorAll(".campo-extra").forEach((c) => c.classList.toggle("oculto", esCategoria));
  document.querySelectorAll(".campo-proveedor").forEach((c) => c.classList.toggle("oculto", nueva !== "proveedores"));

  limpiarFormulario();
  dibujarLista();
}

function limpiarFormulario() {
  ["entidad-id", "entidad-nombre", "entidad-nit", "entidad-telefono", "entidad-correo"].forEach((id) => (el(id).value = ""));
  el("btn-cancelar-entidad").classList.add("oculto");
  el("btn-guardar-entidad").textContent = "Guardar";
}

async function guardarEntidad(e) {
  e.preventDefault();
  if (guardando) return;

  const id = el("entidad-id").value;
  const nombre = el("entidad-nombre").value.trim();
  if (!nombre) return mostrarToast("El nombre es obligatorio.");

  const datos = { nombre };
  if (recursoActual !== "categorias") {
    datos.telefono = el("entidad-telefono").value.trim();
    datos.correo = el("entidad-correo").value.trim();
  }
  if (recursoActual === "proveedores") datos.nit = el("entidad-nit").value.trim();

  guardando = true;
  el("btn-guardar-entidad").disabled = true;
  try {
    if (id) await actualizar(recursoActual, { id, ...datos });
    else await crear(recursoActual, datos);
    mostrarToast(id ? "Registro actualizado ✓" : "Registro creado ✓");
    limpiarFormulario();
    await recargar(recursoActual);
    if (recursoActual === "categorias") recargar("productos");   // los productos muestran el nombre de la categoría
  } catch (err) {
    mostrarToast("Error al guardar: " + err.message, 4000);
  } finally {
    guardando = false;
    el("btn-guardar-entidad").disabled = false;
  }
}

async function eliminarEntidad(id) {
  const reg = registros().find((r) => mismoId(r.id, id));
  if (!reg) return;
  const singular = { clientes: "el cliente", categorias: "la categoría", proveedores: "el proveedor" }[recursoActual];
  const ok = await confirmar({
    titulo: `¿Eliminar ${singular} "${reg.nombre}"?`,
    texto: "Si tiene ventas, productos o compras asociadas no se podrá eliminar.",
    aceptar: "Eliminar", cancelar: "Conservar", peligro: true
  });
  if (!ok) return;
  try {
    await eliminar(recursoActual, id);
    estado[recursoActual] = registros().filter((r) => !mismoId(r.id, id));
    avisarCambio(recursoActual);
    mostrarToast("Registro eliminado ✓");
  } catch (err) {
    // 409: "No se puede eliminar: tiene registros asociados."
    mostrarToast(err.message, 4500);
  }
}

export function iniciarEntidades() {
  ["clientes", "categorias", "proveedores"].forEach((t) =>
    el(`tab-${t}`).addEventListener("click", () => cambiarPestana(t)));

  el("form-entidades").addEventListener("submit", guardarEntidad);
  el("btn-cancelar-entidad").addEventListener("click", limpiarFormulario);
  alCambiar(["clientes", "categorias", "proveedores"], dibujarLista);

  el("entidades-lista").addEventListener("click", (e) => {
    const btnEditar = e.target.closest(".btn-editar-entidad");
    const btnEliminar = e.target.closest(".btn-eliminar-entidad");

    if (btnEditar) {
      const reg = registros().find((r) => mismoId(r.id, btnEditar.dataset.id));
      if (!reg) return;
      el("entidad-id").value = reg.id;
      el("entidad-nombre").value = reg.nombre || "";
      el("entidad-nit").value = reg.nit || "";
      el("entidad-telefono").value = reg.telefono || "";
      el("entidad-correo").value = reg.correo || "";
      el("btn-cancelar-entidad").classList.remove("oculto");
      el("btn-guardar-entidad").textContent = "Guardar cambios";
      el("entidad-nombre").focus();
    }
    if (btnEliminar) eliminarEntidad(btnEliminar.dataset.id);
  });

  cambiarPestana("clientes");
}
