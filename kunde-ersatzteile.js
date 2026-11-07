/* BlueFix – Kundenseite: Ersatzteil-Meldung mit Foto + Button «Gesehen».
   Wird in status.html ganz am Ende (nach dem grossen Skript) eingebunden:
     <script src="kunde-ersatzteile.js"></script>
   Die Datei liegt im selben Ordner wie status.html. */
(function () {
  var token = new URLSearchParams(location.search).get('t') || '';
  if (!/^[0-9a-f]{32}$/.test(token)) return;
  var tries = 0;

  function boot() {
    // Warten, bis die Status-Seite Firebase selbst gestartet hat (nie selbst initialisieren).
    if (!window.firebase || !firebase.apps || !firebase.apps.length) {
      if (++tries > 100) return;
      return setTimeout(boot, 200);
    }
    var ref = firebase.firestore().collection('bluefix_status').doc(token);
    var box = document.createElement('section');
    box.className = 'card';
    box.id = 'bfTeile';
    box.hidden = true;
    var anchor = document.getElementById('ship');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(box, anchor);
    else document.body.appendChild(box);

    function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function fmt(ts) { return new Date(ts).toLocaleString('de-CH', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }

    ref.onSnapshot(function (doc) {
      var d = doc.exists ? doc.data() : null, t = d && d.teile;
      if (!t || !(t.text || t.foto)) { box.hidden = true; return; }
      var foto = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(t.foto || '') ? t.foto : '';
      var h =
        '<h2 style="margin:0 0 8px;font-size:18px;">🔩 Dein Ersatzteil wurde bestellt</h2>' +
        (t.text ? '<p style="margin:0 0 12px;white-space:pre-wrap;">' + esc(t.text) + '</p>' : '') +
        (foto ? '<img src="' + foto + '" alt="Ersatzteil" style="display:block;width:100%;border-radius:12px;margin:0 0 14px;">' : '') +
        (t.bestaetigtAt
          ? '<p style="margin:0;color:#2fbf71;font-weight:600;">✅ Danke! Du hast das am ' + esc(fmt(t.bestaetigtAt)) + ' bestätigt.</p>'
          : '<button class="btn" type="button" id="bfTeileOk">Ich habe das gesehen ✔</button>');
      box.hidden = false;
      if (box.dataset.h !== h) { box.innerHTML = h; box.dataset.h = h; }
      var b = document.getElementById('bfTeileOk');
      if (b) b.onclick = function () {
        b.disabled = true; b.textContent = 'Wird gespeichert …';
        ref.update({ 'teile.bestaetigtAt': Date.now() }).catch(function (err) {
          console.warn(err);
          b.disabled = false; b.textContent = 'Ich habe das gesehen ✔';
          alert('Das hat leider nicht geklappt. Bitte versuche es gleich noch einmal.');
        });
      };
    }, function (err) { console.warn('Ersatzteile:', err); });
  }
  boot();
})();
