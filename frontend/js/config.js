// js/config.js
// Dirección del backend. Es lo ÚNICO que cambia entre trabajar local y la versión desplegada.

// URL del backend desplegado en Render (cámbiala si tu servicio tiene otro nombre)
const API_PRODUCCION = "https://papeleria-lunam-api.onrender.com/api";

// Backend local: python manage.py runserver  ->  http://127.0.0.1:8000
const API_LOCAL = "http://127.0.0.1:8000/api";

const esLocal = ["localhost", "127.0.0.1", ""].includes(location.hostname) || location.protocol === "file:";

// Se puede forzar otra URL con ?api=https://... (queda guardada en el navegador)
const forzada = new URLSearchParams(location.search).get("api");
if (forzada) localStorage.setItem("api_url", forzada);

export const API_URL = localStorage.getItem("api_url") || (esLocal ? API_LOCAL : API_PRODUCCION);
