/* Pesticid — site de prezentare: tranziție hero, parallax pe fotografii, apariții la scroll, contoare, nav compact. */
(function () {
  'use strict';
  window.agrosphereMain = true;
  /* clic în meniu (desktop și telefon): ce pagină alege omul și de unde pleacă */
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a.menu-it, a.mm-it');
    if (a && window.track) window.track('nav_clicked', { item: a.textContent.replace(/\s+/g, ' ').trim(), menu: a.classList.contains('mm-it') ? 'mobile' : 'desktop', from_page: location.pathname, is_current: a.classList.contains('is-on') });
  }); /* scriptul din <head> verifică asta: fără main.js, conținutul rămâne vizibil */
  document.documentElement.classList.remove('no-js');

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var nav = document.querySelector('.nav');
  var heroBg = document.querySelector('.hero-bg');
  var parallax = Array.prototype.slice.call(document.querySelectorAll('[data-parallax]'));
  var ticking = false;

  /* fotografia din hero apare cu ease-in după ce s-a încărcat */
  function showHero() { if (heroBg) heroBg.classList.add('is-in'); }
  if (heroBg) {
    heroBg.addEventListener('animationend', function () { heroBg.classList.add('is-done'); updateParallax(); });
    var src = heroBg.getAttribute('data-src'), src2x = heroBg.getAttribute('data-src-2x');
    /* varianta de 3840px doar unde chiar se vede diferența: ecrane retina sau foarte late (peste ~2200 de pixeli reali) */
    if (src2x && (window.innerWidth * (window.devicePixelRatio || 1)) > 2200) src = src2x;
    if (src) {
      var img = new Image();
      img.onload = function () { heroBg.style.backgroundImage = 'url("' + src + '")'; requestAnimationFrame(showHero); };
      img.onerror = showHero;
      img.src = src;
    } else {
      requestAnimationFrame(showHero);
    }
  }

  /* parallax: fiecare fotografie se mișcă mai lent decât pagina (factor din data-parallax) */
  function updateParallax() {
    ticking = false;
    if (reduce) return;
    var vh = window.innerHeight;
    for (var i = 0; i < parallax.length; i++) {
      var el = parallax[i];
      var host = el.parentElement;
      var r = host.getBoundingClientRect();
      if (r.bottom < -vh || r.top > vh * 2) continue;
      var speed = parseFloat(el.getAttribute('data-parallax')) || 0.2;
      var y;
      if (el.hasAttribute('data-parallax-top')) {
        /* secțiunea din capul paginii: fotografia coboară mai lent decât pagina, pornind din 0 */
        y = window.scrollY * speed;
      } else {
        var center = r.top + r.height / 2 - vh / 2;
        y = center * speed * -1;
      }
      el.style.transform = 'translate3d(0,' + y.toFixed(1) + 'px,0)';
    }
  }
  function onScroll() {
    if (nav) nav.classList.toggle('is-scrolled', window.scrollY > 24);
    if (!ticking) { ticking = true; requestAnimationFrame(updateParallax); }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();

  /* apariție la scroll */
  var reveals = document.querySelectorAll('.reveal, .step');
  if ('IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('is-visible'); });
  }

  /* contoare: numără până la valoarea din data-count când intră în ecran */
  var counters = document.querySelectorAll('[data-count]');
  function animateCount(el) {
    var target = parseInt(el.getAttribute('data-count'), 10);
    var suffix = el.getAttribute('data-suffix') || '';
    if (reduce || !target) { el.textContent = target + suffix; return; }
    var start = null, dur = 1400;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min(1, (ts - start) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased) + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  if ('IntersectionObserver' in window) {
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { animateCount(e.target); cio.unobserve(e.target); } });
    }, { threshold: 0.5 });
    counters.forEach(function (el) { cio.observe(el); });
  } else {
    counters.forEach(animateCount);
  }

  /* numărătoare inversă pentru campania „Acces timpuriu”: zile; în ultima zi ore și minute */
  var early = document.querySelector('[data-campaign-end]'); /* secțiunea „Acces timpuriu” sau pagina Abonamente */
  var cdEl = document.querySelector('[data-cd]');
  function plural(n, one, few, many) { return n === 1 ? '1 ' + one : (n < 20 ? n + ' ' + few : n + ' de ' + many); }
  function tickCountdown() {
    if (!early || !cdEl) return;
    var end = new Date(early.getAttribute('data-campaign-end')).getTime();
    var left = end - Date.now();
    var box = document.getElementById('countdown');
    if (isNaN(end)) return;
    if (left <= 0) { box.classList.add('is-over'); box.innerHTML = 'Campania s-a încheiat'; return; }
    var min = Math.floor(left / 60000), ore = Math.floor(min / 60), zile = Math.floor(ore / 24);
    var text;
    if (zile >= 1) text = plural(zile + 1, 'zi', 'zile', 'zile');          /* ziua curentă se numără întreagă */
    else if (ore >= 1) text = plural(ore, 'oră', 'ore', 'ore') + ' și ' + plural(min % 60, 'minut', 'minute', 'minute');
    else text = plural(Math.max(1, min), 'minut', 'minute', 'minute');
    cdEl.textContent = text;
    box.firstChild.nodeValue = zile >= 1 ? 'Campanie disponibilă ' : 'Campania se încheie în ';
  }
  /* banda early bird din nav: aceeași dată de final ca secțiunea; în ultima zi arată ore și minute; după final dispare */
  var promo = document.getElementById('promo');
  function tickPromo() {
    if (!promo || !early) return;
    var end = new Date(early.getAttribute('data-campaign-end')).getTime();
    if (isNaN(end)) return;
    var left = end - Date.now();
    if (left <= 0) { document.documentElement.classList.add('no-promo'); return; }
    var min = Math.floor(left / 60000), ore = Math.floor(min / 60), zile = Math.floor(ore / 24);
    var l = promo.querySelector('[data-promo-l]'), t = promo.querySelector('[data-promo-t]');
    if (zile >= 1) { l.textContent = 'Campanie valabilă'; t.textContent = plural(zile + 1, 'zi', 'zile', 'zile'); }
    else { l.textContent = 'Expiră în'; t.textContent = ore >= 1 ? plural(ore, 'oră', 'ore', 'ore') + ' - ' + plural(min % 60, 'min', 'min', 'min') : plural(Math.max(1, min), 'min', 'min', 'min'); }
  }
  tickPromo();
  setInterval(tickPromo, 30000);
  if (promo) promo.addEventListener('click', function () { if (window.track) window.track('promo_bar_clicked', { text: promo.textContent.replace(/\s+/g, ' ').trim() }); });
  tickCountdown();
  setInterval(tickCountdown, 30000);

  /* formularul „Rezerv loc”: validare + trimitere la Supabase (rpc rezerva_loc); fără configurare → mod demo */
  var cfg = document.querySelector('meta[name="pesticid-supabase"]');
  var sbUrl = cfg && cfg.getAttribute('data-url'), sbKey = cfg && cfg.getAttribute('data-key');
  var EMAIL_RE = /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)*\.[a-z]{2,}$/i;
  /* CUI: cifra de control (cheia 753217532), 2–10 cifre; același calcul ca în Edge Functions `firma-cui` și `rezerva` */
  function cuiCurat(v) { return String(v || '').toUpperCase().replace(/^\s*RO/, '').replace(/\D/g, ''); }
  function cuiValid(c) {
    if (!/^\d{2,10}$/.test(c)) return false;
    var d = ('000000000' + c.slice(0, -1)).slice(-9), k = '753217532', s = 0;
    for (var i = 0; i < 9; i++) s += +d[i] * +k[i];
    var x = (s * 10) % 11; if (x === 10) x = 0;
    return x === +c.slice(-1);
  }
  function escHtml(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  /* căutarea firmei: Edge Function `firma-cui` (ANAF); fără Supabase (previzualizare) → răspuns demonstrativ */
  function cautaFirma(cui) {
    if (!sbUrl || !sbKey) return new Promise(function (res) { setTimeout(function () {
      res(cui === '12345674' ? { gasit: true, cui: cui, denumire: 'Exemplu Firmă Inactivă SRL', judet: 'București', caen: '5241', activa: false }
        : { gasit: true, cui: cui, denumire: 'Firmă exemplu (previzualizare, fără ANAF)', judet: 'Brașov', localitate: 'Hărman', caen: '4675', activa: true, deja_rezervat: false });
    }, 450); });
    return fetch(sbUrl + '/functions/v1/firma-cui', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': sbKey, 'Authorization': 'Bearer ' + sbKey },
      body: JSON.stringify({ cui: cui })
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (r.status === 400 && j.error === 'control') return { control: false }; if (!r.ok) throw new Error('HTTP ' + r.status); return j; }); });
  }
  /* câmpul CUI (Figma 2297:25655): stările gol · scrie · se caută · firma apare · confirmată · CUI greșit · inactivă · deja rezervat */
  function cuiField(f, onChange) {
    var input = f.querySelector('.field.cui input'), lbl = f.querySelector('.field.cui'), dd = f.querySelector('.cui-dd'), st = f.querySelector('.cui-stare');
    var state = 'gol', firma = null, timer = null, cerere = 0;
    function set(s, msg, cls) {
      state = s;
      lbl.classList.toggle('is-busy', s === 'cauta');
      lbl.classList.toggle('is-ok', s === 'ok');
      lbl.classList.toggle('is-err', s === 'gresit' || s === 'inactiva' || s === 'negasit');
      st.className = 'cui-stare' + (cls ? ' ' + cls : ''); st.innerHTML = msg || '';
      onChange();
    }
    function inchide() { dd.hidden = true; dd.innerHTML = ''; input.setAttribute('aria-expanded', 'false'); }
    function arata(html) { dd.innerHTML = html; dd.hidden = false; input.setAttribute('aria-expanded', 'true'); }
    function confirma() {
      inchide();
      set('ok', '✓ ' + escHtml(firma.denumire) + (firma.judet ? ' · ' + escHtml(firma.judet) : '') + ' · activă <button type="button" data-schimba>Schimbă firma</button>', 'ok');
      var b = st.querySelector('[data-schimba]'); if (b) b.addEventListener('click', function () { input.focus(); input.select(); set('scrie', ''); });
      if (window.track) window.track('partner_cui_confirmed', { judet: firma.judet || null, caen: firma.caen || null });
    }
    function rezultat(j, cui) {
      if (cuiCurat(input.value) !== cui) return;               /* între timp s-a schimbat CUI-ul */
      if (j.control === false) { inchide(); set('gresit', 'CUI-ul nu pare corect. Verifică ultima cifră.', 'err'); return; }
      if (j.indisponibil) { inchide(); firma = { cui: cui, denumire: '', judet: '' }; set('neverificat', 'Nu putem verifica acum firma la ANAF. Poți rezerva locul, o verificăm noi mai târziu.', 'info'); return; }
      if (j.deja_rezervat) { inchide(); set('rezervat', 'Firma are deja un loc rezervat. Verifică emailul folosit atunci sau scrie-ne dacă nu tu l-ai rezervat.', 'warn'); return; }
      if (!j.gasit) { inchide(); set('negasit', 'Nu am găsit firma la ANAF. Verifică CUI-ul pe o factură.', 'err'); return; }
      if (!j.activa) { inchide(); set('inactiva', 'Firma apare inactivă la ANAF. Dacă e o greșeală, scrie-ne și verificăm.', 'err'); return; }
      firma = j;
      var sub = [j.judet, j.caen ? 'CAEN ' + j.caen : ''].filter(Boolean).join(' · ');
      arata('<button type="button" class="cui-opt is-main" role="option" aria-selected="false" data-firma><span class="t"><b>' + escHtml(j.denumire) + '</b><small>' + escHtml(sub) + '</small></span><span class="tag">activă</span></button>'
        + '<div class="cui-opt" role="presentation"><span class="t"><b>Nu e firma ta?</b><small>Verifică CUI-ul pe o factură</small></span></div>');
      set('gasit', '');
      dd.querySelector('[data-firma]').addEventListener('click', confirma);
    }
    function verifica(imediat) {
      clearTimeout(timer);
      var cui = cuiCurat(input.value);
      firma = null;
      if (!cui) { inchide(); set('gol', ''); return; }
      if (!cuiValid(cui)) {
        inchide();
        /* eroarea apare doar după ce a terminat de scris (iese din câmp sau trimite) */
        if (imediat && cui.length >= 2) set('gresit', 'CUI-ul nu pare corect. Verifică ultima cifră.', 'err'); else set('scrie', '');
        return;
      }
      timer = setTimeout(function () {
        var id = ++cerere;
        set('cauta', '');
        arata('<div class="cui-opt" role="presentation"><span class="t"><b>Căutăm firma în ANAF…</b><small>după CUI-ul scris</small></span></div>');
        cautaFirma(cui).then(function (j) { if (id === cerere) rezultat(j, cui); })
          .catch(function () { if (id === cerere) rezultat({ indisponibil: true }, cui); });
      }, imediat ? 0 : 350);
    }
    input.addEventListener('input', function () { verifica(false); });
    input.addEventListener('blur', function () { if (state === 'scrie') verifica(true); }); /* lista cu firma rămâne deschisă până o confirmă */
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && state === 'gasit') { e.preventDefault(); confirma(); }
      if (e.key === 'ArrowDown' && state === 'gasit') { e.preventDefault(); var o = dd.querySelector('[data-firma]'); if (o) o.focus(); }
      if (e.key === 'Escape') inchide();
    });
    return {
      gata: function () { return state === 'ok' || state === 'neverificat'; },
      cui: function () { return cuiCurat(input.value); },
      forteaza: function () { if (state === 'scrie' || state === 'gol') verifica(true); },
      eroare: function (msg) { inchide(); set('gresit', msg, 'err'); }
    };
  }

  document.querySelectorAll('form.reserve').forEach(function (f) {
    var input = f.querySelector('.field.email input'), msg = f.querySelector('.form-msg'), btn = f.querySelector('.btn-cta');
    var doneBox = f.querySelector('.reserve-done'), doneEmail = f.querySelector('[data-done-email]');
    var plan = f.getAttribute('data-plan'), busy = false;
    var T = function (n, p) { if (window.track) window.track(n, p); }, formStarted = false;
    /* „Rezerv loc” e activ doar când în câmp e o adresă de email validă (și, la parteneri, firma e confirmată) */
    var cui = null;
    var sync = function () { btn.disabled = busy || !EMAIL_RE.test((input.value || '').trim()) || (cui && !cui.gata()); };
    if (f.classList.contains('has-cui')) cui = cuiField(f, function () { sync(); });
    input.addEventListener('focus', function () { if (window.antibot) window.antibot.pregateste(); if (formStarted) return; formStarted = true; T('waitlist_form_started', { plan: plan }); });
    input.addEventListener('input', function () { f.classList.remove('is-error'); msg.textContent = ''; msg.className = 'form-msg'; sync(); });
    input.addEventListener('change', sync);
    setTimeout(sync, 300); /* completarea automată a browserului nu declanșează mereu „input” */
    sync();
    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var email = (input.value || '').trim();
      if (cui && !cui.gata()) cui.forteaza();
      if (busy || !EMAIL_RE.test(email) || (cui && !cui.gata())) { sync(); return; }
      var done = function () {
        var st = window.track ? window.track.state : {}; T('waitlist_submitted', { plan: plan, had_calc_result: !!st.had_calc_result, had_search_result: !!st.had_search_result, calc_started: !!st.calc_started });
        if (window.gads && sbUrl) window.gads.conversie(plan); /* conversie Google Ads (doar cu acord la cookie-uri) */
        if (doneEmail) doneEmail.textContent = email;
        f.classList.add('is-done'); if (doneBox) doneBox.hidden = false;
      };
      if (!sbUrl || !sbKey) { done(); return; }
      busy = true; f.classList.add('is-busy'); sync(); btn.setAttribute('aria-busy', 'true');
      /* verificarea anti-robot (Turnstile) → Edge Function `rezerva` (verifică tokenul, apoi salvează înscrierea) */
      var AB = window.antibot;
      (AB ? AB.token(f, 'rezerva') : Promise.resolve(null)).catch(function (e) { e.antibot = true; throw e; }).then(function (tk) {
        var corp = { email: email, plan: plan, sursa: 'site:acces-timpuriu', ph_id: (window.track && window.track.distinctId()) || null, token: tk };
        if (cui) corp.cui = cui.cui();
        return fetch(sbUrl + '/functions/v1/rezerva', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': sbKey, 'Authorization': 'Bearer ' + sbKey },
          body: JSON.stringify(corp)
        });
      }).then(function (r) {
        if (r.ok) { done(); return; }
        return r.json().catch(function () { return {}; }).then(function (j) { var e = new Error('HTTP ' + r.status); e.body = j; throw e; });
      }).catch(function (e) {
          var txt = String((e && e.body && (e.body.error || e.body.message || e.body.hint)) || (e && e.message) || '');
          var cod = e && e.body && e.body.error;
          if (cui && (cod === 'deja_rezervat' || cod === 'firma_inactiva' || cod === 'cui_negasit' || cod === 'cui')) {
            T('waitlist_failed', { plan: plan, reason: cod });
            cui.eroare(cod === 'deja_rezervat' ? 'Firma are deja un loc rezervat. Verifică emailul folosit atunci sau scrie-ne dacă nu tu l-ai rezervat.'
              : cod === 'firma_inactiva' ? 'Firma apare inactivă la ANAF. Dacă e o greșeală, scrie-ne și verificăm.'
              : cod === 'cui_negasit' ? 'Nu am găsit firma la ANAF. Verifică CUI-ul pe o factură.' : 'CUI-ul nu pare corect. Verifică ultima cifră.');
            return;
          }
          var reason = e && e.antibot ? 'antibot' : /antibot/.test(txt) ? 'antibot_server' : /prea multe|rate|429/i.test(txt) ? 'rate_limited' : /email/i.test(txt) && /400/.test(String(e && e.message)) ? 'invalid_email' : 'network';
          T('waitlist_failed', { plan: plan, reason: reason });
          f.classList.add('is-error'); msg.className = 'form-msg err';
          msg.textContent = reason === 'antibot' ? window.antibot.mesaj(e)
            : reason === 'antibot_server' ? 'Verificarea anti-robot nu a trecut. Reîncarcă pagina și încearcă din nou.'
            : reason === 'rate_limited' ? 'Prea multe înscrieri de pe această conexiune. Încearcă din nou peste câteva minute.'
            : reason === 'invalid_email' ? 'Adresa de email nu pare validă. Verific-o și încearcă din nou.'
            : 'Nu am putut trimite acum. Încearcă din nou în câteva secunde.';
        })
        .finally(function () { busy = false; f.classList.remove('is-busy'); btn.removeAttribute('aria-busy'); sync(); });
    });
  });

  /* PostHog: secțiunea de acces timpuriu intră în ecran · CTA-ul din nav */
  var early2 = document.getElementById('acces-timpuriu');
  if (early2 && 'IntersectionObserver' in window) { var seen = false; var ioW = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting && !seen) { seen = true; if (window.track) window.track('waitlist_viewed', {}); ioW.disconnect(); } }); }, { threshold: 0.25 }); ioW.observe(early2); }
  var navCta = document.querySelector('.nav .nav-btn'); if (navCta) navCta.addEventListener('click', function () { if (window.track) window.track('hero_cta_clicked', { cta: 'nav_am_o_problema' }); });

  /* meniul de pe mobil / tabletă (Figma 2211:36299): hamburgerul deschide panoul; se închide la Escape, la click în afară sau pe un link */
  var burger = document.querySelector('.nav .burger'), mmenu = document.getElementById('meniu-mobil');
  if (burger && mmenu) {
    var setMenu = function (open, focusBack) {
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      burger.setAttribute('aria-label', open ? 'Închide meniul' : 'Deschide meniul');
      nav.classList.toggle('menu-open', open);
      if (open) { mmenu.hidden = false; requestAnimationFrame(function () { mmenu.classList.add('is-open'); }); }
      else { mmenu.classList.remove('is-open'); setTimeout(function () { if (!mmenu.classList.contains('is-open')) mmenu.hidden = true; }, reduce ? 0 : 220); }
      if (!open && focusBack) burger.focus();
    };
    burger.addEventListener('click', function () {
      var open = burger.getAttribute('aria-expanded') !== 'true';
      setMenu(open);
      if (open && window.track) window.track('mobile_menu_opened', {});
    });
    mmenu.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
    var mmBtn = mmenu.querySelector('.mm-btn');
    if (mmBtn) mmBtn.addEventListener('click', function () { if (window.track) window.track('hero_cta_clicked', { cta: 'menu_am_o_problema' }); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && burger.getAttribute('aria-expanded') === 'true') setMenu(false, true); });
    document.addEventListener('click', function (e) { if (burger.getAttribute('aria-expanded') === 'true' && !mmenu.contains(e.target) && !burger.contains(e.target)) setMenu(false); });
    window.matchMedia('(min-width: 1025px)').addEventListener('change', function (m) { if (m.matches) setMenu(false); });
  }

  /* fără internet: un service worker mic arată pagina „Nu ai internet” (offline.html) în loc de eroarea browserului */
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () {}); });
  }

  /* butoanele „Log in” etc. nu fac nimic deocamdată (fluxul de cont vine mai târziu) */
  document.querySelectorAll('[data-soon]').forEach(function (el) {
    el.addEventListener('click', function (ev) { ev.preventDefault(); });
  });
})();
