"""
CONTROLADORES
=============
Cada archivo agrupa los endpoints de un módulo. Un controlador:
  1. revisa permisos (clases de permisos.py),
  2. valida la entrada con un serializador,
  3. llama al servicio (services/) que aplica las reglas de negocio,
  4. responde JSON.
Las rutas que los conectan con las URLs están en pos/urls.py.
"""
