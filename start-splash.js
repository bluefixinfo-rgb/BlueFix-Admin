/* BlueFix Start-Intro: Neon-Logo zeichnet sich, blitzt auf, Glitch, Schriftzug, Zoom-Out.
   Einbindung wie bisher: <script src="start-splash.js"></script> im <head>.
   Antippen überspringt das Intro. Kein Einfluss auf BlueFixSplash (Login-Splash). */
(function () {
  if (window.__bfStartIntro) return;
  window.__bfStartIntro = true;

  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var TOTAL = reduce ? 900 : 4000;

  var css =
    '#bfIntro{position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
    'background:radial-gradient(ellipse at 50% 45%,#0b1a33 0%,#04070d 62%);overflow:hidden;touch-action:manipulation;' +
    'animation:bfOut .6s ease ' + (TOTAL - 600) + 'ms forwards}' +
    '#bfIntro .wrap{display:flex;flex-direction:column;align-items:center;animation:bfZoom .7s cubic-bezier(.6,0,.9,.4) ' + (TOTAL - 800) + 'ms forwards}' +
    '#bfIntro svg{width:min(62vw,300px);height:auto;overflow:visible}' +
    '#bfIntro .p{fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1;stroke-dashoffset:1}' +
    '#bfIntro .glow{stroke:#1e6fef;stroke-width:12;filter:url(#bfBlur);opacity:.9;animation:bfDraw 1.5s ease .2s forwards,bfPulse .5s ease 1.6s forwards}' +
    '#bfIntro .ghostA,#bfIntro .ghostB{stroke-width:5;mix-blend-mode:screen;opacity:0}' +
    '#bfIntro .ghostA{stroke:#00e5ff}#bfIntro .ghostB{stroke:#3d5bff}' +
    '#bfIntro .ghostA{animation:bfDraw 1.5s ease .2s forwards,bfGlitchA .5s steps(1) 1.7s forwards}' +
    '#bfIntro .ghostB{animation:bfDraw 1.5s ease .2s forwards,bfGlitchB .5s steps(1) 1.7s forwards}' +
    '#bfIntro .core{stroke:#fff;stroke-width:4;animation:bfDraw 1.5s ease .2s forwards,bfThick .4s ease 1.6s forwards}' +
    '#bfIntro .txt{margin-top:26px;font:700 clamp(22px,7vw,34px)/1 "Space Grotesk","Inter",system-ui,sans-serif;color:#f5f8ff;' +
    'letter-spacing:.9em;text-indent:.9em;opacity:0;text-shadow:0 0 18px rgba(74,156,255,.9),0 0 2px #fff;' +
    'animation:bfTxt .9s cubic-bezier(.2,.8,.2,1) 2s forwards}' +
    '#bfIntro .txt b{color:#4a9cff;font-weight:700}' +
    '#bfIntro .bar{margin-top:18px;height:3px;width:0;border-radius:3px;background:linear-gradient(90deg,transparent,#4a9cff,transparent);' +
    'box-shadow:0 0 14px #1e6fef;animation:bfBar .8s ease 2.3s forwards}' +
    '@keyframes bfDraw{to{stroke-dashoffset:0}}' +
    '@keyframes bfPulse{50%{stroke-width:22;opacity:1}to{stroke-width:14;opacity:1}}' +
    '@keyframes bfThick{50%{stroke-width:9}to{stroke-width:7}}' +
    '@keyframes bfGlitchA{0%{opacity:1;transform:translate(-7px,2px)}25%{opacity:1;transform:translate(5px,-2px)}50%{opacity:1;transform:translate(-3px,0)}75%{opacity:1;transform:translate(4px,1px)}100%{opacity:0;transform:none}}' +
    '@keyframes bfGlitchB{0%{opacity:1;transform:translate(7px,-2px)}25%{opacity:1;transform:translate(-5px,2px)}50%{opacity:1;transform:translate(3px,0)}75%{opacity:1;transform:translate(-4px,-1px)}100%{opacity:0;transform:none}}' +
    '@keyframes bfTxt{from{opacity:0;letter-spacing:.9em;text-indent:.9em;filter:blur(6px)}to{opacity:1;letter-spacing:.34em;text-indent:.34em;filter:blur(0)}}' +
    '@keyframes bfBar{to{width:min(52vw,240px)}}' +
    '@keyframes bfZoom{to{transform:scale(1.7);opacity:0}}' +
    '@keyframes bfOut{to{opacity:0}}' +
    (reduce ? '#bfIntro,#bfIntro *{animation-duration:.01s!important;animation-delay:0s!important}#bfIntro{animation:bfOut .4s ease .5s forwards!important}' : '');

  /* "BF"-Monogramm als Linienzug (pathLength=1 für den Zeichen-Effekt) */
  var B = 'M20 22H66Q92 22 92 44Q92 66 66 67H20M66 67Q98 67 98 95Q98 122 66 122H20V22';
  var F = 'M132 122V22H198M132 70H184';

  function paths(cls) {
    return '<path class="p ' + cls + '" pathLength="1" d="' + B + '"/>' +
           '<path class="p ' + cls + '" pathLength="1" d="' + F + '"/>';
  }

  var html =
    '<style>' + css + '</style><div class="wrap">' +
    '<svg viewBox="0 0 220 145" aria-hidden="true"><defs><filter id="bfBlur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="6"/></filter></defs>' +
    '<g>' + paths('glow') + '</g><g>' + paths('ghostA') + '</g><g>' + paths('ghostB') + '</g><g>' + paths('core') + '</g></svg>' +
    '<div class="txt">Blue<b>Fix</b></div><div class="bar"></div></div>';

  var el = document.createElement('div');
  el.id = 'bfIntro';
  el.setAttribute('role', 'presentation');
  el.innerHTML = html;
  (document.body || document.documentElement).appendChild(el);

  var done = false;
  function finish() {
    if (done) return;
    done = true;
    el.style.transition = 'opacity .25s ease';
    el.style.opacity = '0';
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
      try { window.dispatchEvent(new Event('bluefix:intro-done')); } catch (e) {}
    }, 260);
  }

  el.addEventListener('click', finish);
  el.addEventListener('touchstart', finish, { passive: true });
  setTimeout(finish, TOTAL);
})();
