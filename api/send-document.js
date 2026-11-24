// Schickt Rechnung oder Garantieschein als PDF-Anhang direkt per E-Mail (über das BlueFix-Gmail-Konto).
// Die Mail geht NUR an die E-Mail-Adresse, die im Status-Dokument (bluefix_status/<token>) gespeichert ist.
// Ohne gültigen, geheimen Token kann also niemand beliebige Mails über dieses Konto verschicken.
const S = require("./_shared.js");

const COL = "bluefix_status";
const COOLDOWN_MS = 15 * 1000;
const MAX_PDF_BYTES = 3 * 1024 * 1024;
const KINDS = { rechnung: "docMailRechnungAt", garantie: "docMailGarantieAt" };

module.exports = async (req, res) => {
  S.cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method === "GET") return res.status(200).json({ ok: true, function: "send-document", hasMailKey: Boolean(process.env.GMAIL_APP_PASSWORD), hasFirebaseKey: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT) });
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });

  try {
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
    body = body || {};
    const token = String(body.token || "");
    const kind = String(body.kind || "");
    const subject = String(body.subject || "").replace(/[\r\n]+/g, " ").trim().slice(0, 200);
    const text = String(body.text || "").trim();
    let filename = String(body.filename || "").trim();
    const pdfB64 = String(body.pdf || "").replace(/\s+/g, "");

    if (!/^[0-9a-f]{32}$/.test(token)) return res.status(400).json({ ok: false, error: "Ungültiger Token" });
    if (!KINDS[kind]) return res.status(400).json({ ok: false, error: "Ungültige Art" });
    if (subject.length < 3) return res.status(400).json({ ok: false, error: "Betreff fehlt" });
    if (text.length < 20 || text.length > 8000) return res.status(400).json({ ok: false, error: "Nachricht fehlt oder ist zu lang" });
    if (!/^[\w .()\-]{1,80}\.pdf$/i.test(filename)) filename = kind === "rechnung" ? "Rechnung.pdf" : "Garantieschein.pdf";
    if (!pdfB64 || !/^[A-Za-z0-9+/=]+$/.test(pdfB64)) return res.status(400).json({ ok: false, error: "PDF fehlt" });
    const pdf = Buffer.from(pdfB64, "base64");
    if (pdf.length < 200 || pdf.length > MAX_PDF_BYTES) return res.status(400).json({ ok: false, error: "PDF ist leer oder zu gross (max. 3 MB)" });
    if (pdf.slice(0, 4).toString("latin1") !== "%PDF") return res.status(400).json({ ok: false, error: "Die Datei ist kein PDF" });

    const path = `${COL}/${S.encodePath(token)}`;
    const r = await S.fsFetch(path);
    if (r.status === 404) return res.status(200).json({ ok: true, sent: false, skipped: "Status-Dokument fehlt" });
    if (!r.ok) throw new Error("Firestore " + r.status);
    const d = {};
    const doc = await r.json();
    for (const [k, v] of Object.entries(doc.fields || {})) d[k] = S.fieldValue(v);

    if (!S.checkEmail(d.email)) return res.status(200).json({ ok: true, sent: false, skipped: "keine E-Mail" });
    const flag = KINDS[kind];
    if (d[flag] && Date.now() - Number(d[flag]) < COOLDOWN_MS) {
      return res.status(200).json({ ok: true, sent: false, skipped: "gerade erst gesendet" });
    }

    const to = String(d.email).trim();
    try {
      const nodemailer = require("nodemailer");
      const user = process.env.GMAIL_USER || "BlueFix.info@gmail.com";
      const transport = nodemailer.createTransport({ service: "gmail", auth: { user, pass: process.env.GMAIL_APP_PASSWORD } });
      await transport.sendMail({
        from: `BlueFix <${user}>`,
        to,
        subject,
        text: text + (S.MAIL_FOOTER && !text.includes(String(S.MAIL_FOOTER).trim()) ? S.MAIL_FOOTER : ""),
        attachments: [{ filename, content: pdf, contentType: "application/pdf" }]
      });
    } catch (error) {
      console.error("send-document Mail:", error.message);
      return res.status(502).json({ ok: false, error: "Mail konnte nicht gesendet werden: " + String(error.message).slice(0, 160) });
    }

    await S.fsFetch(`${path}?updateMask.fieldPaths=${flag}`, {
      method: "PATCH",
      body: JSON.stringify({ fields: { [flag]: { integerValue: String(Date.now()) } } })
    }).catch(() => {});

    return res.status(200).json({ ok: true, sent: true, to });
  } catch (error) {
    console.error("send-document:", error.message);
    return res.status(500).json({ ok: false, error: String(error.message || error).slice(0, 300) });
  }
};

module.exports.config = { maxDuration: 30 };
