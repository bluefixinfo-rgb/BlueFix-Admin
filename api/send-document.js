// Schickt Rechnung oder Garantieschein als PDF-Anhang direkt per E-Mail (über das BlueFix-Gmail-Konto).
// Die Mail geht NUR an die E-Mail-Adresse, die im Status-Dokument (bluefix_status/<token>) gespeichert ist.
// Ohne gültigen, geheimen Token kann also niemand beliebige Mails über dieses Konto verschicken.
const S = require("./_shared.js");
const tls = require("tls");

// Kleiner SMTP-Client ohne Zusatzpaket (nodemailer wird nicht gebraucht): Gmail über SSL, Port 465.
function b64lines(buf) { return buf.toString("base64").replace(/(.{76})/g, "$1\r\n"); }
function encWord(str) { return /^[\x20-\x7e]*$/.test(str) ? str : "=?UTF-8?B?" + Buffer.from(str, "utf8").toString("base64") + "?="; }

function buildMime({ from, to, subject, text, filename, pdf }) {
  const boundary = "bf_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const head = [
    "From: " + from,
    "To: " + to,
    "Subject: " + encWord(subject),
    "Date: " + new Date().toUTCString(),
    "Message-ID: <" + boundary + "@bluefix.local>",
    "MIME-Version: 1.0",
    "Content-Type: multipart/mixed; boundary=\"" + boundary + "\""
  ].join("\r\n");
  const body =
    "--" + boundary + "\r\n" +
    "Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" +
    b64lines(Buffer.from(text.replace(/\r?\n/g, "\r\n"), "utf8")) + "\r\n" +
    "--" + boundary + "\r\n" +
    "Content-Type: application/pdf; name=\"" + encWord(filename) + "\"\r\n" +
    "Content-Transfer-Encoding: base64\r\n" +
    "Content-Disposition: attachment; filename=\"" + encWord(filename) + "\"\r\n\r\n" +
    b64lines(pdf) + "\r\n" +
    "--" + boundary + "--\r\n";
  return head + "\r\n\r\n" + body;
}

function smtpSend({ user, pass, to, message }) {
  return new Promise((resolve, reject) => {
    const host = process.env.SMTP_HOST || "smtp.gmail.com";
    const port = Number(process.env.SMTP_PORT) || 465;
    const sock = tls.connect({ host, port, servername: host });
    let buf = "", step = 0, done = false;
    const finish = (err) => { if (done) return; done = true; clearTimeout(timer); try { sock.destroy(); } catch (e) {} err ? reject(err) : resolve(); };
    const timer = setTimeout(() => finish(new Error("SMTP Zeitüberschreitung")), 20000);
    const send = (line) => sock.write(line + "\r\n");
    const steps = [
      { expect: 220, cmd: () => send("EHLO bluefix.local") },
      { expect: 250, cmd: () => send("AUTH LOGIN") },
      { expect: 334, cmd: () => send(Buffer.from(user).toString("base64")) },
      { expect: 334, cmd: () => send(Buffer.from(pass).toString("base64")) },
      { expect: 235, cmd: () => send("MAIL FROM:<" + user + ">") },
      { expect: 250, cmd: () => send("RCPT TO:<" + to + ">") },
      { expect: 250, cmd: () => send("DATA") },
      { expect: 354, cmd: () => sock.write(message.replace(/^\./gm, "..") + "\r\n.\r\n") },
      { expect: 250, cmd: () => send("QUIT") }
    ];
    sock.on("error", (e) => finish(e));
    sock.on("close", () => finish(step >= steps.length ? null : new Error("SMTP Verbindung geschlossen")));
    sock.on("data", (d) => {
      buf += d.toString("utf8");
      let i;
      while ((i = buf.indexOf("\r\n")) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (/^\d{3}-/.test(line)) continue; // mehrzeilige Antwort: auf letzte Zeile warten
        const code = Number(line.slice(0, 3));
        if (step >= steps.length) { if (code === 221) finish(null); continue; }
        if (code !== steps[step].expect) return finish(new Error("SMTP " + line.slice(0, 140)));
        const cur = steps[step++]; cur.cmd();
      }
    });
  });
}


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
      const user = process.env.GMAIL_USER || "BlueFix.info@gmail.com";
      const pass = String(process.env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, "");
      if (!pass) throw new Error("GMAIL_APP_PASSWORD fehlt");
      const fullText = text + (S.MAIL_FOOTER && !text.includes(String(S.MAIL_FOOTER).trim()) ? S.MAIL_FOOTER : "");
      const message = buildMime({ from: "BlueFix <" + user + ">", to, subject, text: fullText, filename, pdf });
      await smtpSend({ user, pass, to, message });
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
