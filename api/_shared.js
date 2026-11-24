const crypto = require("crypto");

const PROJECT_ID = "bluefix-2255";
const DB = `projects/${PROJECT_ID}/databases/(default)/documents`;
const FS = "https://firestore.googleapis.com/v1";
const GMAIL_USER = process.env.GMAIL_USER || "bluefix.info@gmail.com";

function encodePath(value) {
  return encodeURIComponent(value);
}

function fieldValue(f) {
  if (!f) return undefined;
  if (f.stringValue !== undefined) return f.stringValue;
  if (f.integerValue !== undefined) return Number(f.integerValue);
  if (f.doubleValue !== undefined) return f.doubleValue;
  if (f.booleanValue !== undefined) return f.booleanValue;
  if (f.timestampValue !== undefined) return Date.parse(f.timestampValue);
  if (f.nullValue !== undefined) return null;
  return undefined;
}


let tokenCache = { token: "", expires: 0 };

async function getAccessToken() {
  if (tokenCache.token && Date.now() < tokenCache.expires) {
    return tokenCache.token;
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT fehlt in Vercel");
  }

  let account;
  try {
    account = JSON.parse(raw);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT ist kein gültiges JSON");
  }

  const now = Math.floor(Date.now() / 1000);
  const b64 = (obj) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");

  const unsigned =
    b64({ alg: "RS256", typ: "JWT" }) +
    "." +
    b64({
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/datastore",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600
    });

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();

  const assertion =
    unsigned + "." +
    signer.sign(account.private_key).toString("base64url");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    }),
    signal: AbortSignal.timeout(10000)
  });

  const data = await response.json();

  if (!response.ok || !data.access_token) {
    throw new Error(
      "Firebase-Anmeldung fehlgeschlagen: " +
      response.status + " " +
      JSON.stringify(data).slice(0, 500)
    );
  }

  tokenCache = {
    token: data.access_token,
    expires:
      Date.now() +
      Math.max(60, (data.expires_in || 3600) - 120) * 1000
  };

  return tokenCache.token;
}

async function fsFetch(path, options = {}) {
  const token = await getAccessToken();

  return fetch(`${FS}/${DB}/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    signal: options.signal || AbortSignal.timeout(10000)
  });
}


// Minimaler SMTP-Client (Gmail, Port 465/TLS). Kein Zusatzpaket nötig.
function smtpSend({ user, pass, from, to, subject, text, html, connect }) {
  return new Promise((resolve, reject) => {
    const tls = require("tls");
    const socket = connect
      ? connect()
      : tls.connect({ host: "smtp.gmail.com", port: 465, servername: "smtp.gmail.com" });
    socket.setEncoding("utf8");

    let buf = "";
    let pending = null;
    let done = false;

    const fail = (err) => {
      if (done) return;
      done = true;
      try { socket.destroy(); } catch {}
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    socket.setTimeout(12000, () => fail(new Error("SMTP Timeout")));
    socket.on("error", fail);
    socket.on("close", () => fail(new Error("SMTP Verbindung geschlossen")));
    socket.on("data", (chunk) => {
      buf += chunk;
      const lines = buf.split("\r\n");
      const last = lines.length > 1 ? lines[lines.length - 2] : "";
      if (/^\d{3} /.test(last) && pending) {
        const code = Number(last.slice(0, 3));
        const full = buf;
        buf = "";
        const p = pending;
        pending = null;
        p(code, full);
      }
    });

    const expect = (okCodes) => new Promise((res, rej) => {
      pending = (code, full) =>
        okCodes.includes(code) ? res(full) : rej(new Error("SMTP " + full.trim().slice(0, 200)));
    });
    const cmd = (line, okCodes) => {
      const w = expect(okCodes);
      socket.write(line + "\r\n");
      return w;
    };

    const b64 = (v) => Buffer.from(String(v), "utf8").toString("base64");
    const wrap = (v) => b64(v).replace(/.{76}/g, "$&\r\n");
    const safe = (v) => String(v).replace(/[\r\n]+/g, " ").trim();
    const boundary = "bf-" + crypto.randomBytes(12).toString("hex");
    const fromName = from.name || "";
    const fromHeader = fromName
      ? `=?UTF-8?B?${b64(fromName)}?= <${from.address}>`
      : from.address;

    const message = [
      `From: ${fromHeader}`,
      `To: ${safe(to)}`,
      `Reply-To: ${from.address}`,
      `Subject: =?UTF-8?B?${b64(safe(subject))}?=`,
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: <${crypto.randomBytes(12).toString("hex")}@bluefix>`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      wrap(text),
      `--${boundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      wrap(html),
      `--${boundary}--`,
      ""
    ].join("\r\n");

    (async () => {
      await expect([220]);
      await cmd("EHLO bluefix.ch", [250]);
      await cmd("AUTH LOGIN", [334]);
      await cmd(b64(user), [334]);
      await cmd(b64(pass), [235]);
      await cmd(`MAIL FROM:<${from.address}>`, [250]);
      await cmd(`RCPT TO:<${safe(to)}>`, [250, 251]);
      await cmd("DATA", [354]);
      await cmd(message + "\r\n.", [250]);
      done = true;
      try { socket.write("QUIT\r\n"); socket.end(); } catch {}
      resolve(true);
    })().catch(fail);
  });
}


function checkEmail(raw) {
  const v = String(raw || "").trim().toLowerCase();
  return v.length <= 120 && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(v);
}

// Schickt eine reine Text-Mail (zusätzlich als einfaches HTML) über das BlueFix-Gmail-Konto.
async function sendMail(to, subject, text) {
  const pass = String(process.env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, "");
  if (!pass) throw new Error("GMAIL_APP_PASSWORD fehlt");
  const esc = (v) => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html =
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#1a1a1a;max-width:560px;white-space:pre-wrap">' +
    esc(text).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>') + "</div>";
  await smtpSend({
    user: GMAIL_USER,
    pass,
    from: { name: "BlueFix Handy Reparatur", address: GMAIL_USER },
    to,
    subject,
    text,
    html
  });
}

// Gleiche Absender-Zeilen wie in den Mails aus dem Admin-Panel (ohne die Bewertungs-Bitte).
const MAIL_FOOTER =
  "\n\nLiebe Grüsse\n\nBlueFix Team\n\nhttps://blue-fix.ch\nWeierbuckstrasse 1, 8213 Neunkirch, Schweiz";
const STATUS_BASE = "https://blue-fix.ch/reparatur";
const REVIEW_URL = "https://g.page/r/CSmWMWadV5iNEBI/review";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

module.exports = {
  PROJECT_ID, DB, FS, GMAIL_USER, STATUS_BASE, REVIEW_URL, MAIL_FOOTER,
  encodePath, fieldValue, getAccessToken, fsFetch, smtpSend, sendMail, checkEmail, cors
};
