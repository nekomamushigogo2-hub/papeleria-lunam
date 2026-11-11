// js/faltantes.js
// Faltantes: productos que un cliente pidió y no había (agotados o que no existen
// en el inventario). Sirven para planear las próximas compras; no tocan inventario.
import { listar, crear, eliminar, ejecutar, consultar } from "./api.js";
import { estado } from "./state.js";
import { escapeHTML, mismoId, mostrarToast, formatearFecha, opcionesSelect, ico } from "./utils.js";
import { abrirModal, cerrarModal, confirmar } from "./modal.js";
import { alCambiar } from "./datos.js";
import { alMostrar } from "./navegacion.js";
import { esAdmin } from "./sesion.js";

const el = (id) => document.getElementById(id);
let faltantes = [];
let guardando = false;

// ---------- Formulario (modal) — se abre desde este módulo o desde el catálogo ----------
export function abrirFormularioFaltante({ tipo = "agotado", productoId = "", descripcion = "" } = {}) {
  let tipoActual = tipo;

  abrirModal(`
    <h3>Anotar faltante</h3>
    <p class="nota-rol">Algo que un cliente pidió y no se le pudo vender.</p>
    <form id="form-faltante" class="form-modal" novalidate>
      <div class="selector-tipo">
        <button type="button" class="btn-payment" data-tipo="agotado">Está agotado</button>
        <button type="button" class="btn-payment" data-tipo="inexistente">No lo vendemos</button>
      </div>

      <div class="campo" id="faltante-campo-producto">
        <label for="faltante-producto">Producto *</label>
        <select id="faltante-producto">${opcionesSelect(estado.productos, {
          vacio: "Selecciona producto...", elegido: productoId,
          texto: (p) => p.seguimientoInventario && Number(p.stock) <= 0 ? `${p.nombre} (agotado)` : p.nombre
        })}</select>
      </div>
      <div class="campo" id="faltante-campo-descripcion">
        <label for="faltante-descripcion">¿Qué pidió el cliente? *</label>
        <input type="text" id="faltante-descripcion" maxlength="120" value="${escapeHTML(descripcion)}" placeholder="Ej: cofia, papel celofán...">
      </div>

      <div class="form-modal-fila">
        <div class="campo">
          <label for="faltante-cantidad">Cantidad solicitada *</label>
          <input type="number" id="faltante-cantidad" min="1" step="1" value="1">
        </div>
        <div class="campo">
          <label for="faltante-proveedor">Proveedor (opcional)</label>
          <select id="faltante-proveedor">${opcionesSelect(estado.proveedores, { vacio: "Sin proveedor" })}</select>
        </div>
      </div>
      <div class="campo">
        <label for="faltante-observacion">Observación (opcional)</label>
        <input type="text" id="faltante-observacion" maxlength="200" placeholder="Ej: lo necesita para el viernes">
      </div>

      <div class="modal-buttons">
        <button type="button" class="btn-modal-secundario" data-cerrar-modal>Cancelar</button>
        <button type="submit" class="btn-add" id="btn-guardar-faltante">Anotar faltante</button>
      </div>
    </form>`);

  function pintarTipo() {
    document.querySelectorAll("#form-faltante [data-tipo]").forEach((b) =>
      b.classList.toggle("selected", b.dataset.tipo === tipoActual));
    el("faltante-campo-producto").classList.toggle("oculto", tipoActual !== "agotado");
    el("faltante-campo-descripcion").classList.toggle("oculto", tipoActual !== "inexistente");
  }

  el("form-faltante").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tipo]");
    if (!b) return;
    tipoActual = b.dataset.tipo;
    pintarTipo();
  });

  el("form-faltante").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (guardando) return;
    const cantidad = Number(el("faltante-cantidad").value);
    const datos = {
      tipo: tipoActual,
      cantidad,
      proveedorId: el("faltante-proveedor").value ? Number(el("faltante-proveedor").value) : null,
      observacion: el("faltante-observacion").value.trim()
    };
    if (tipoActual === "agotado") {
      if (!el("faltante-producto").value) return mostrarToast("Selecciona el producto agotado.");
      datos.productoId = Number(el("faltante-producto").value);
    } else {
      datos.descripcion = el("faltante-descripcion").value.trim();
      if (!datos.descripcion) return mostrarToast("Describe el producto que pidió el cliente.");
    }
    if (!Number.isInteger(cantidad) || cantidad < 1) return mostrarToast("La cantidad debe ser un entero mayor que 0.");

    guardando = true;
    el("btn-guardar-faltante").disabled = true;
    try {
      await crear("faltantes", datos);
      cerrarModal();
      mostrarToast("Faltante anotado ✓");
      cargarFaltantes();
    } catch (err) {
      mostrarToast("Error al registrar: " + err.message, 4000);
      el("btn-guardar-faltante").disabled = false;
    } finally {
      guardando = false;
    }
  });

  pintarTipo();
}

// ---------- Listado con filtros ----------
async function cargarFaltantes() {
  const lista = el("faltantes-lista");
  if (!faltantes.length) lista.innerHTML = '<p class="estado-carga">Cargando faltantes...</p>';
  try {
    const [datos, paraCompras] = await Promise.all([
      listar("faltantes", {
        tipo: el("filtro-faltante-tipo").value,
        proveedorId: el("filtro-faltante-proveedor").value,
        estado: el("filtro-faltante-estado").value
      }),
      consultar("/faltantes/para-compras/")
    ]);
    faltantes = datos;
    dibujarLista();
    dibujarParaCompras(paraCompras);
  } catch (e) {
    lista.innerHTML = `<div class="estado-error"><p>${escapeHTML(e.message)}</p></div>`;
  }
}

