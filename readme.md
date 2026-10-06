# Sistema POS — Papel y Luna (MVP 2)

Sistema de Punto de Venta (POS) para papelería y miscelánea desarrollado como parte de la asignatura Desarrollo de Aplicaciones Web. Esta versión (MVP 2) consume un servicio externo en Google Sheets a través de Google Apps Script.

---

## 👥 Integrantes del Equipo
* **Samuel Mathias Garzón García**
* **Duvan Camilo Ayala León**

---

## 🌐 Enlaces del Proyecto
* **Aplicación Desplegada (Vercel):** https://papeleria-lunam.vercel.app
* **Repositorio de GitHub:** https://github.com/nekomamushigogo2-hub/papeleria-lunam/tree/main/pagina%20pospael%20prueba

---

## 🚀 Características y Funcionalidades del MVP 2

* **Gestión de Ventas Completa:** Inicio de venta, carrito dinámico, cobro por métodos de pago (Efectivo, Nequi, Debe), cálculo de cambio e integración de cliente.
* **Ventas Abiertas:** Funcionalidad para guardar ventas en estado abierto y retomarlas de la lista para su posterior cobro o edición.
* **Módulo de Compras a Proveedores:** Registro de compras con incremento automático de stock en los productos con seguimiento activo y actualización del costo unitario.
* **Gestión de Entidades (CRUDs):** Administración completa de Categorías, Clientes y Proveedores, incluyendo validaciones de integridad referencial (no permite eliminar registros asociados a productos, ventas o compras).
* **Integración Backend:** Peticiones asíncronas (`fetch`, `async/await`) hacia Google Sheets como capa de almacenamiento utilizando Google Apps Script.
* **Interfaz Adaptativa y UX:** Diseño completamente responsive (apto para dispositivos móviles), indicadores de carga, alertas toast y soporte para modo claro / modo oscuro.

---

## 🛠️ Instrucciones para Ejecución Local

1. Clonar el repositorio de GitHub:
   ```bash
   git clone [https://github.com/nekomamushigogo2-hub/papeleria-lunam.git](https://github.com/nekomamushigogo2-hub/papeleria-lunam.git)