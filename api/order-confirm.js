// Schickt die Auftragsbestätigung aus dem Admin-Panel direkt per E-Mail (über das BlueFix-Gmail-Konto).
// Die Mail geht nur an die E-Mail-Adresse, die im Status-Dokument des Auftrags gespeichert ist.
const S = require("./_shared.js");

const COL = "bluefix_status";
const COOLDOWN_MS = 20 * 1000;

module.exports = async (req, res) => {
  S.cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method === "GET") return res.status(200).json({ ok: true, function: "order-confirm", hasMailKey: Boolean(process.env.GMAIL_APP_PASSWORD), hasFirebaseKey: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT) });
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });

  try {
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
    const token = String((body && body.token) || "");
    const text = String((body && body.text) || "").trim();

    if (!/^[0-9a-f]{32}$/.test(token)) return res.status(400).json({ ok: false, error: "Ungültiger Token" });
    if (text.length < 20 || text.length > 5000) return res.status(400).json({ ok: false, error: "Nachricht fehlt oder ist zu lang" });

    const path = `${COL}/${S.encodePath(token)}`;
    const r = await S.fsFetch(path);
    if (r.status === 404) return res.status(200).json({ ok: true, sent: false, skipped: "Status-Dokument fehlt" });
    if (!r.ok) throw new Error("Firestore " + r.status);
    const d = {};
    const doc = await r.json();
    for (const [k, v] of Object.entries(doc.fields || {})) d[k] = S.fieldValue(v);

    if (!S.checkEmail(d.email)) return res.status(200).json({ ok: true, sent: false, skipped: "keine E-Mail" });
    if (d.confirmMailAt && Date.now() - Number(d.confirmMailAt) < COOLDOWN_MS) {
      return res.status(200).json({ ok: true, sent: false, skipped: "gerade erst gesendet" });
    }

    try {
      const parts = S.cleanOrderParts(body && body.parts);
      if (parts) await S.sendMailHtml(String(d.email).trim(), "Deine Auftragsbestätigung bei BlueFix", text, S.orderConfirmHtml(parts));
      else await S.sendMail(String(d.email).trim(), "Deine Auftragsbestätigung bei BlueFix", text);
    } catch (error) {
      console.error("order-confirm Mail:", error.message);
      return res.status(502).json({ ok: false, error: "Mail konnte nicht gesendet werden: " + String(error.message).slice(0, 160) });
    }

    await S.fsFetch(`${path}?updateMask.fieldPaths=confirmMailAt`, {
      method: "PATCH",
      body: JSON.stringify({ fields: { confirmMailAt: { integerValue: String(Date.now()) } } })
    }).catch(() => {});

    return res.status(200).json({ ok: true, sent: true, to: String(d.email).trim() });
  } catch (error) {
    console.error("order-confirm:", error.message);
    return res.status(500).json({ ok: false, error: String(error.message || error).slice(0, 300) });
  }
};

module.exports.config = { maxDuration: 30 };