function dibujarLista() {
  const lista = el("faltantes-lista");
  const pendientes = faltantes.filter((f) => f.estado === "pendiente").length;
  el("faltantes-resumen").textContent =
    `${faltantes.length} registro${faltantes.length === 1 ? "" : "s"} · ${pendientes} pendiente${pendientes === 1 ? "" : "s"}`;

  if (!faltantes.length) {
    lista.innerHTML = '<p class="historial-vacio">No hay faltantes con esos filtros.</p>';
    return;
  }
  const admin = esAdmin();
  lista.innerHTML = faltantes.map((f) => {
    const chipTipo = f.tipo === "agotado"
      ? '<span class="chip chip-parcial">Agotado</span>'
      : '<span class="chip">No lo vendemos</span>';
    const chipEstado = f.estado === "pendiente"
      ? '<span class="chip chip-total">Pendiente</span>'
      : `<span class="chip chip-ok">Resuelto</span>`;
    const acciones = [
      f.estado === "pendiente" ? `<button type="button" class="btn-vaciar" data-resolver="${f.id}">${ico("check")}Marcar resuelto</button>` : "",
      admin && f.estado === "resuelto" ? `<button type="button" class="btn-vaciar" data-reabrir="${f.id}">Reabrir</button>` : "",
      admin ? `<button type="button" class="btn-vaciar btn-peligro" data-eliminar="${f.id}" aria-label="Eliminar faltante">${ico("eliminar")}</button>` : ""
    ].join("");
    return `
      <div class="registro-fila">
        <div class="registro-info">
          <strong>${escapeHTML(f.descripcion)} × ${f.cantidad}</strong>
          <span>${formatearFecha(f.fecha)} · ${escapeHTML(f.proveedorNombre || "Sin proveedor")} · registró ${escapeHTML(f.usuario)}${f.observacion ? " · " + escapeHTML(f.observacion) : ""}</span>
          <div class="chips">${chipTipo}${chipEstado}</div>
        </div>
        <div class="registro-acciones">${acciones}</div>
      </div>`;
  }).join("");
}

function dibujarParaCompras(filas) {
  const cont = el("faltantes-para-compras");
  if (!filas.length) {
    cont.innerHTML = '<p class="historial-vacio">No hay nada pendiente por pedir.</p>';
    return;
  }
  const grupos = {};
  filas.forEach((f) => (grupos[f.proveedor] ||= []).push(f));
  cont.innerHTML = Object.entries(grupos).map(([proveedor, lista]) => `
    <div class="grupo-proveedor">
      <h3>${ico("compras")}${escapeHTML(proveedor)}</h3>
      <div class="tabla-scroll">
        <table class="tabla-detalle">
          <thead><tr><th>Producto</th><th class="num">Veces pedido</th><th class="num">Unidades</th><th>Última vez</th></tr></thead>
          <tbody>${lista.map((f) => `
            <tr>
              <td>${escapeHTML(f.nombre)}${f.productoId ? "" : ' <span class="chip">nuevo</span>'}</td>
              <td class="num">${f.solicitudes}</td>
              <td class="num">${f.cantidadSolicitada}</td>
              <td>${formatearFecha(f.ultimaFecha)}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>`).join("");
}

async function accion(ruta, mensaje) {
  try {
    await ejecutar(ruta);
    mostrarToast(mensaje);
    cargarFaltantes();
  } catch (e) {
    mostrarToast(e.message, 4000);
  }
}

export function iniciarFaltantes() {
  el("btn-nuevo-faltante").addEventListener("click", () => abrirFormularioFaltante());
  el("btn-recargar-faltantes").addEventListener("click", cargarFaltantes);
  ["filtro-faltante-tipo", "filtro-faltante-proveedor", "filtro-faltante-estado"]
    .forEach((id) => el(id).addEventListener("change", cargarFaltantes));

  alCambiar("proveedores", () => {
    const actual = el("filtro-faltante-proveedor").value;
    el("filtro-faltante-proveedor").innerHTML = '<option value="">Todos</option><option value="ninguno">Sin proveedor</option>' +
      opcionesSelect(estado.proveedores, { elegido: actual });
    el("filtro-faltante-proveedor").value = actual;
  });
  alMostrar("faltantes", cargarFaltantes);

  el("faltantes-lista").addEventListener("click", async (e) => {
    const resolver = e.target.closest("[data-resolver]");
    const reabrir = e.target.closest("[data-reabrir]");
    const borrar = e.target.closest("[data-eliminar]");
    if (resolver) accion(`/faltantes/${resolver.dataset.resolver}/resolver/`, "Faltante marcado como resuelto ✓");
    if (reabrir) accion(`/faltantes/${reabrir.dataset.reabrir}/reabrir/`, "Faltante pendiente de nuevo");
    if (borrar) {
      const f = faltantes.find((x) => mismoId(x.id, borrar.dataset.eliminar));
      if (!f) return;
      const ok = await confirmar({
        titulo: `¿Eliminar el faltante "${f.descripcion}"?`,
        texto: "Dejará de contar en los reportes de faltantes.",
        aceptar: "Eliminar faltante", cancelar: "Conservar", peligro: true
      });
      if (!ok) return;
      try {
        await eliminar("faltantes", f.id);
        mostrarToast("Faltante eliminado ✓");
        cargarFaltantes();
      } catch (err) {
        mostrarToast(err.message, 4000);
      }
    }
  });
}
