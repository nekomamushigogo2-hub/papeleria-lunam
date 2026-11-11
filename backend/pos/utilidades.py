"""Funciones pequeñas sin dependencia de la base de datos."""
import unicodedata
from datetime import date


def normalizar_nombre(texto):
    """Agrupa nombres de faltantes: minúsculas, sin tildes y plural simple.

    "Cofias" -> "cofia" · "Lápices" -> "lapiz" · "Marcadores" -> "marcador"
    """
    texto = unicodedata.normalize("NFD", str(texto or "").lower())
    texto = "".join(c for c in texto if unicodedata.category(c) != "Mn")  # quita tildes
    palabras = []
    for p in texto.split():
        if len(p) > 4 and p.endswith("ces"):
            p = p[:-3] + "z"                      # lápices -> lapiz
        elif len(p) > 4 and p.endswith("es") and p[-3] not in "aeiou":
            p = p[:-2]                            # marcadores -> marcador
        elif len(p) > 3 and p.endswith("s"):
            p = p[:-1]                            # cofias -> cofia
        palabras.append(p)
    return " ".join(palabras)


def leer_fecha(texto, nombre):
    """'2026-11-10' -> date. Lanza ValueError con un mensaje claro."""
    try:
        return date.fromisoformat(texto)
    except (TypeError, ValueError):
        raise ValueError(f"La fecha '{nombre}' debe tener el formato AAAA-MM-DD.")
