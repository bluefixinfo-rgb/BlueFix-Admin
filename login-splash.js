/* BlueFix Login-Splash – erscheint nach erfolgreicher Anmeldung im Team-Panel
   (Avatar, Begrüßung mit Benutzername, Status).
   Einbinden: <script src="login-splash.js"></script> ganz unten in der index.html (vor </body>).

   Verhalten:
   - Der Splash blockiert die komplette Seite (Maus, Touch, Wischen, Scrollen, Tastatur, Fokus).
   - Er hat KEINEN Klick-/Tap-Handler und lässt sich durch nichts vom Benutzer schließen.
   - Er verschwindet ausschließlich automatisch, wenn ALLE Bedingungen erfüllt sind:
       1. Mindestanzeigedauer (Animation) ist abgelaufen
       2. Seite (window.load) und Schriften sind vollständig geladen
       3. alle über BlueFixSplash.track(...) angemeldeten Ladeaufgaben sind fertig
          (in der index.html: erste Serverantwort von Aufträgen, Rechnungen und Chat)
   - Notbremse: Kommt nach MAX_MS trotzdem keine Antwort (z. B. kein Netz), wird der Splash
     automatisch entfernt, damit die App nie dauerhaft gesperrt bleibt. Auf 0 setzen = aus.

   API (window.BlueFixSplash):
     begin()        Splash sofort anzeigen (idempotent)
     track(name)    Ladeaufgabe anmelden, gibt eine done()-Funktion zurück
     done(name)     Ladeaufgabe als erledigt markieren
     isActive()     true, solange der Splash die Seite blockiert */
