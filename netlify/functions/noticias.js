// Netlify Function: junta titulares (Google News RSS), los clasifica y devuelve JSON.
// Variables de entorno (Netlify > Site configuration > Environment variables):
//   GEMINI_API_KEY (Google AI Studio); sin ella, clasifica por palabras clave

const { generar, hayIA } = require('../lib/ia');

const MEDIOS = {
  'Los Tiempos': 'lostiempos.com', 'El Deber': 'eldeber.com.bo', 'La Razón': 'la-razon.com',
  'Opinión': 'opinion.com.bo', 'Erbol': 'erbol.com.bo', 'Brújula Digital': 'brujuladigital.net',
  'Red Uno': 'reduno.com.bo'
};

// max = cuántos titulares se piden por consulta; cap = tope que se envía a clasificar; show = tope sin IA
const GRUPOS = {
  titulares: { cap: 14, show: 6, consultas: Object.values(MEDIOS).map(d => ({ q: `site:${d} when:1d`, max: 2 })) },
  economia:  { cap: 8,  show: 4, consultas: [{ q: 'dólar paralelo Bolivia when:2d', max: 4 }, { q: 'subsidio combustible Bolivia when:2d', max: 4 }] },
  justicia:  { cap: 5,  show: 3, consultas: [{ q: 'cárceles penales Bolivia when:3d', max: 5 }] },
  deportes:  { cap: 5,  show: 3, consultas: [{ q: 'The Strongest when:2d', max: 5 }] }
};

const ROJO = /bloqueo|paro\b|crisis|violen|muert|asesin|detenid|aprehend|corrupci|renuncia|protesta|conflicto|escasez|revocatoria|mot[ií]n|fuga/i;
const AMARILLO = /d[eé]ficit|ajuste|tensi[oó]n|subsidio|inflaci|d[oó]lar|deuda|reservas|denuncia|investigaci|sobrepoblaci|alza|precio/i;

const decode = s => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').trim();

function parseRss(xml, max) {
  const out = []; const re = /<item>([\s\S]*?)<\/item>/g; let m;
  while ((m = re.exec(xml)) && out.length < max) {
    const get = t => { const x = m[1].match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)); return x ? decode(x[1]) : ''; };
    const fuente = get('source'); let titulo = get('title');
    if (fuente && titulo.endsWith(' - ' + fuente)) titulo = titulo.slice(0, -(fuente.length + 3));
    if (titulo) out.push({ titulo, fuente, link: get('link'), fecha: Date.parse(get('pubDate')) || 0 });
  }
  return out;
}

async function getJson(url, opts, ms) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), ms);
  try { const r = await fetch(url, { ...opts, signal: ctrl.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return r; }
  finally { clearTimeout(t); }
}

async function clasificarConIA(entrada, ms) {
  if (!hayIA()) return null;
  const system = 'Eres analista de coyuntura de Bolivia. Recibes titulares agrupados en un JSON. ' +
    'Devuelve SOLO JSON con la forma {"items":[{"id":"...","resumen":"...","semaforo":"rojo|amarillo|verde","actores":["..."]}]}. ' +
    'Reglas: máximo titulares 6, economia 4, justicia 3, deportes 3; descarta duplicados o irrelevantes. ' +
    'Basa el resumen (una o dos frases, neutral, en español) SOLO en el titular y la fuente; no inventes cifras, nombres ni hechos. ' +
    'Semáforo: rojo = conflicto alto, riesgo institucional o de seguridad; amarillo = tensión media; verde = sin riesgo. ' +
    'Actores: instituciones o personas que aparecen en el titular (puede ser []).';
  const txt = (await generar({ system, user: JSON.stringify(entrada), maxTokens: 2500, ms, json: true })).replace(/```json|```/g, '').trim();
  if (!txt) return null;
  const map = {}; for (const i of JSON.parse(txt).items || []) map[i.id] = i;
  return map;
}

const normSem = s => ['rojo', 'amarillo', 'verde'].includes(s) ? s : 'verde';

exports.handler = async () => {
  const t0 = Date.now(); const BUDGET = 9000; // Netlify corta a los ~10 s por defecto
  const items = {}; let total = 0;

  await Promise.all(Object.entries(GRUPOS).map(async ([g, cfg]) => {
    const listas = await Promise.all(cfg.consultas.map(async c => {
      try {
        const url = `https://news.google.com/rss/search?q=${encodeURIComponent(c.q)}&hl=es-419&gl=BO&ceid=BO:es-419`;
        const r = await getJson(url, { headers: { 'user-agent': 'Mozilla/5.0 JarvisNews' } }, 4000);
        return parseRss(await r.text(), c.max);
      } catch (e) { return []; }
    }));
    const vistos = new Set();
    items[g] = listas.flat().sort((a, b) => b.fecha - a.fecha).filter(i => {
      const k = i.titulo.toLowerCase().replace(/[^a-z0-9áéíóúñ]/g, '').slice(0, 60);
      if (vistos.has(k)) return false; vistos.add(k); return true;
    }).slice(0, cfg.cap).map((i, n) => ({ ...i, id: g[0] + n }));
    total += items[g].length;
  }));

  if (!total) return { statusCode: 502, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ error: 'No se pudo leer ninguna fuente' }) };

  let ia = null;
  const restante = BUDGET - (Date.now() - t0) - 500;
  if (restante > 2500) {
    try {
      const entrada = {}; for (const g in items) entrada[g] = items[g].map(i => ({ id: i.id, titulo: i.titulo, fuente: i.fuente }));
      ia = await clasificarConIA(entrada, restante);
    } catch (e) { ia = null; }
  }

  const grupos = {};
  for (const g in items) {
    const conIA = ia ? items[g].filter(i => ia[i.id]).map(i => ({
      titulo: i.titulo, resumen: ia[i.id].resumen || '', semaforo: normSem(ia[i.id].semaforo),
      actores: Array.isArray(ia[i.id].actores) ? ia[i.id].actores : [], fuente: i.fuente, link: i.link })) : [];
    grupos[g] = conIA.length ? conIA : items[g].slice(0, GRUPOS[g].show).map(i => ({
      titulo: i.titulo, resumen: '', semaforo: g === 'deportes' ? 'verde' : ROJO.test(i.titulo) ? 'rojo' : AMARILLO.test(i.titulo) ? 'amarillo' : 'verde',
      actores: [], fuente: i.fuente, link: i.link }));
  }

  return {
    statusCode: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'Netlify-CDN-Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400'
    },
    body: JSON.stringify({ actualizado: new Date().toISOString(), modo: ia ? 'ia' : 'palabras-clave', grupos })
  };
};
