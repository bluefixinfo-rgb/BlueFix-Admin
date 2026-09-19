/* BlueFix Login-Splash – erscheint nach erfolgreicher Anmeldung im Team-Panel
   (Avatar, Begrüßung mit Benutzername, Status).
   Einbinden: <script src="login-splash.js"></script> ganz unten in der index.html (vor </body>). */
(function () {
  var SESSION_KEY = "bluefix_team_session"; // gleicher Schlüssel wie im Panel
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var SHOW_MS = reduce ? 900 : 3000;        // Dauer des Splash Screens

  var css =
    "#bfx-login{position:fixed;inset:0;z-index:2147483646;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(4,7,13,.84);-webkit-backdrop-filter:blur(22px) saturate(140%);backdrop-filter:blur(22px) saturate(140%);opacity:0;animation:bfl-in .3s ease forwards;transition:opacity .5s ease;font-family:'Space Grotesk','Inter',system-ui,-apple-system,'Segoe UI',sans-serif;text-align:center}" +
    "#bfx-login.bfl-out{opacity:0!important;pointer-events:none}" +
    "#bfx-login::before{content:'';position:absolute;inset:0;background:radial-gradient(circle at 50% 38%,rgba(30,111,239,.26),transparent 52%);opacity:0;animation:bfl-in 1s ease .2s forwards}" +
    ".bfl-av{position:relative;width:132px;height:132px;opacity:0;transform:scale(.7);animation:bfl-pop .6s cubic-bezier(.34,1.56,.64,1) .15s forwards}" +
    ".bfl-ring{position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg);overflow:visible}" +
    ".bfl-ring circle{fill:none}" +
    ".bfl-ring .t{stroke:rgba(255,255,255,.1);stroke-width:3}" +
    ".bfl-ring .p{stroke:url(#bflg);stroke-width:4;stroke-linecap:round;stroke-dasharray:352;stroke-dashoffset:352;animation:bfl-draw .9s cubic-bezier(.5,0,.2,1) .35s forwards}" +
    ".bfl-ini{position:absolute;inset:12px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(145deg,#2f7bff,#173a70);color:#fff;font-size:48px;font-weight:700;line-height:1;box-shadow:0 0 34px rgba(30,111,239,.5)}" +
    ".bfl-badge{position:absolute;right:-2px;bottom:2px;width:40px;height:40px;border-radius:50%;background:#2fbf71;border:4px solid #060f1e;display:grid;place-items:center;transform:scale(0);animation:bfl-badge .5s cubic-bezier(.34,1.8,.64,1) 1.25s forwards}" +
    ".bfl-badge svg{width:20px;height:20px;fill:none;stroke:#fff;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}" +
    ".bfl-r{position:relative;opacity:0;transform:translateY(10px);animation:bfl-up .55s cubic-bezier(.22,1,.36,1) forwards}" +
    ".bfl-hi{margin-top:30px;font-size:16px;font-weight:500;color:#8a99b8;animation-delay:1s}" +
    ".bfl-name{margin-top:4px;font-size:42px;font-weight:700;line-height:1.1;color:#f5f8ff;animation-delay:1.1s}" +
    ".bfl-status{margin-top:18px;display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;background:rgba(47,191,113,.12);border:1px solid rgba(47,191,113,.35);color:#56d68f;font-size:14px;font-weight:600;animation-delay:1.3s}" +
    ".bfl-status i{width:8px;height:8px;border-radius:50%;background:#2fbf71;box-shadow:0 0 8px #2fbf71}" +
    ".bfl-role{margin-top:12px;font-size:13px;color:#8a99b8;animation-delay:1.4s}" +
    ".bfl-bar{position:absolute;bottom:max(56px,env(safe-area-inset-bottom));width:min(220px,60vw);height:3px;border-radius:2px;background:rgba(255,255,255,.1);overflow:hidden}" +
    ".bfl-bar b{display:block;height:100%;background:linear-gradient(90deg,#1e6fef,#4a9cff);transform:scaleX(0);transform-origin:left;animation:bfl-fill 1.7s linear 1.1s forwards}" +
    "@keyframes bfl-in{to{opacity:1}}" +
    "@keyframes bfl-pop{to{opacity:1;transform:none}}" +
    "@keyframes bfl-draw{to{stroke-dashoffset:0}}" +
    "@keyframes bfl-badge{to{transform:scale(1)}}" +
    "@keyframes bfl-up{to{opacity:1;transform:none}}" +
    "@keyframes bfl-fill{to{transform:scaleX(1)}}" +
    "@media (prefers-reduced-motion:reduce){#bfx-login *,#bfx-login::before{animation-duration:.01s!important;animation-delay:0s!important}}";

  function getUser() {
    var key = "";
    try {
      var s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      key = s && s.user ? String(s.user) : "";
    } catch (e) {}
    if (!key) return null;
    var name = key.charAt(0).toUpperCase() + key.slice(1);
    var role = "";
    try { // Anzeigename und Rolle aus der Benutzerliste des Panels, falls vorhanden
      if (typeof USERS !== "undefined" && USERS[key]) {
        name = USERS[key].displayName || name;
        role = USERS[key].role || "";
      }
    } catch (e) {}
    return { name: name, role: role };
  }

  function greeting() {
    var h = new Date().getHours();
    if (h >= 5 && h < 11) return "Guten Morgen";   // 05:00 – 10:59
    if (h >= 11 && h < 17) return "Guten Mittag";  // 11:00 – 16:59
    return "Guten Abend";                          // 17:00 – 04:59
  }

  var active = null;

  function show() {
    if (active) return;
    var u = getUser();
    if (!u) return;

    var style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);

    var el = document.createElement("div");
    el.id = "bfx-login";
    el.setAttribute("role", "status");
    el.setAttribute("aria-label", "Erfolgreich angemeldet als " + u.name);
    el.innerHTML =
      '<div class="bfl-av">' +
        '<svg class="bfl-ring" viewBox="0 0 120 120" aria-hidden="true">' +
          '<defs><linearGradient id="bflg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4a9cff"/><stop offset="1" stop-color="#1e6fef"/></linearGradient></defs>' +
          '<circle class="t" cx="60" cy="60" r="56"/><circle class="p" cx="60" cy="60" r="56"/>' +
        '</svg>' +
        '<div class="bfl-ini"></div>' +
        '<div class="bfl-badge"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12.5l4 4 8-9"/></svg></div>' +
      '</div>' +
      '<div class="bfl-r bfl-hi"></div>' +
      '<div class="bfl-r bfl-name"></div>' +
      '<div class="bfl-r bfl-status"><i></i>Erfolgreich angemeldet</div>' +
      '<div class="bfl-r bfl-role"></div>' +
      '<div class="bfl-bar"><b></b></div>';
    el.querySelector(".bfl-ini").textContent = u.name.charAt(0);
    el.querySelector(".bfl-hi").textContent = greeting();
    el.querySelector(".bfl-name").textContent = u.name;
    var roleEl = el.querySelector(".bfl-role");
    if (u.role) roleEl.textContent = u.role; else roleEl.remove();
    document.body.appendChild(el);
    active = el;

    var closed = false;
    function close() {
      if (closed) return;
      closed = true;
      el.classList.add("bfl-out");
      setTimeout(function () { el.remove(); style.remove(); active = null; }, 600);
    }
    el.addEventListener("click", close); // Tippen überspringt den Splash
    setTimeout(close, SHOW_MS);
  }

  function init() {
    var app = document.getElementById("appScreen");
    if (!app) return;
    var wasVisible = app.style.display === "flex";
    new MutationObserver(function () {
      var visible = app.style.display === "flex";
      if (visible && !wasVisible) show(); // nur beim Wechsel Login -> Team-Panel
      wasVisible = visible;
    }).observe(app, { attributes: true, attributeFilter: ["style"] });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
