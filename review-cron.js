// Läuft täglich per Vercel-Cron: schickt die Google-Bewertungs-Mail an Kunden,
// deren Gerät vor ein paar Tagen fertig wurde (bei Post-Versand erst nach der Zustellung).
const S = require("./_shared.js");

const COL = "bluefix_status";
const AFTER_DELIVERY_MS = 24 * 3600 * 1000;

function reviewMail(d) {
  const name = [d.vorname, d.nachname].filter(Boolean).join(" ");
  const anrede = name ? `Sehr geehrte/r ${name},` : "Sehr geehrte Damen und Herren,";
  const geraet = d.modell ? `Ihr ${d.modell}` : "Ihr Gerät";
  return {
    subject: "BlueFix - Wie zufrieden sind Sie mit Ihrer Reparatur?",
    text:
      `${anrede}\n\n${geraet} wurde vor ein paar Tagen bei uns repariert. Wir hoffen, es funktioniert einwandfrei.\n\n` +
      `Über eine kurze Bewertung auf Google würden wir uns sehr freuen. Sie hilft uns weiter und unterstützt auch andere Kunden bei ihrer Entscheidung.\n\n` +
      `⭐ Jetzt bewerten:\n${S.REVIEW_URL}\n\n` +
      `Falls etwas nicht in Ordnung ist, melden Sie sich bitte direkt bei uns (076 229 91 82). Wir kümmern uns darum.` + S.MAIL_FOOTER
  };
}

module.exports = async (req, res) => {
  S.cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== "Bearer " + secret) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  const result = { ok: true, checked: 0, sent: 0, skipped: 0, failed: 0 };
  try {
    const token = await S.getAccessToken();
    const q = await fetch(`${S.FS}/${S.DB}:runQuery`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: COL }],
          where: { fieldFilter: { field: { fieldPath: "reviewDue" }, op: "LESS_THAN_OR_EQUAL", value: { integerValue: String(Date.now()) } } },
          limit: 50
        }
      }),
      signal: AbortSignal.timeout(10000)
    });
    if (!q.ok) throw new Error("Abfrage " + q.status + ": " + (await q.text().catch(() => "")).slice(0, 200));
    const rows = (await q.json()).map((r) => r.document).filter(Boolean);

    for (const doc of rows) {
      result.checked++;
      const d = {};
      for (const [k, v] of Object.entries(doc.fields || {})) d[k] = S.fieldValue(v);
      const id = doc.name.split("/").pop();

      const postPending = d.sendungsnr && (!d.zugestellt || Date.now() - d.zugestellt < AFTER_DELIVERY_MS);
      if (d.reviewSent || d.status !== "fertig" || !S.checkEmail(d.email) || postPending) { result.skipped++; continue; }

      const path = `${COL}/${S.encodePath(id)}`;
      const claim = await S.fsFetch(
        `${path}?updateMask.fieldPaths=reviewSent&currentDocument.updateTime=${encodeURIComponent(doc.updateTime)}`,
        { method: "PATCH", body: JSON.stringify({ fields: { reviewSent: { integerValue: String(Date.now()) } } }) }
      );
      if (!claim.ok) { result.skipped++; continue; }

      try {
        const mail = reviewMail(d);
        await S.sendMail(String(d.email).trim(), mail.subject, mail.text);
        result.sent++;
      } catch (error) {
        console.error("review-cron Mail:", error.message);
        result.failed++;
        await S.fsFetch(`${path}?updateMask.fieldPaths=reviewSent`, {
          method: "PATCH", body: JSON.stringify({ fields: { reviewSent: { nullValue: null } } })
        }).catch(() => {});
      }
    }
    return res.status(200).json(result);
  } catch (error) {
    console.error("review-cron:", error.message);
    return res.status(500).json({ ok: false, error: String(error.message || error).slice(0, 300) });
  }
};

module.exports.config = { maxDuration: 60 };
