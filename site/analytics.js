/* Pesticid — strat subțire peste PostHog (vezi docs/posthog.md pentru lista evenimentelor).
   - `track(name, props)` e singura funcție apelată din calc.js / search.js / main.js.
   - Fără cheie (meta[name="pesticid-posthog"] lipsă) nimic nu pleacă; cu ?ph_debug în URL evenimentele apar în consolă.
   - Pornește fără cookie-uri (persistence: memory); după acceptul din banner trece pe localStorage+cookie.
   - Autocapture oprit; replay cu eșantion 10%, cu toate câmpurile mascate. Niciun email nu intră în proprietăți. */
(function () {
  'use strict';
  var meta = document.querySelector('meta[name="pesticid-posthog"]');
  var KEY = meta && meta.getAttribute('data-key'), HOST = (meta && meta.getAttribute('data-host')) || 'https://eu.i.posthog.com';
  var debug = /[?&]ph_debug\b/.test(location.search);
  var queue = [], ready = false, step = 0, common = { source: 'site' }, timers = {};
  var state = { calc_started: false, had_calc_result: false, had_search_result: false, search_started: false, last_calc_field: null, calc_fields: [] };

  function device() { var w = window.innerWidth; return w <= 700 ? 'mobile' : w <= 1100 ? 'tablet' : 'desktop'; }
  function mode() { var on = document.querySelector('.tabs .tab.is-on'); return on && /Caută/.test(on.textContent) ? 'search' : 'calc'; }

  function send(name, props) {
    if (ready && window.posthog) window.posthog.capture(name, props);
    else queue.push([name, props]);
  }
  /* starea folosită de calc_abandoned și de waitlist_submitted */
  function remember(name, props) {
    if (name === 'calc_started') state.calc_started = true;
    if (name === 'calc_result_shown' || name === 'search_calc_result_shown') state.had_calc_result = true;
    if (name === 'search_result_shown') state.had_search_result = true;
    if (name === 'search_started') state.search_started = true;
    if (name === 'calc_field_set') { state.last_calc_field = props.field; if (state.calc_fields.indexOf(props.field) < 0) state.calc_fields.push(props.field); }
    if (name === 'calc_field_cleared') state.calc_fields = state.calc_fields.filter(function (f) { return f !== props.field; });
    if (name === 'calc_result_shown') state.calc_fields = [];
  }
  function track(name, props) {
    props = props || {};
    step += 1;
    var p = {}; for (var k in common) p[k] = common[k];
    p.device = device(); p.mode = mode(); p.session_step = step;
    for (var k2 in props) if (props[k2] !== undefined) p[k2] = props[k2];
    remember(name, p);
    if (debug) console.log('[ph]', name, p);
    send(name, p);
  }
  /* un singur eveniment pentru o rafală (tastare, doză): cheie + întârziere */
  track.debounced = function (key, ms, name, props) { clearTimeout(timers[key]); timers[key] = setTimeout(function () { delete timers[key]; track(name, props); }, ms); };
  track.cancel = function (key) { clearTimeout(timers[key]); delete timers[key]; };
  track.register = function (props) { for (var k in props) common[k] = props[k]; if (ready && window.posthog) window.posthog.register(props); };
  track.state = state;
  track.consent = function (ok) {
    try { localStorage.setItem('pesticid.consent', ok ? 'yes' : 'no'); if (document.querySelector('meta[name="pesticid-gads"]')) localStorage.setItem('pesticid.consent.ads', ok ? 'yes' : 'no'); } catch (e) {}
    try { document.dispatchEvent(new Event('pesticid:consent')); } catch (e) {} /* gads.js pornește tagul Google doar după acord */
    if (ok && ready && window.posthog) { window.posthog.set_config({ persistence: 'localStorage+cookie' }); if (Math.random() < 0.1 && window.posthog.startSessionRecording) window.posthog.startSessionRecording(); }
  };
  track.distinctId = function () { return ready && window.posthog ? window.posthog.get_distinct_id() : null; };
  window.track = track;

  /* calc_abandoned: pagina se închide cu calculatorul început, fără rezultat */
  var abandonedSent = false;
  function onLeave() {
    if (abandonedSent || !state.calc_started || state.had_calc_result) return;
    abandonedSent = true;
    track('calc_abandoned', { last_field: state.last_calc_field, fields_set: state.calc_fields.slice(), fields_count: state.calc_fields.length });
  }
  window.addEventListener('pagehide', onLeave);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') onLeave(); });

  if (!KEY) { if (debug) console.log('[ph] fără cheie: evenimentele rămân locale'); return; }

  /* încărcare SDK după ce pagina e gata, ca să nu concureze cu datele calculatorului */
  function boot() {
    var s = document.createElement('script');
    s.src = 'https://unpkg.com/posthog-js@1.258.5/dist/array.full.js'; s.async = true;
    s.onload = function () {
      var consent = null; try { consent = localStorage.getItem('pesticid.consent'); } catch (e) {}
      window.posthog.init(KEY, {
        api_host: HOST,
        persistence: consent === 'yes' ? 'localStorage+cookie' : 'memory',
        autocapture: false,
        capture_pageview: true,
        capture_pageleave: true,
        disable_session_recording: consent !== 'yes' || Math.random() > 0.1, /* înregistrarea sesiunilor doar cu acord (GDPR), ~10% din vizite */
        session_recording: { maskAllInputs: true, maskTextSelector: 'input, textarea, .form-msg, [data-done-email], #r-done-email, .att-list' },
        property_denylist: ['$current_url_email'],
        loaded: function () {
          window.posthog.register(common);
          ready = true;
          queue.forEach(function (q) { window.posthog.capture(q[0], q[1]); }); queue = [];
          var adsLipsa = false; try { adsLipsa = !!document.querySelector('meta[name="pesticid-gads"]') && localStorage.getItem('pesticid.consent.ads') == null; } catch (e) {}
          if (consent == null || adsLipsa) showBanner(); /* cine a acceptat înainte de reclame e întrebat o dată din nou */
        }
      });
    };
    document.head.appendChild(s);
  }
  if (document.readyState === 'complete') boot(); else window.addEventListener('load', boot);

  /* banner minimal de consimțământ: doar pentru a trece de la memorie la cookie */
  function showBanner() {
    var b = document.createElement('div'); b.className = 'consent'; b.setAttribute('role', 'dialog'); b.setAttribute('aria-label', 'Cookie-uri');
    var ads = !!document.querySelector('meta[name="pesticid-gads"]');
    b.innerHTML = '<p>Folosim statistici anonime ca să îmbunătățim calculatorul. ' + (ads ? 'Accepți cookie-uri ca să te recunoaștem la următoarea vizită și să măsurăm câte înscrieri aduc reclamele Google?' : 'Accepți un cookie ca să te recunoaștem la următoarea vizită?') + '</p><div><button type="button" class="btn sm" data-ok>Accept</button><button type="button" class="btn sm ghost" data-no>Doar necesare</button></div>';
    b.addEventListener('click', function (ev) { if (ev.target.closest('[data-ok]')) { track.consent(true); b.remove(); } else if (ev.target.closest('[data-no]')) { track.consent(false); b.remove(); } });
    document.body.appendChild(b);
  }
})();
