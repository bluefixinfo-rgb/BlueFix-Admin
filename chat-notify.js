/*  BlueFix Live-Chat: sendet bei JEDER Besucher-Nachricht eine echte Push-Nachricht (OneSignal)
    an Jerome und Thierry – auch wenn das Admin-Panel komplett geschlossen ist.

    Einrichtung (einmalig):
      1. Diese Datei im Projektordner als  api/chat-notify.js  ablegen und auf Vercel deployen.
      2. Vercel -> Project -> Settings -> Environment Variables:
           ONESIGNAL_REST_API_KEY = (dein OneSignal REST API Key)
         danach einmal neu deployen.

    Der Browser schickt nur die Chat-ID. Name und Text der Nachricht liest die Funktion selbst
    aus Firestore, damit niemand beliebige Push-Texte an euch schicken kann. */

const PROJECT_ID = 'bluefix-2255';
const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID || '640d8e83-51d5-45df-9225-07fb6ff37912';
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

function val(f) {
  if (!f) return undefined;
  if ('stringValue' in f) return f.stringValue;
  if ('integerValue' in f) return Number(f.integerValue);
  if ('doubleValue' in f) return f.doubleValue;
  return undefined;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const apiKey = process.env.ONESIGNAL_REST_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ONESIGNAL_REST_API_KEY fehlt in Vercel' });

    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    const sid = String((body && body.sid) || '');
    if (!/^[a-f0-9]{16,40}$/.test(sid)) return res.status(400).json({ error: 'bad sid' });

    // Chat aus Firestore lesen (nur echte, frische Besucher-Nachrichten lösen einen Push aus)
    const sRes = await fetch(`${FS}/livechat_sessions/${sid}`);
    if (!sRes.ok) return res.status(404).json({ error: 'chat not found' });
    const f = (await sRes.json()).fields || {};
    const lastFrom = val(f.lastFrom);
    const lastAt = val(f.lastMessageAt) || 0;
    if (lastFrom !== 'visitor' || Date.now() - lastAt > 60000) return res.status(200).json({ skipped: true });

    const name = (val(f.name) || 'Besucher').slice(0, 40);
    const short = val(f.short) || '';
    const text = (val(f.lastText) || '').slice(0, 140);

    // Empfänger: gespeicherte OneSignal-IDs von Jerome und Thierry (wie im Admin-Panel)
    let ids = [];
    try {
      const pRes = await fetch(`${FS}/bluefix_push_ids`);
      if (pRes.ok) {
        const docs = (await pRes.json()).documents || [];
        ids = docs.map(d => val((d.fields || {}).pushId)).filter(Boolean);
      }
    } catch (e) {}

    const payload = {
      app_id: ONESIGNAL_APP_ID,
      headings: { en: `💬 Kunden-Chat: ${name}${short ? ' #' + short : ''}` },
      contents: { en: text || 'Neue Nachricht' },
      data: { type: 'livechat', sid }
    };
    if (ids.length) payload.include_subscription_ids = ids;
    else payload.included_segments = ['Total Subscriptions'];

    const oRes = await fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Key ' + apiKey },
      body: JSON.stringify(payload)
    });
    const out = await oRes.text();
    return res.status(oRes.ok ? 200 : 502).json({ ok: oRes.ok, onesignal: out.slice(0, 300) });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message || e) });
  }
};
