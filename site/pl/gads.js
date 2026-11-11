/* Pesticid — Google Ads: măsoară câte înscrieri („Rezerv loc”) aduc reclamele.
   - Se activează doar cu meta pesticid-gads (data-id="AW-…", data-label="…"); fără ea nu face nimic.
   - Tagul Google se încarcă DOAR după ce omul apasă „Accept” în bannerul de cookie-uri (fără acord: niciun cookie, nicio cerere la Google).
   - Acordul vechi (dat înainte ca bannerul să pomenească reclamele) nu contează: cere pesticid.consent.ads = yes.
   - Fără remarketing / reclame personalizate (ad_personalization: denied): doar numărăm conversiile. */
(function () {
  var meta = document.querySelector('meta[name="pesticid-gads"]');
  var ID = meta && meta.getAttribute('data-id'), LABEL = meta && meta.getAttribute('data-label');
  var activ = !!(ID && /^AW-\d+$/.test(ID));
  var pornit = false, coada = [];

  function acord() { try { return localStorage.getItem('pesticid.consent') === 'yes' && localStorage.getItem('pesticid.consent.ads') === 'yes'; } catch (e) { return false; } }
  function porneste() {
    if (!activ || pornit || !acord()) return;
    pornit = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('consent', 'default', { ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'denied', analytics_storage: 'denied' });
    window.gtag('js', new Date());
    window.gtag('config', ID, { allow_ad_personalization_signals: false });
    var s = document.createElement('script');
    s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(ID);
    document.head.appendChild(s);
    coada.forEach(function (f) { f(); }); coada = [];
  }

  /* conversia: o înscriere reușită pe lista de așteptare */
  function conversie(plan) {
    if (!activ || !LABEL) return;
    var trimite = function () { window.gtag('event', 'conversion', { send_to: ID + '/' + LABEL, plan: plan }); };
    if (pornit) trimite(); else if (acord()) { coada.push(trimite); porneste(); }
  }

  document.addEventListener('pesticid:consent', porneste);
  if (document.readyState === 'complete') porneste(); else window.addEventListener('load', porneste);
  window.gads = { conversie: conversie, activ: activ };
})();
