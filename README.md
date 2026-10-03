# JARVIS: puesta en marcha

Estructura (no cambies las rutas):
- index.html
- netlify.toml
- netlify/functions/noticias.js
- netlify/functions/religioso.js
- netlify/lib/ia.js

Pasos:
1. Sube TODO el contenido de esta carpeta a tu repositorio de GitHub (raíz del repositorio) y conéctalo a Netlify.
2. Netlify > Environment variables: crea GEMINI_API_KEY con tu clave de aistudio.google.com. Luego, nuevo despliegue.
3. Comprueba que Netlify > Functions muestre noticias y religioso.
4. Abre tusitio.netlify.app/.netlify/functions/noticias y .../religioso: cada una debe mostrar un JSON.
5. Abre la app desde tusitio.netlify.app. En Rosario & Biblia, carga el ZIP USFM de la Biblia (ebible.org, id spablm), una vez por dispositivo.
6. Para probar Running o Tai Chi cualquier día, añade ?dia=1 (lunes) ... ?dia=6 (sábado) a la dirección.

Nunca pongas la clave en index.html ni en GitHub.
