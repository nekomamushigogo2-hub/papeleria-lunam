// js/reportes.js
// Reportes por rango de fechas (solo administrador). Los cálculos los hace el
// backend con consultas agrupadas; aquí se piden en paralelo y se dibujan.
//
// Gráficas: cada una muestra UNA sola serie (un solo color, sin leyenda), barras
// finas con el extremo redondeado, el valor escrito al final de la barra, y
// tooltip al pasar el mouse o al llegar con Tab. Debajo, la tabla con los datos.
import { consultar } from "./api.js";
import { escapeHTML, formatearMoneda, formatearFecha, fechaLocalISO } from "./utils.js";
import { alMostrar } from "./navegacion.js";

const el = (id) => document.getElementById(id);
let generadoUnaVez = false;

function ponerRango(tipo) {
  const hoy = new Date();
  let desde = new Date(hoy);
  if (tipo === "7") desde.setDate(hoy.getDate() - 6);
  if (tipo === "mes") desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  el("reporte-desde").value = fechaLocalISO(desde);
  el("reporte-hasta").value = fechaLocalISO(hoy);
}

const compacto = (n) => n >= 1e6 ? `$${(n / 1e6).toFixed(1).replace(".", ",")} M`
  : n >= 1e4 ? `$${Math.round(n / 1e3)} mil` : formatearMoneda(n);

const kpi = (titulo, valor, principal = false) =>
  `<div class="kpi ${principal ? "principal" : ""}"><span>${titulo}</span><strong>${valor}</strong></div>`;

// Barras horizontales de una sola serie
function barras(filas, { valor, texto, etiqueta, detalle = () => "" }) {
  if (!filas.length) return '<p class="historial-vacio">No hay datos en este rango.</p>';
  const max = Math.max(...filas.map(valor), 1);
  return `<div class="barras" role="list">${filas.map((f) => {
    const v = valor(f);
    const ancho = v > 0 ? Math.max(1.5, (v / max) * 100) : 0;
    return `
      <div class="barra-fila" role="listitem" tabindex="0" data-tip="${escapeHTML(etiqueta(f))}: ${escapeHTML(texto(f))}${detalle(f) ? " · " + escapeHTML(detalle(f)) : ""}">
        <span class="nombre">${escapeHTML(etiqueta(f))}</span>
        <span class="barra-pista"><span class="barra" style="display:block; width:${ancho}%"></span></span>
        <span class="valor">${escapeHTML(texto(f))}</span>
      </div>`;
  }).join("")}</div>`;
}

// Columnas por día (serie de tiempo)
function columnasPorDia(dias) {
  if (dias.length < 2) return "";
  const max = Math.max(...dias.map((d) => d.total), 1);
  const fmtDia = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short" });
  return `
    <h4 class="etiqueta" style="margin: 20px 0 4px">Ventas por día</h4>
    <div class="columnas" role="list" aria-label="Total vendido por día">
      ${dias.map((d) => `
        <div class="columna" role="listitem" tabindex="0" data-tip="${fmtDia(d.dia)}: ${formatearMoneda(d.total)} · ${d.numero} venta${d.numero === 1 ? "" : "s"}">
          <span class="barra-v" style="height:${Math.max(1.5, (d.total / max) * 100)}%"></span>
        </div>`).join("")}
    </div>
    <div class="columnas-ejes"><span>${fmtDia(dias[0].dia)}</span><span>${fmtDia(dias[dias.length - 1].dia)}</span></div>`;
}

function tablaDatos(encabezados, filas) {
  if (!filas.length) return "";
  return `
    <details class="tabla-datos">
      <summary>Ver datos en tabla</summary>
      <div class="tabla-scroll">
        <table class="tabla-detalle">
          <thead><tr>${encabezados.map((h, i) => `<th class="${i ? "num" : ""}">${h}</th>`).join("")}</tr></thead>
          <tbody>${filas.map((f) => `<tr>${f.map((c, i) => `<td class="${i ? "num" : ""}">${c}</td>`).join("")}</tr>`).join("")}</tbody>
        </table>
      </div>
    </details>`;
}

function tarjetaVentas(r) {
  return `
    <article class="reporte-tarjeta reporte-ancho">
      <h3>Ventas</h3>
      <p class="sub">Ventas cobradas en el rango. Lo neto descuenta los reembolsos.</p>
      <div class="kpis">
        ${kpi("Vendido neto", formatearMoneda(r.totalNeto), true)}
        ${kpi("Total cobrado", formatearMoneda(r.totalVendido))}
        ${kpi("Número de ventas", r.numeroVentas)}
        ${kpi("Reembolsado", formatearMoneda(r.totalReembolsado))}
        ${kpi("Descuentos dados", formatearMoneda(r.totalDescuentos))}
      </div>
      <h4 class="etiqueta" style="margin-bottom: 10px">Por método de pago</h4>
      ${barras(r.porMetodo, {
        valor: (m) => m.total, texto: (m) => formatearMoneda(m.total), etiqueta: (m) => m.metodoPago,
        detalle: (m) => `${m.numero} venta${m.numero === 1 ? "" : "s"}`
      })}
      ${columnasPorDia(r.porDia)}
      ${tablaDatos(["Día", "Ventas", "Total"], r.porDia.map((d) => [d.dia, d.numero, formatearMoneda(d.total)]))}
    </article>`;
}

