// Schickt Rechnung oder Garantieschein als PDF-Anhang direkt per E-Mail (über das BlueFix-Gmail-Konto).
// Die Mail geht NUR an die E-Mail-Adresse, die im Status-Dokument (bluefix_status/<token>) gespeichert ist.
// Ohne gültigen, geheimen Token kann also niemand beliebige Mails über dieses Konto verschicken.
const S = require("./_shared.js");
const tls = require("tls");

// Kleiner SMTP-Client ohne Zusatzpaket (nodemailer wird nicht gebraucht): Gmail über SSL, Port 465.
function b64lines(buf) { return buf.toString("base64").replace(/(.{76})/g, "$1\r\n"); }
function encWord(str) { return /^[\x20-\x7e]*$/.test(str) ? str : "=?UTF-8?B?" + Buffer.from(str, "utf8").toString("base64") + "?="; }

// ---- Text -> schön formatierte HTML-Mail (Klartext bleibt als Alternative erhalten) ----
function escH(t) { return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function linkH(t) { return escH(t).replace(/(https?:\/\/[^\s<]+)/g, (u) => '<a href="' + u + '" style="color:#1e6fef;text-decoration:underline">' + u + "</a>"); }
function textToHtml(text) {
  const P = "margin:0 0 14px;font-size:15px;line-height:1.6;color:#1b2433;";
  const RULE = /^[─—-]{6,}$/;
  const lines = String(text).replace(/\r/g, "").split("\n");
  const out = [];
  let i = 0;
  const para = (arr) => '<p style="' + P + '">' + arr.map(linkH).join("<br>") + "</p>";
  const row = (label, value, o) => {
    o = o || {};
    const col = o.green ? "#168a4e" : o.muted ? "#5c697d" : "#1b2433";
    const w = o.total ? "700" : o.muted ? "400" : "500";
    const bg = o.total ? "background:#eef4ff;" : "";
    const sz = o.total ? "17px" : "14.5px";
    return '<tr><td style="padding:9px 12px;' + bg + 'border-bottom:1px solid #e3e9f3;font-size:' + sz + ";font-weight:" + w + ";color:" + col + '">' + linkH(label) + '</td><td align="right" style="padding:9px 12px;' + bg + "border-bottom:1px solid #e3e9f3;font-size:" + sz + ";font-weight:" + (o.total ? "700" : "600") + ";color:" + col + ';white-space:nowrap">' + linkH(value) + "</td></tr>";
  };
  while (i < lines.length) {
    const ln = lines[i];
    if (!ln.trim()) { i++; continue; }
    // Abschnitt: GROSSBUCHSTABEN-Zeile + Trennlinie
    if (/^[A-ZÄÖÜ][A-ZÄÖÜ \-]{2,30}$/.test(ln.trim()) && RULE.test((lines[i + 1] || "").trim())) {
      const title = ln.trim();
      i += 2;
      const rows = [], notes = [];
      while (i < lines.length) {
        const l = lines[i];
        if (!l.trim()) { if (rows.length || notes.length) { /* Leerzeile beendet Abschnitt */ i++; break; } i++; continue; }
        if (/^[A-ZÄÖÜ][A-ZÄÖÜ \-]{2,30}$/.test(l.trim()) && RULE.test((lines[i + 1] || "").trim())) break;
        i++;
        if (RULE.test(l.trim())) continue;
        const bullet = /^•\s*/.test(l);
        const t = l.replace(/^•\s*/, "");
        const k = t.lastIndexOf(": ");
        const kf = t.indexOf(": ");
        if (/^TOTAL:/i.test(t)) {
          const m = t.match(/^TOTAL:\s*(CHF [\d'.,]+)\s*(.*)$/i);
          if (m) { rows.push(row("Total", m[1], { total: true })); if (m[2]) notes.push('<tr><td colspan="2" style="padding:6px 12px 0;font-size:12.5px;color:#5c697d">' + escH(m[2].replace(/^\(|\)$/g, "")) + "</td></tr>"); continue; }
        }
        const pl = t.match(/^Jetzt bezahlen[^:]*:\s*(https?:\/\/\S+)/);
        if (pl) { notes.push('<tr><td colspan="2" align="center" style="padding:14px 12px 6px"><a href="' + escH(pl[1]) + '" style="display:inline-block;background:#1e6fef;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 28px;border-radius:999px">Jetzt bezahlen</a><div style="font-size:11.5px;color:#7a869a;margin-top:8px;word-break:break-all">' + linkH(pl[1]) + "</div></td></tr>"); continue; }
        if (/^(Du sparst|Sie sparen)/.test(t)) { notes.push('<tr><td colspan="2" style="padding:8px 12px 0;font-size:13.5px;color:#168a4e;font-weight:600">' + escH(t) + "</td></tr>"); continue; }
        if (bullet && k > 0) { const v = t.slice(k + 2); rows.push(row(t.slice(0, k), v, { green: /^[–-]\s/.test(v) })); continue; }
        if (/^Zwischensumme:/.test(t) && kf > 0) { rows.push(row("Zwischensumme", t.slice(kf + 2), { muted: true })); continue; }
        if (kf > 0 && kf <= 32 && !bullet) { const v = t.slice(kf + 2); rows.push(row(t.slice(0, kf), v, { green: /^[–-]\s/.test(v) })); continue; }
        notes.push('<tr><td colspan="2" style="padding:8px 12px 0;font-size:14.5px;line-height:1.55;color:#1b2433">' + linkH(t) + "</td></tr>");
      }
      out.push('<div style="margin:6px 0 16px"><div style="font-size:11.5px;letter-spacing:.09em;font-weight:700;color:#1e6fef;margin:0 0 6px">' + escH(title) + '</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e3e9f3;border-radius:10px;background:#f7f9fd">' + rows.join("") + notes.join("") + "</table></div>");
      continue;
    }
    // normaler Absatz
    const blk = [];
    while (i < lines.length && lines[i].trim() && !(/^[A-ZÄÖÜ][A-ZÄÖÜ \-]{2,30}$/.test(lines[i].trim()) && RULE.test((lines[i + 1] || "").trim()))) { if (!RULE.test(lines[i].trim())) blk.push(lines[i]); i++; }
    if (blk.length) out.push(para(blk));
  }
  return '<!doctype html><html><body style="margin:0;padding:0;background:#eef1f6"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f6"><tr><td align="center" style="padding:24px 12px">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;font-family:-apple-system,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif">' +
    '<tr><td style="background:#061021;padding:22px 28px;border-bottom:3px solid #1e6fef"><span style="font-size:24px;font-weight:800;color:#ffffff;letter-spacing:.3px">Blue<span style="color:#4a9cff">Fix</span></span><br><span style="font-size:11px;letter-spacing:.16em;color:#9fb3d1">HANDY REPARATUR</span></td></tr>' +
    '<tr><td style="padding:26px 28px 8px">' + out.join("") + "</td></tr>" +
    '<tr><td style="background:#f7f9fd;padding:14px 28px;font-size:12px;color:#7a869a;text-align:center;border-top:1px solid #e3e9f3">BlueFix Handy Reparatur · Weierbuckstrasse 1 · 8213 Neunkirch</td></tr>' +
    "</table></td></tr></table></body></html>";
}

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
  const alt = "bf_alt" + Math.random().toString(36).slice(2, 10);
  const body =
    "--" + boundary + "\r\n" +
    "Content-Type: multipart/alternative; boundary=\"" + alt + "\"\r\n\r\n" +
    "--" + alt + "\r\n" +
    "Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" +
    b64lines(Buffer.from(text.replace(/\r?\n/g, "\r\n"), "utf8")) + "\r\n" +
    "--" + alt + "\r\n" +
    "Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" +
    b64lines(Buffer.from(textToHtml(text), "utf8")) + "\r\n" +
    "--" + alt + "--\r\n" +
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

module.exports.textToHtml = textToHtml;
module.exports.config = { maxDuration: 30 };