(function () {
  "use strict";

  var SESSION_KEY = "bluefix_team_session"; // gleicher Schlüssel wie im Panel
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var MIN_MS = reduce ? 900 : 3000;   // Mindestdauer der Animation
  var MAX_MS = 20000;                 // Notbremse (automatisch), 0 = keine Notbremse

  var css =
    "#bfx-login{position:fixed;inset:0;z-index:2147483646;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(4,7,13,.84);-webkit-backdrop-filter:blur(22px) saturate(140%);backdrop-filter:blur(22px) saturate(140%);opacity:0;animation:bfl-in .3s ease forwards;transition:opacity .5s ease;font-family:'Space Grotesk','Inter',system-ui,-apple-system,'Segoe UI',sans-serif;text-align:center;pointer-events:auto;touch-action:none;overscroll-behavior:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;cursor:progress;outline:none}" +
    "#bfx-login.bfl-out{opacity:0!important}" +
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
    ".bfl-load{position:absolute;bottom:calc(max(56px,env(safe-area-inset-bottom)) + 16px);font-size:13px;color:#8a99b8;opacity:0;transition:opacity .4s ease}" +
    "#bfx-login.bfl-waiting .bfl-load{opacity:1}" +
    ".bfl-bar{position:absolute;bottom:max(56px,env(safe-area-inset-bottom));width:min(220px,60vw);height:3px;border-radius:2px;background:rgba(255,255,255,.1);overflow:hidden}" +
    ".bfl-bar b{display:block;height:100%;background:linear-gradient(90deg,#1e6fef,#4a9cff);transform:scaleX(0);transform-origin:left;animation:bfl-fill 1.7s linear 1.1s forwards}" +
    /* Fortschrittsbalken war voll, aber es lädt noch: endlos laufender Balken statt Stillstand */
    ".bfl-bar.bfl-wait b{width:40%;transform:none;animation:bfl-slide 1.2s ease-in-out infinite}" +
    "@keyframes bfl-in{to{opacity:1}}" +
    "@keyframes bfl-pop{to{opacity:1;transform:none}}" +
    "@keyframes bfl-draw{to{stroke-dashoffset:0}}" +
    "@keyframes bfl-badge{to{transform:scale(1)}}" +
    "@keyframes bfl-up{to{opacity:1;transform:none}}" +
    "@keyframes bfl-fill{to{transform:scaleX(1)}}" +
    "@keyframes bfl-slide{0%{margin-left:-40%}100%{margin-left:100%}}" +
    "@media (prefers-reduced-motion:reduce){#bfx-login *,#bfx-login::before{animation-duration:.01s!important;animation-delay:0s!important}#bfx-login .bfl-bar.bfl-wait b{animation:none!important;width:100%;margin:0;opacity:.55}}";

  /* ---------- Benutzer aus der Sitzung ---------- */
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

  /* ---------- Zustand ---------- */
  var active = null;        // Overlay-Element, solange der Splash die Seite blockiert
  var finished = false;     // Schließvorgang läuft / abgeschlossen
  var minElapsed = false;   // Mindestdauer vorbei
  var envReady = false;     // window.load + Schriften fertig
  var pending = {};         // offene Ladeaufgaben: name -> true
  var timers = [];
  var undo = [];            // Aufräum-Funktionen (Listener, inert, Scroll-Sperre)

  function hasPending() {
    for (var k in pending) if (pending[k]) return true;
    return false;
  }

  function pageLoaded() {
    return new Promise(function (res) {
      if (document.readyState === "complete") res();
      else window.addEventListener("load", function () { res(); }, { once: true });
    });
  }
  function fontsLoaded() {
    try {
      if (document.fonts && document.fonts.ready) return document.fonts.ready.then(function () {}, function () {});
    } catch (e) {}
    return Promise.resolve();
  }

  /* ---------- Blockade der Seite ---------- */
  var BLOCKED_EVENTS = [
    "click", "dblclick", "auxclick", "mousedown", "mouseup", "contextmenu",
    "pointerdown", "pointerup", "touchstart", "touchmove", "touchend",
    "wheel", "keydown", "keypress", "keyup", "dragstart", "selectstart"
  ];

  function blockEvent(e) {
    if (!active) return;
    e.stopImmediatePropagation();
    if (e.type.indexOf("key") === 0) {
      // Browser-Kurzbefehle (Neu laden etc.) nicht verhindern, aber nie an die Seite weitergeben
      if (e.ctrlKey || e.metaKey || e.altKey || /^F\d+$/.test(e.key || "")) return;
    }
    if (e.cancelable) e.preventDefault();
  }

  function lockPage(el) {
    // 1) Alle Ereignisse schon in der Capture-Phase abfangen, bevor Seiten-Handler sie sehen
    BLOCKED_EVENTS.forEach(function (type) {
      document.addEventListener(type, blockEvent, { capture: true, passive: false });
      undo.push(function () { document.removeEventListener(type, blockEvent, { capture: true }); });
    });

    // 2) Fokus darf nie hinter den Splash wandern
    function keepFocus(e) {
      if (active && !el.contains(e.target)) {
        e.stopImmediatePropagation();
        try { el.focus({ preventScroll: true }); } catch (err) {}
      }
    }
    document.addEventListener("focusin", keepFocus, true);
    undo.push(function () { document.removeEventListener("focusin", keepFocus, true); });

    // 3) Restliche Seite deaktivieren (kein Tab, kein Screenreader, kein Klick)
    Array.prototype.forEach.call(document.body.children, function (node) {
      if (node === el || /^(SCRIPT|STYLE|LINK|NOSCRIPT)$/.test(node.tagName)) return;
      var hadInert = node.hasAttribute("inert");
      var prevAria = node.getAttribute("aria-hidden");
      node.setAttribute("inert", "");
      node.setAttribute("aria-hidden", "true");
      undo.push(function () {
        if (!hadInert) node.removeAttribute("inert");
        if (prevAria === null) node.removeAttribute("aria-hidden");
        else node.setAttribute("aria-hidden", prevAria);
      });
    });

    // 4) Scrollen sperren
    var root = document.documentElement, body = document.body;
    var prevRoot = root.style.overflow, prevBody = body.style.overflow;
    root.style.overflow = "hidden";
    body.style.overflow = "hidden";
    undo.push(function () { root.style.overflow = prevRoot; body.style.overflow = prevBody; });

    // 5) Bereits fokussiertes Element (z. B. Passwortfeld) freigeben, Fokus auf den Splash
    if (document.activeElement && document.activeElement !== body && document.activeElement.blur) {
      try { document.activeElement.blur(); } catch (e) {}
    }
    try { el.focus({ preventScroll: true }); } catch (e) {}
  }

  /* ---------- Anzeigen ---------- */
  function show() {
    if (active) return;
    var u = getUser();
    if (!u) return;

    finished = false;
    minElapsed = false;
    envReady = false;

    var style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);

    var el = document.createElement("div");
    el.id = "bfx-login";
    el.tabIndex = -1;
    el.setAttribute("role", "status");
    el.setAttribute("aria-busy", "true");
    el.setAttribute("aria-label", "Erfolgreich angemeldet als " + u.name + ". Daten werden geladen.");
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
      '<div class="bfl-load">Daten werden geladen …</div>' +
      '<div class="bfl-bar"><b></b></div>';
    el.querySelector(".bfl-ini").textContent = u.name.charAt(0);
    el.querySelector(".bfl-hi").textContent = greeting();
    el.querySelector(".bfl-name").textContent = u.name;
    var roleEl = el.querySelector(".bfl-role");
    if (u.role) roleEl.textContent = u.role; else roleEl.remove();
    document.body.appendChild(el);
    active = el;

    // Bewusst KEIN click/tap-Handler auf dem Splash: er ist durch Benutzeraktionen nicht schließbar.
    lockPage(el);

    Promise.all([pageLoaded(), fontsLoaded()]).then(function () {
      envReady = true;
      tryFinish();
    });
    timers.push(setTimeout(function () { minElapsed = true; tryFinish(); }, MIN_MS));
    if (MAX_MS > 0) {
      timers.push(setTimeout(function () {
        if (active && !finished) {
          try { console.warn("[BlueFix] Splash: Notbremse nach " + MAX_MS + " ms, offen:", Object.keys(pending).filter(function (k) { return pending[k]; })); } catch (e) {}
          finish(style);
        }
      }, MAX_MS));
    }
    el._style = style;
  }

  function showWaiting() {
    if (!active) return;
    active.classList.add("bfl-waiting");
    var bar = active.querySelector(".bfl-bar");
    if (bar) bar.classList.add("bfl-wait");
  }

  /* Wird nur intern aufgerufen – nie durch eine Benutzeraktion. */
  function tryFinish() {
    if (!active || finished) return;
    if (!minElapsed || !envReady) return;
    if (hasPending()) { showWaiting(); return; }
    finish(active._style);
  }

  function finish(style) {
    if (!active || finished) return;
    finished = true;
    timers.forEach(clearTimeout);
    timers = [];
    var el = active;
    el.setAttribute("aria-busy", "false");
    el.classList.add("bfl-out"); // Ausblenden; Blockade bleibt bis zum Ende der Animation bestehen
    setTimeout(function () {
      // Erst jetzt wird die Seite wieder bedienbar
      undo.forEach(function (fn) { try { fn(); } catch (e) {} });
      undo = [];
      el.remove();
      if (style) style.remove();
      pending = {};
      active = null;
    }, 600);
  }

  /* ---------- Öffentliche API ---------- */
  window.BlueFixSplash = {
    begin: function () { show(); },
    track: function (name) {
      if (!active || finished) return function () {};
      pending[name] = true;
      return function () { window.BlueFixSplash.done(name); };
    },
    done: function (name) {
      if (name in pending) { pending[name] = false; tryFinish(); }
    },
    isActive: function () { return !!active; }
  };

  /* ---------- Fallback: erkennt den Wechsel Login -> Team-Panel selbst ---------- */
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
