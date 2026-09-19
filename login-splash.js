/* BlueFix Login-Splash – zeigt "Erfolgreich angemeldet" mit dem Benutzernamen,
   sobald man sich im Team-Panel angemeldet hat.
   Einbinden: <script src="login-splash.js"></script> ganz unten in der index.html (vor </body>). */
(function () {
  var SESSION_KEY = "bluefix_team_session"; // gleicher Schlüssel wie im Panel
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var SHOW_MS = reduce ? 900 : 2400;        // Dauer des Splash Screens

  var css =
    "#bfx-login{position:fixed;inset:0;z-index:2147483646;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;background:rgba(4,7,13,.8);-webkit-backdrop-filter:blur(18px) saturate(140%);backdrop-filter:blur(18px) saturate(140%);opacity:0;animation:bfl-in .3s ease forwards;transition:opacity .5s ease}" +
    "#bfx-login.bfl-out{opacity:0!important;pointer-events:none}" +
    "#bfx-login::before{content:'';position:absolute;inset:0;background:radial-gradient(circle at 50% 42%,rgba(47,191,113,.2),transparent 50%);opacity:0;animation:bfl-in 1s ease .3s forwards}" +
    ".bfl-svg{position:relative;width:132px;height:132px;overflow:visible;filter:drop-shadow(0 0 16px rgba(47,191,113,.5))}" +
    ".bfl-bg{fill:rgba(47,191,113,.1);opacity:0;animation:bfl-in .5s ease .2s forwards}" +
    ".bfl-ring{fill:none;stroke:#2fbf71;stroke-width:4;stroke-linecap:round;stroke-dasharray:327;stroke-dashoffset:327;transform:rotate(-90deg);transform-origin:60px 60px;animation:bfl-draw .8s cubic-bezier(.5,0,.2,1) .25s forwards}" +
    ".bfl-check{fill:none;stroke:#fff;stroke-width:6;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1;stroke-dashoffset:1;animation:bfl-draw .45s cubic-bezier(.5,0,.2,1) .95s forwards}" +
    ".bfl-text{position:relative;text-align:center;font-family:'Space Grotesk','Inter',system-ui,-apple-system,'Segoe UI',sans-serif;opacity:0;transform:translateY(10px);animation:bfl-up .6s cubic-bezier(.22,1,.36,1) 1.1s forwards}" +
    ".bfl-label{font-size:15px;font-weight:600;color:#2fbf71;margin-bottom:6px}" +
    ".bfl-name{font-size:36px;font-weight:700;line-height:1.1;color:#f5f8ff}" +
    "@keyframes bfl-in{to{opacity:1}}" +
    "@keyframes bfl-draw{to{stroke-dashoffset:0}}" +
    "@keyframes bfl-up{to{opacity:1;transform:none}}" +
    "@media (prefers-reduced-motion:reduce){#bfx-login *,#bfx-login::before{animation-duration:.01s!important;animation-delay:0s!important}}";

  function currentName() {
    try {
      var s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      var k = s && s.user ? String(s.user) : "";
      return k ? k.charAt(0).toUpperCase() + k.slice(1) : "";
    } catch (e) { return ""; }
  }

  var active = null;

  function show() {
    if (active) return;
    var name = currentName();
    if (!name) return;

    var style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);

    var el = document.createElement("div");
    el.id = "bfx-login";
    el.setAttribute("role", "status");
    el.innerHTML =
      '<svg class="bfl-svg" viewBox="0 0 120 120" aria-hidden="true">' +
        '<circle class="bfl-bg" cx="60" cy="60" r="52"/>' +
        '<circle class="bfl-ring" cx="60" cy="60" r="52"/>' +
        '<path class="bfl-check" pathLength="1" d="M38 62 L54 78 L84 44"/>' +
      '</svg>' +
      '<div class="bfl-text"><div class="bfl-label">Erfolgreich angemeldet</div><div class="bfl-name"></div></div>';
    el.querySelector(".bfl-name").textContent = name;
    el.setAttribute("aria-label", "Erfolgreich angemeldet als " + name);
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
