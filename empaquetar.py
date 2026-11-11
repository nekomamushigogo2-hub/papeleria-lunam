"""
Arma el .zip de la entrega SIN dependencias ni archivos pesados:
    python empaquetar.py
Crea ../web-2026-2-mvp3-garzon-ayala.zip (junto a esta carpeta).
"""
import zipfile
from pathlib import Path

NOMBRE = "web-2026-2-mvp3-garzon-ayala.zip"
RAIZ = Path(__file__).resolve().parent
EXCLUIR_CARPETAS = {".venv", "venv", "node_modules", "dist", "build", ".git", "__pycache__", "staticfiles", ".claude", ".postman"}
EXCLUIR_ARCHIVOS = {"db.sqlite3", ".env"}

destino = RAIZ.parent / NOMBRE
total = 0
with zipfile.ZipFile(destino, "w", zipfile.ZIP_DEFLATED) as z:
    for ruta in sorted(RAIZ.rglob("*")):
        relativa = ruta.relative_to(RAIZ)
        if any(parte in EXCLUIR_CARPETAS for parte in relativa.parts):
            continue
        if ruta.is_dir() or ruta.name in EXCLUIR_ARCHIVOS or ruta.suffix in (".zip", ".pyc"):
            continue
        z.write(ruta, Path("papeleria-lunam") / relativa)
        total += 1

print(f"{destino} · {total} archivos · {destino.stat().st_size / 1024:.0f} KB")
