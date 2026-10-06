// js/entidades.js
import { listar, crear, actualizar, eliminar, nuevoId } from "./api.js";
import { estado } from "./state.js";
import { escapeHTML, mismoId, mostrarToast } from "./utils.js";

const el = (id) => document.getElementById(id);

let recursoActual = "categorias"; // "categorias" | "clientes" | "proveedores"
let registros = [];
let guardando = false;

async function cargarEntidades() {
  el("entidades-lista").innerHTML = '<p style="color: var(--color-ink-soft); font-size: 0.85rem;">Cargando...</p>';
  try {
    registros = await listar(recursoActual);
    if (recursoActual === "clientes") estado.clientes = registros;
    if (recursoActual === "categorias") estado.categorias = registros;
    dibujarLista();
  } catch (e) {
    el("entidades-lista").innerHTML = `<p style="color: red; font-size: 0.85rem;">Error: ${escapeHTML(e.message)}</p>`;
  }
}

function dibujarLista() {
  const contenedor = el("entidades-lista");
  if (registros.length === 0) {
    contenedor.innerHTML = '<p style="color: var(--color-ink-soft); font-size: 0.85rem;">No hay registros creados.</p>';
    return;
  }

  contenedor.innerHTML = registros.map((r) => {
    const extra = recursoActual !== "categorias" 
      ? ` · 📞 ${escapeHTML(r.telefono || "Sin tel")} · ✉️ ${escapeHTML(r.correo || "Sin correo")}`
      : "";

    return `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: var(--color-card); border: 1px solid var(--color-line); border-radius: 8px; font-size: 0.85rem;">
        <span><strong>${escapeHTML(r.nombre)}</strong>${extra}</span>
        <div style="display: flex; gap: 6px;">
          <button type="button" class="btn-vaciar btn-editar-entidad" data-id="${escapeHTML(r.id)}">✏️ Editar</button>
          <button type="button" class="btn-vaciar btn-eliminar-entidad" data-id="${escapeHTML(r.id)}" style="color: red; border-color: #FCA5A5;">🗑️ Eliminar</button>
        </div>
      </div>`;
  }).join("");
}

function cambiarPestaña(nueva) {
  recursoActual = nueva;
  
  el("tab-categorias").classList.toggle("selected", nueva === "categorias");
  el("tab-clientes").classList.toggle("selected", nueva === "clientes");
  el("tab-proveedores").classList.toggle("selected", nueva === "proveedores");

  // Ocultar teléfono y correo si es categoría
  const esCategoria = nueva === "categorias";
  document.querySelectorAll(".campo-extra").forEach((c) => c.style.display = esCategoria ? "none" : "flex");

  limpiarFormulario();
  cargarEntidades();
}

function limpiarFormulario() {
  el("entidad-id").value = "";
  el("entidad-nombre").value = "";
  el("entidad-telefono").value = "";
  el("entidad-correo").value = "";
  el("btn-cancelar-entidad").style.display = "none";
  el("btn-guardar-entidad").textContent = "💾 Guardar";
}

async function guardarEntidad(e) {
  e.preventDefault();
  if (guardando) return;

  const id = el("entidad-id").value;
  const nombre = el("entidad-nombre").value.trim();
  const telefono = el("entidad-telefono").value.trim();
  const correo = el("entidad-correo").value.trim();

  if (!nombre) return mostrarToast("El nombre es obligatorio.");

  guardando = true;
  const btn = el("btn-guardar-entidad");
  btn.disabled = true;

  try {
    const datos = { nombre };
    if (recursoActual !== "categorias") {
      datos.telefono = telefono;
      datos.correo = correo;
    }

    if (id) {
      await actualizar(recursoActual, { id, ...datos });
      mostrarToast("Registro actualizado ✓");
    } else {
      await crear(recursoActual, { id: nuevoId(), ...datos });
      mostrarToast("Registro creado ✓");
    }

    limpiarFormulario();
    await cargarEntidades();
  } catch (err) {
    mostrarToast("Error al guardar: " + err.message, 4000);
  } finally {
    guardando = false;
    btn.disabled = false;
  }
}

async function eliminarEntidad(id) {
  // Validación de integridad: evitar eliminar si hay relaciones asociadas
  try {
    if (recursoActual === "categorias") {
      const productos = await listar("productos");
      if (productos.some((p) => mismoId(p.categoriaId, id))) {
        return mostrarToast("No se puede eliminar: hay productos asociados a esta categoría.", 4000);
      }
    } else if (recursoActual === "clientes") {
      const ventas = await listar("ventas");
      if (ventas.some((v) => mismoId(v.clienteId, id))) {
        return mostrarToast("No se puede eliminar: el cliente tiene ventas asociadas.", 4000);
      }
    } else if (recursoActual === "proveedores") {
      const compras = await listar("compras");
      if (compras.some((c) => mismoId(c.proveedorId, id))) {
        return mostrarToast("No se puede eliminar: el proveedor tiene compras asociadas.", 4000);
      }
    }

    if (!confirm("¿Seguro de que deseas eliminar este registro?")) return;

    await eliminar(recursoActual, id);
    mostrarToast("Registro eliminado ✓");
    cargarEntidades();
  } catch (err) {
    mostrarToast("Error al eliminar: " + err.message, 4000);
  }
}

export function iniciarEntidades() {
  el("tab-categorias").addEventListener("click", () => cambiarPestaña("categorias"));
  el("tab-clientes").addEventListener("click", () => cambiarPestaña("clientes"));
  el("tab-proveedores").addEventListener("click", () => cambiarPestaña("proveedores"));

  el("form-entidades").addEventListener("submit", guardarEntidad);
  el("btn-cancelar-entidad").addEventListener("click", limpiarFormulario);

  el("entidades-lista").addEventListener("click", (e) => {
    const btnEditar = e.target.closest(".btn-editar-entidad");
    const btnEliminar = e.target.closest(".btn-eliminar-entidad");

    if (btnEditar) {
      const reg = registros.find((r) => mismoId(r.id, btnEditar.dataset.id));
      if (!reg) return;
      el("entidad-id").value = reg.id;
      el("entidad-nombre").value = reg.nombre || "";
      el("entidad-telefono").value = reg.telefono || "";
      el("entidad-correo").value = reg.correo || "";
      el("btn-cancelar-entidad").style.display = "inline-block";
      el("btn-guardar-entidad").textContent = "💾 Actualizar";
    }

    if (btnEliminar) {
      eliminarEntidad(btnEliminar.dataset.id);
    }
  });

  cambiarPestaña("categorias");
}