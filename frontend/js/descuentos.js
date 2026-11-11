// js/descuentos.js
// Catálogo de descuentos: el admin crea, edita y elimina; el cajero los consulta
// y los aplica desde la venta. Eliminar un descuento no altera ventas ya registradas.
import { crear, actualizar, eliminar } from "./api.js";
import { estado } from "./state.js";
import { escapeHTML, mismoId, mostrarToast, textoDescuento, ico } from "./utils.js";
import { confirmar } from "./modal.js";
import { alCambiar, avisarCambio, recargar } from "./datos.js";
import { esAdmin } from "./sesion.js";

const el = (id) => document.getElementById(id);
let guardando = false;

function dibujar() {
  const lista = el("descuentos-lista");
  if (!estado.descuentos.length) {
    lista.innerHTML = '<p class="historial-vacio">No hay descuentos creados.</p>';
    return;
  }
  const admin = esAdmin();
  lista.innerHTML = estado.descuentos.map((d) => `
    <div class="registro-fila">
      <div class="registro-info">
        <strong>${escapeHTML(d.nombre)}</strong>
        <span>${d.tipo === "porcentaje" ? "Porcentual" : "Valor fijo"} · ${textoDescuento(d)} sobre el total</span>
      </div>
      ${admin ? `
      <div class="registro-acciones">
        <button type="button" class="btn-vaciar" data-editar="${d.id}">${ico("editar")}Editar</button>
        <button type="button" class="btn-vaciar btn-peligro" data-eliminar="${d.id}">${ico("eliminar")}Eliminar</button>
      </div>` : ""}
    </div>`).join("");
}

function limpiar() {
  ["descuento-id", "descuento-nombre", "descuento-valor"].forEach((id) => (el(id).value = ""));
  el("descuento-tipo").value = "porcentaje";
  el("btn-cancelar-descuento").classList.add("oculto");
  el("btn-guardar-descuento").textContent = "Crear descuento";
}

async function guardar(e) {
  e.preventDefault();
  if (guardando) return;
  const id = el("descuento-id").value;
  const nombre = el("descuento-nombre").value.trim();
  const tipo = el("descuento-tipo").value;
  const valor = Number(el("descuento-valor").value);

  if (!nombre) return mostrarToast("El nombre es obligatorio.");
  if (!Number.isInteger(valor) || valor <= 0) return mostrarToast("El valor debe ser un entero mayor que 0.");
  if (tipo === "porcentaje" && valor > 100) return mostrarToast("Un porcentaje no puede superar 100.");

  guardando = true;
  el("btn-guardar-descuento").disabled = true;
  try {
    if (id) await actualizar("descuentos", { id, nombre, tipo, valor });
    else await crear("descuentos", { nombre, tipo, valor });
    mostrarToast(id ? "Descuento actualizado ✓" : "Descuento creado ✓");
    limpiar();
    await recargar("descuentos");
  } catch (err) {
    mostrarToast("Error al guardar: " + err.message, 4000);
  } finally {
    guardando = false;
    el("btn-guardar-descuento").disabled = false;
  }
}

async function borrar(id) {
  const d = estado.descuentos.find((x) => mismoId(x.id, id));
  if (!d) return;
  const ok = await confirmar({
    titulo: `¿Eliminar el descuento "${d.nombre}"?`,
    texto: "Ya no se podrá aplicar a ventas nuevas. Las ventas que ya lo usaron conservan su valor.",
    aceptar: "Eliminar descuento", cancelar: "Conservar", peligro: true
  });
  if (!ok) return;
  try {
    await eliminar("descuentos", id);
    estado.descuentos = estado.descuentos.filter((x) => !mismoId(x.id, id));
    avisarCambio("descuentos");
    mostrarToast("Descuento eliminado ✓");
  } catch (err) {
    mostrarToast(err.message, 4000);
  }
}

export function iniciarDescuentos() {
  alCambiar("descuentos", dibujar);
  el("form-descuento").addEventListener("submit", guardar);
  el("btn-cancelar-descuento").addEventListener("click", limpiar);
  el("btn-recargar-descuentos").addEventListener("click", () => recargar("descuentos").catch((e) => mostrarToast(e.message)));

  el("descuentos-lista").addEventListener("click", (e) => {
    const editar = e.target.closest("[data-editar]");
    const eliminarBtn = e.target.closest("[data-eliminar]");
    if (editar) {
      const d = estado.descuentos.find((x) => mismoId(x.id, editar.dataset.editar));
      if (!d) return;
      el("descuento-id").value = d.id;
      el("descuento-nombre").value = d.nombre;
      el("descuento-tipo").value = d.tipo;
      el("descuento-valor").value = d.valor;
      el("btn-cancelar-descuento").classList.remove("oculto");
      el("btn-guardar-descuento").textContent = "Guardar cambios";
      el("descuento-nombre").focus();
    }
    if (eliminarBtn) borrar(eliminarBtn.dataset.eliminar);
  });
}
