// Netlify Function: lecturas del día (feed de evangelizo.org) + reflexión generada con IA.
// Variables: GEMINI_API_KEY (Google AI Studio); sin ella no hay reflexión.
const { generar, hayIA } = require('../lib/ia');
const FEED = 'https://feed.evangelizo.org/v2/reader.php';
const PIEZAS = [['FR', 'Primera lectura'], ['PS', 'Salmo'], ['SR', 'Segunda lectura'], ['GSP', 'Evangelio']];

const limpiar = s => s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim();

async function pedir(fecha, type, content) {
  try {
    const url = `${FEED}?date=${fecha}&type=${type}&lang=SP${content ? '&content=' + content : ''}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
    return r.ok ? limpiar(await r.text()) : '';
  } catch (e) { return ''; }
}

async function reflexion(evangelio, ms) {
  if (!hayIA() || !evangelio) return '';
  return generar({
    system: 'Escribe una reflexión breve (150 a 200 palabras), en español, para un laico católico, basada ÚNICAMENTE en el pasaje del Evangelio que recibes. ' +
      'No cites santos, papas ni documentos, no atribuyas frases a nadie y no inventes hechos. Termina con una pregunta de examen personal. Texto plano, sin títulos ni listas.',
    user: evangelio, maxTokens: 600, ms
  });
}

exports.handler = async (event) => {
  const q = (event.queryStringParameters || {}).d;
  const fecha = /^\d{8}$/.test(q || '') ? q : new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '');
  const [textos, citas, santo] = await Promise.all([
    Promise.all(PIEZAS.map(p => pedir(fecha, 'reading', p[0]))),
    Promise.all(PIEZAS.map(p => pedir(fecha, 'reading_lt', p[0]))),
    pedir(fecha, 'saint')
  ]);
  const lecturas = PIEZAS.map((p, i) => ({ titulo: p[1], cita: citas[i], texto: textos[i] })).filter(l => l.texto.length > 20);
  if (!lecturas.length) return { statusCode: 502, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ error: 'Sin lecturas' }) };
  const ev = lecturas.find(l => l.titulo === 'Evangelio');
  const texto = await reflexion(ev ? ev.texto : '', 8000);
  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'Netlify-CDN-Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=86400' },
    body: JSON.stringify({ fecha, santo, lecturas, reflexion: texto, fuente: 'evangelizo.org' })
  };
};
