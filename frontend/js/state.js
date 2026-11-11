// js/state.js
// Datos en memoria. Se llenan con lo que responde el backend (nunca hardcodeados).
export const estado = {
  productos: [],
  categorias: [],
  clientes: [],
  proveedores: [],
  descuentos: [],
  venta: []        // líneas de la venta en curso: { productoId, nombre, precio, cantidad }
};