function tarjetaMasVendidos(r) {
  return `
    <article class="reporte-tarjeta">
      <h3>Productos más vendidos</h3>
      <p class="sub">Unidades vendidas menos las reembolsadas.</p>
      ${barras(r.productos, {
        valor: (p) => p.cantidadNeta, texto: (p) => `${p.cantidadNeta} u.`, etiqueta: (p) => p.nombre,
        detalle: (p) => `${formatearMoneda(p.totalVendido)}${p.cantidadReembolsada ? `, ${p.cantidadReembolsada} reembolsadas` : ""}`
      })}
      ${tablaDatos(["Producto", "Unidades", "Reembolsadas", "Total vendido"],
        r.productos.map((p) => [escapeHTML(p.nombre), p.cantidadNeta, p.cantidadReembolsada, formatearMoneda(p.totalVendido)]))}
    </article>`;
}

function tarjetaCompras(r) {
  return `
    <article class="reporte-tarjeta">
      <h3>Compras</h3>
      <p class="sub">Mercancía registrada en el rango, por proveedor.</p>
      <div class="kpis">
        ${kpi("Total comprado", compacto(r.totalComprado))}
        ${kpi("Número de compras", r.numeroCompras)}
      </div>
      ${barras(r.porProveedor, {
        valor: (p) => p.total, texto: (p) => formatearMoneda(p.total), etiqueta: (p) => p.proveedor,
        detalle: (p) => `${p.numero} compra${p.numero === 1 ? "" : "s"}`
      })}
    </article>`;
}

function tarjetaFaltantes(r) {
  return `
    <article class="reporte-tarjeta">
      <h3>Faltantes más pedidos</h3>
      <p class="sub">Veces que un cliente pidió algo que no había.</p>
      ${barras(r.faltantes, {
        valor: (f) => f.solicitudes, texto: (f) => `${f.solicitudes} ${f.solicitudes === 1 ? "vez" : "veces"}`,
        etiqueta: (f) => f.nombre,
        detalle: (f) => `${f.cantidadSolicitada} unidades, ${f.pendientes ? `${f.pendientes} pendiente${f.pendientes === 1 ? "" : "s"}` : "resuelto"}`
      })}
      ${tablaDatos(["Producto", "Veces", "Unidades", "Última vez"],
        r.faltantes.map((f) => [escapeHTML(f.nombre), f.solicitudes, f.cantidadSolicitada, formatearFecha(f.ultimaFecha)]))}
    </article>`;
}

async function generar() {
  const desde = el("reporte-desde").value;
  const hasta = el("reporte-hasta").value;
  const cont = el("reportes-contenido");
  if (!desde || !hasta) {
    cont.innerHTML = '<p class="historial-vacio">Elige las dos fechas del rango.</p>';
    return;
  }
  if (hasta < desde) {
    cont.innerHTML = '<div class="estado-error"><p>La fecha "Hasta" es anterior a "Desde". Cámbiala para ver el reporte.</p></div>';
    return;
  }
  cont.innerHTML = '<div class="esqueleto reporte-ancho"></div><div class="esqueleto"></div><div class="esqueleto"></div>';
  const rango = { desde, hasta };
  try {
    const [ventas, top, compras, faltantes] = await Promise.all([
      consultar("/reportes/ventas/", rango),
      consultar("/reportes/productos-mas-vendidos/", rango),
      consultar("/reportes/compras/", rango),
      consultar("/reportes/faltantes/", rango)
    ]);
    cont.innerHTML = tarjetaVentas(ventas) + tarjetaMasVendidos(top) + tarjetaCompras(compras) + tarjetaFaltantes(faltantes);
  } catch (e) {
    cont.innerHTML = `<div class="estado-error"><p>${escapeHTML(e.message)}</p></div>`;
  }
}

export function iniciarReportes() {
  ponerRango("mes");
  el("btn-generar-reportes").addEventListener("click", generar);
  document.querySelector(".atajos-fecha").addEventListener("click", (e) => {
    const b = e.target.closest("[data-rango]");
    if (!b) return;
    ponerRango(b.dataset.rango);
    generar();
  });
  alMostrar("reportes", () => {
    if (!generadoUnaVez) { generadoUnaVez = true; generar(); }
  });
}
