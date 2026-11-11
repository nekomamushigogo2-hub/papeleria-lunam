#!/usr/bin/env bash
# Script de construcción que ejecuta Render en cada despliegue.
# Si un paso falla, el despliegue se detiene (set -o errexit).
set -o errexit

pip install -r requirements.txt
python manage.py collectstatic --no-input   # estáticos del panel /admin
python manage.py migrate --no-input         # crea/actualiza las tablas en PostgreSQL
python manage.py inicializar_datos          # usuarios admin y cajero + datos de ejemplo (no duplica)
