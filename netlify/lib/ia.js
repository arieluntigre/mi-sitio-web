// IA con Gemini (Google AI Studio). Variables de entorno en Netlify:
//   GEMINI_API_KEY  (obligatoria para resúmenes y reflexión; sin ella la app usa clasificación por palabras clave)
//   GEMINI_MODEL    (opcional; se prueba primero y luego los modelos de respaldo)
const hayIA = () => !!process.env.GEMINI_API_KEY;

// Si un modelo falla (nombre retirado, cuota agotada), se prueba el siguiente.
const modelos = () => [...new Set([process.env.GEMINI_MODEL, 'gemini-2.5-flash-lite', 'gemini-2.5-flash'].filter(Boolean))];

async function generar({ system, user, maxTokens = 800, ms = 8000, json = false }) {
  if (!hayIA()) return '';
  const limite = Date.now() + ms;
  for (const modelo of modelos()) {
    const resta = limite - Date.now(); if (resta < 1500) break;
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
        method: 'POST', signal: AbortSignal.timeout(resta),
        headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: { maxOutputTokens: maxTokens * 3, temperature: 0.3, ...(json ? { responseMimeType: 'application/json' } : {}) }
        })
      });
      if (!r.ok) { console.error('Gemini', modelo, r.status, (await r.text()).slice(0, 300)); continue; }
      const d = await r.json();
      const txt = (((d.candidates || [])[0] || {}).content?.parts || []).map(p => p.text || '').join('').trim();
      if (txt) return txt;
    } catch (e) { console.error('Gemini', modelo, e.message); }
  }
  return '';
}
module.exports = { generar, hayIA };
