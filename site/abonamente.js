/* AgroSphere — pagina „Abonamente”: comutatorul Lunar / Anual (Figma 2292:12017 / 2292:11398).
   Schimbă doar ce se vede (data-perioada pe secțiune); alegerea se ține minte în browser, dacă se poate. */
(function () {
  var sec = document.getElementById('abonamente');
  if (!sec) return;
  var btns = sec.querySelectorAll('.ab-toggle [data-p]');
  function alege(p, din) {
    sec.setAttribute('data-perioada', p);
    btns.forEach(function (b) { b.setAttribute('aria-checked', b.getAttribute('data-p') === p ? 'true' : 'false'); });
    try { localStorage.setItem('agrosphere.abonamente_perioada', p); } catch (e) { /* fără stocare: rămâne doar în pagină */ }
    if (din && window.track) window.track('pricing_period_toggled', { perioada: p });
  }
  btns.forEach(function (b) {
    b.addEventListener('click', function () { alege(b.getAttribute('data-p'), true); });
    b.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      var alt = b.getAttribute('data-p') === 'lunar' ? 'anual' : 'lunar';
      alege(alt, true);
      sec.querySelector('.ab-toggle [data-p="' + alt + '"]').focus();
    });
  });
  var salvat = null;
  try { salvat = localStorage.getItem('agrosphere.abonamente_perioada'); } catch (e) { /* ignorăm */ }
  if (salvat === 'anual' || salvat === 'lunar') alege(salvat, false);
})();
