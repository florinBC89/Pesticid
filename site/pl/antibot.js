/* Pesticid — verificarea anti-robot (Cloudflare Turnstile) pentru „Rezerv loc” și „Raportează o problemă”.
   Aproape mereu e invizibilă (appearance: interaction-only): Cloudflare cere un click doar când traficul pare suspect.
   Scriptul Cloudflare se încarcă abia când omul începe să completeze un formular, nu la deschiderea paginii.
   Fără meta pesticid-turnstile (previzualizarea din Artifact) → nu se cere nimic. Tokenul e verificat pe server. */
(function () {
  var meta = document.querySelector('meta[name="pesticid-turnstile"]');
  var KEY = meta && meta.getAttribute('data-key');
  var incarcare = null;

  function incarca() {
    if (!KEY) return Promise.resolve(null);
    if (incarcare) return incarcare;
    incarcare = new Promise(function (res, rej) {
      if (window.turnstile) { res(window.turnstile); return; }
      window.__pesticidTs = function () { res(window.turnstile); };
      var s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__pesticidTs';
      s.async = true;
      s.onerror = function () { incarcare = null; rej(new Error('turnstile-load')); };
      document.head.appendChild(s);
    });
    return incarcare;
  }

  /* cutia widgetului: goală și fără loc în pagină până când Cloudflare chiar cere o interacțiune */
  function cutie(form) {
    var b = form.querySelector('.ts-box');
    if (b) return b;
    b = document.createElement('div');
    b.className = 'ts-box';
    var inainte = form.querySelector('.form-msg, .rep-msg');
    if (inainte) form.insertBefore(b, inainte); else form.appendChild(b);
    return b;
  }

  /* token(form, action) → Promise<string|null>; un token e valabil o singură dată, deci widgetul se resetează la fiecare trimitere */
  function token(form, action) {
    if (!KEY) return Promise.resolve(null);
    return incarca().then(function (ts) {
      var box = cutie(form), st = box.__ts || (box.__ts = {});
      return new Promise(function (res, rej) {
        st.res = res; st.rej = rej;
        var gata = function (fn, v) { var f = fn === 'res' ? st.res : st.rej; st.res = st.rej = null; box.classList.remove('is-on'); if (f) f(v); };
        if (st.id == null) {
          st.id = ts.render(box, {
            sitekey: KEY, action: action, execution: 'execute', appearance: 'interaction-only', size: 'flexible',
            callback: function (t) { gata('res', t); },
            'error-callback': function (cod) { gata('rej', new Error('turnstile-' + cod)); return true; },
            'timeout-callback': function () { gata('rej', new Error('turnstile-timeout')); },
            'before-interactive-callback': function () { box.classList.add('is-on'); },
            'after-interactive-callback': function () { box.classList.remove('is-on'); }
          });
        } else {
          ts.reset(st.id);
        }
        ts.execute(st.id);
      });
    });
  }

  /* mesajul pentru om când verificarea nu merge (de obicei un blocator de reclame sau internetul) */
  function mesaj(e) {
    var m = String((e && e.message) || '');
    if (/load/.test(m)) return 'Nie udało się załadować weryfikacji antyrobotowej. Jeśli używasz blokera reklam, wyłącz go dla tej strony i spróbuj ponownie.';
    return 'Weryfikacja antyrobotowa nie powiodła się. Spróbuj ponownie za kilka sekund.';
  }

  window.antibot = { token: token, pregateste: function () { incarca().catch(function () {}); }, mesaj: mesaj, activ: !!KEY };
})();
