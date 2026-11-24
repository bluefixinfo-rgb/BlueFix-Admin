// Schickt dem Kunden automatisch eine E-Mail, sobald das Admin-Panel den Status
// auf "In Reparatur" oder "Fertig" setzt. Jede Mail geht pro Auftrag nur einmal raus.
const S = require("./_shared.js");

const COL = "bluefix_status";
const REVIEW_DELAY_MS = 3 * 24 * 3600 * 1000; // Bewertungs-Mail 3 Tage nach "Fertig"

function mailFor(status, d, token) {
  const link = `${S.STATUS_BASE}?t=${token}`;
  const name = [d.vorname, d.nachname].filter(Boolean).join(" ");
  const anrede = name ? `Sehr geehrte/r ${name},` : "Sehr geehrte Damen und Herren,";
  const geraet = d.modell ? `Ihr ${d.modell}` : "Ihr Gerät";
  const rueck = "Für Rückfragen stehen wir Ihnen jederzeit gerne zur Verfügung.";

  if (status === "reparatur") {
    return {
      subject: "BlueFix - Ihr Gerät ist in Reparatur",
      text:
        `${anrede}\n\n${geraet} befindet sich jetzt bei uns in Reparatur. ` +
        `Sobald es fertig ist, melden wir uns bei Ihnen.\n\n` +
        `Den aktuellen Stand sehen Sie jederzeit hier:\n${link}\n\n${rueck}` + S.MAIL_FOOTER
    };
  }
  return {
    subject: "BlueFix - Ihr Gerät ist fertig",
    text:
      `${anrede}\n\n${geraet} ist fertig und kann bei BlueFix abgeholt werden. ` +
      `Auf Wunsch schicken wir es Ihnen auch per Post.\n\n` +
      `Hier können Sie Abholung oder Versand auswählen und den Stand ansehen:\n${link}\n\n${rueck}` + S.MAIL_FOOTER
  };
}

function plain(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) out[k] = S.fieldValue(v);
  return out;
}

module.exports = async (req, res) => {
  S.cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method === "GET") return res.status(200).json({ ok: true, function: "status-notify", hasMailKey: Boolean(process.env.GMAIL_APP_PASSWORD) });
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });

  try {
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
    const token = String((body && body.token) || "");
    const status = String((body && body.status) || "");

    if (!/^[0-9a-f]{32}$/.test(token)) return res.status(400).json({ ok: false, error: "Ungültiger Token" });
    if (status !== "reparatur" && status !== "fertig") return res.status(400).json({ ok: false, error: "Ungültiger Status" });

    const flag = status === "reparatur" ? "notifiedReparatur" : "notifiedFertig";
    const path = `${COL}/${S.encodePath(token)}`;

    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await S.fsFetch(path);
      if (r.status === 404) return res.status(200).json({ ok: true, sent: false, skipped: "Status-Dokument fehlt" });
      if (!r.ok) throw new Error("Firestore " + r.status);
      const doc = await r.json();
      const d = plain(doc.fields);

      if (d.status !== status) return res.status(200).json({ ok: true, sent: false, skipped: "Status noch nicht veröffentlicht" });
      if (d[flag]) return res.status(200).json({ ok: true, sent: false, skipped: "bereits gesendet" });
      if (!S.checkEmail(d.email)) return res.status(200).json({ ok: true, sent: false, skipped: "keine E-Mail" });

      // Zuerst "reservieren" (verhindert doppelte Mails bei gleichzeitigen Aufrufen), dann senden.
      const now = Date.now();
      const mask = [flag];
      const fields = { [flag]: { integerValue: String(now) } };
      if (status === "fertig" && !d.reviewSent) {
        mask.push("reviewDue");
        fields.reviewDue = { integerValue: String(now + REVIEW_DELAY_MS) };
      }
      const qs = mask.map((m) => "updateMask.fieldPaths=" + m).join("&") +
        "&currentDocument.updateTime=" + encodeURIComponent(doc.updateTime);
      const claim = await S.fsFetch(`${path}?${qs}`, { method: "PATCH", body: JSON.stringify({ fields }) });
      if (!claim.ok) {
        if ([400, 409, 412].includes(claim.status)) continue; // Dokument wurde gerade geändert: neu lesen
        throw new Error("Reservieren " + claim.status);
      }

      try {
        const mail = mailFor(status, d, token);
        await S.sendMail(String(d.email).trim(), mail.subject, mail.text);
      } catch (error) {
        await S.fsFetch(`${path}?updateMask.fieldPaths=${flag}`, {
          method: "PATCH",
          body: JSON.stringify({ fields: { [flag]: { nullValue: null } } })
        }).catch(() => {});
        console.error("status-notify Mail:", error.message);
        return res.status(502).json({ ok: false, error: "Mail konnte nicht gesendet werden: " + String(error.message).slice(0, 160) });
      }
      return res.status(200).json({ ok: true, sent: true });
    }
    return res.status(200).json({ ok: true, sent: false, skipped: "bereits gesendet" });
  } catch (error) {
    console.error("status-notify:", error.message);
    return res.status(500).json({ ok: false, error: String(error.message || error).slice(0, 300) });
  }
};

module.exports.config = { maxDuration: 30 };
