// js/state.js
// Datos en memoria. Se llenan con lo que llega del servicio (nunca hardcodeados).
export const estado = {
  productos: [],
  categorias: [],
  clientes: [],
  venta: []        // líneas de la venta en curso: { productoId, nombre, precio, costo, cantidad }
};
