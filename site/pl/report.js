/* Pesticid — „Raportează o problemă” (secțiunea #raporteaza, Figma 2156:38279).
   Fișierele se urcă direct din browser în bucket-ul privat Supabase `rapoarte`, cu link semnat cerut de la Edge Function
   `raport-problema`; la „Trimite” funcția verifică fișierele, salvează raportul, trimite emailul și scrie în Google Sheet.
   Limite (verificate și pe server): max 5 fișiere, 50 MB în total; JPG/PNG max 10 MB, MP4/MOV max 20 MB. */
(function () {
  var form = document.getElementById('rep');
  if (!form) return;
  var cfg = document.querySelector('meta[name="pesticid-raport"]') || document.querySelector('meta[name="pesticid-supabase"]');
  var SB = cfg && cfg.getAttribute('data-url'), KEY = cfg && cfg.getAttribute('data-key');
  var FN = SB ? SB + '/functions/v1/raport-problema' : '';
  var MIN_DESC = 10, MB = 1024 * 1024, MAX_FILES = 5, MAX_TOTAL = 50 * MB, MAX_IMG = 10 * MB, MAX_VID = 20 * MB, MAX_DESC = 2000, VIZIBILE = 3;
  var EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', mp4: 'video/mp4', mov: 'video/quicktime' };
  var TIP = { 'image/jpeg': 'img', 'image/png': 'img', 'video/mp4': 'vid', 'video/quicktime': 'vid' };
  var EMAIL_RE = /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)*\.[a-z]{2,}$/i;
  var T = function (n, p) { if (window.track) window.track(n, p || {}); };
  var $ = function (id) { return document.getElementById(id); };

  var emailF = $('r-email-f'), email = $('r-email'), emailX = emailF.querySelector('.x');
  var subS = $('r-subiect-s'), subF = $('r-subiect-f'), subT = $('r-subiect-t'), subDd = subS.querySelector('.dd'), subList = $('r-subiect-list');
  var desc = $('r-desc'), area = desc.closest('.area'), hint = $('r-desc-h');
  var att = $('r-att'), attList = $('r-att-list'), attErr = att.querySelector('.att-err'), attBtn = $('r-att-btn'), attMore = $('r-att-more'), fileIn = $('r-file');
  var go = $('r-go'), msg = $('r-msg'), done = $('r-done'), hp = form.querySelector('.hp');

  var uuid = function () {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  };
  var draft = uuid(), subiect = '', files = [], extins = false, busy = false, started = false;

  function start() { if (window.antibot) window.antibot.pregateste(); if (started) return; started = true; T('report_form_started'); }
  [email, desc].forEach(function (el) { el.addEventListener('focus', start); });

  /* ---------- email (câmp ca în calculator, cu × pentru ștergere) ---------- */
  function syncEmail() { emailX.hidden = !email.value; }
  email.addEventListener('input', function () { emailF.classList.remove('is-bad'); msg.textContent = ''; syncEmail(); sync(); });
  email.addEventListener('blur', function () { var v = email.value.trim(); emailF.classList.toggle('is-bad', !!v && !EMAIL_RE.test(v)); });
  emailX.addEventListener('click', function (ev) { ev.preventDefault(); email.value = ''; syncEmail(); emailF.classList.remove('is-bad'); email.focus(); sync(); });

  /* ---------- subiect: listă de alegeri (aceeași listă derulantă ca în calculator) ---------- */
  var opts = Array.prototype.slice.call(subList.querySelectorAll('li.opt')), hi = -1;
  function deschide(on) {
    subDd.hidden = !on; subS.classList.toggle('is-open', on); subF.classList.toggle('is-open', on); subF.setAttribute('aria-expanded', on ? 'true' : 'false');
    if (on) { hi = Math.max(0, opts.findIndex(function (o) { return o.getAttribute('data-v') === subiect; })); marcheaza(); }
  }
  function marcheaza() { opts.forEach(function (o, i) { o.classList.toggle('is-hi', i === hi); }); }
  function alege(o) {
    subF.classList.remove('is-bad'); msg.textContent = '';
    subiect = o.getAttribute('data-v'); subT.textContent = o.textContent.trim(); subT.classList.remove('ph'); subF.classList.add('is-set');
    opts.forEach(function (x) { x.setAttribute('aria-selected', x === o ? 'true' : 'false'); });
    deschide(false); subF.focus(); start(); sync();
  }
  subF.addEventListener('click', function () { deschide(subDd.hidden); });
  subF.addEventListener('keydown', function (ev) {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); if (subDd.hidden) { deschide(true); return; } hi = (hi + (ev.key === 'ArrowDown' ? 1 : opts.length - 1)) % opts.length; marcheaza(); }
    else if ((ev.key === 'Enter' || ev.key === ' ') && !subDd.hidden && hi >= 0) { ev.preventDefault(); alege(opts[hi]); }
    else if (ev.key === 'Escape') deschide(false);
  });
  opts.forEach(function (o, i) {
    o.addEventListener('mousedown', function (ev) { ev.preventDefault(); });
    o.addEventListener('click', function () { alege(o); });
    o.addEventListener('mouseenter', function () { hi = i; marcheaza(); });
  });
  document.addEventListener('click', function (ev) { if (!subDd.hidden && !subS.contains(ev.target)) deschide(false); });

  /* ---------- descriere: contor de caractere, eroare peste 2000 ---------- */
  function syncDesc() {
    var n = desc.value.length, peste = n > MAX_DESC;
    area.classList.toggle('is-bad', peste);
    hint.classList.toggle('is-bad', peste); hint.classList.toggle('is-typing', !peste && n > 0);
    var util = desc.value.trim().length;
    hint.textContent = !n ? 'Minimum ' + MIN_DESC + ', maksimum ' + MAX_DESC + ' znaków' : (util < MIN_DESC ? n + '/' + MAX_DESC + ' znaków · minimum ' + MIN_DESC : n + '/' + MAX_DESC + ' znaków');
  }
  desc.addEventListener('input', function () { msg.textContent = ''; syncDesc(); sync(); });

  /* ---------- atașamente ---------- */
  var fmtMB = function (b) { return (b / MB).toLocaleString('ro-RO', { maximumFractionDigits: 1 }) + ' MB'; };
  function tipDin(f) { if (TIP[f.type]) return f.type; return EXT[(f.name.split('.').pop() || '').toLowerCase()] || ''; }
  function eroareAtt(t) { attErr.textContent = t || ''; attErr.hidden = !t; att.classList.toggle('is-bad', !!t || files.some(function (f) { return f.st === 'err'; })); }
  function total() { return files.reduce(function (s, f) { return s + (f.st === 'err' ? 0 : f.file.size); }, 0); }

  function render() {
    attList.hidden = !files.length;
    files.forEach(function (f, i) { f.el.classList.toggle('is-hidden', !extins && i >= VIZIBILE); });
    attMore.hidden = files.length <= VIZIBILE;
    attMore.textContent = extins ? 'Pokaż mniej' : 'Pokaż więcej (+' + (files.length - VIZIBILE) + ')';
    attBtn.disabled = files.length >= MAX_FILES || busy;
    att.classList.toggle('is-bad', !attErr.hidden || files.some(function (f) { return f.st === 'err'; }));
    sync();
  }
  attMore.addEventListener('click', function () { extins = !extins; render(); });
  attBtn.addEventListener('click', function () { start(); fileIn.click(); });

  function tile(f) {
    var el = document.createElement('div'); el.className = 'att-tile is-up';
    var url = URL.createObjectURL(f.file); f.obj = url;
    if (f.kind === 'img') { var im = new Image(); im.alt = f.file.name; im.src = url; el.appendChild(im); }
    else {
      var v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'metadata'; v.src = url + '#t=0.1'; el.appendChild(v);
      var b = document.createElement('span'); b.className = 'vid'; b.textContent = 'Wideo'; el.appendChild(b);
      v.addEventListener('loadedmetadata', function () { if (isFinite(v.duration)) { var s = Math.round(v.duration); b.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); } });
    }
    var bar = document.createElement('span'); bar.className = 'bar'; bar.innerHTML = '<i></i>'; el.appendChild(bar);
    var rm = document.createElement('button'); rm.type = 'button'; rm.className = 'rm'; rm.setAttribute('aria-label', 'Usuń ' + f.file.name);
    rm.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>';
    rm.addEventListener('click', function () { elimina(f); });
    el.appendChild(rm); el.title = f.file.name + ' · ' + fmtMB(f.file.size);
    f.el = el; f.bar = bar.firstChild; attList.appendChild(el);
  }
  function elimina(f) {
    if (f.xhr) f.xhr.abort();
    files = files.filter(function (x) { return x !== f; });
    if (f.el) f.el.remove(); if (f.obj) URL.revokeObjectURL(f.obj);
    if (f.path && FN) fetch(FN, { method: 'POST', headers: hdr(), body: JSON.stringify({ action: 'sterge', draft: draft, path: f.path }) }).catch(function () {});
    eroareAtt(''); render();
  }
  function ro(e, implicit) { return e && e.ro && e.message ? e.message : implicit; }
  function eroare(m) { var e = new Error(m); e.ro = true; return e; }
  function hdr() { return { 'Content-Type': 'application/json', apikey: KEY, Authorization: 'Bearer ' + KEY }; }

  function urca(f) {
    f.st = 'up'; render();
    if (!FN) { f.st = 'ok'; f.el.classList.remove('is-up'); f.bar.parentNode.remove(); render(); return; } // mod demo, fără Supabase
    fetch(FN, { method: 'POST', headers: hdr(), body: JSON.stringify({ action: 'url', limba: 'pl', draft: draft, nume: f.file.name, tip: f.tip, marime: f.file.size }) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw eroare(j.mesaj || 'Nie udało się przesłać pliku. Spróbuj ponownie.'); return j; }); })
      .then(function (j) {
        f.path = j.path;
        return new Promise(function (ok, fail) {
          var fd = new FormData(); fd.append('cacheControl', '3600'); fd.append('', new Blob([f.file], { type: f.tip }), f.file.name);
          var x = new XMLHttpRequest(); f.xhr = x;
          x.open('PUT', j.url); x.setRequestHeader('apikey', KEY); x.setRequestHeader('x-upsert', 'false');
          x.upload.onprogress = function (e) { if (e.lengthComputable) f.bar.style.width = Math.round(e.loaded / e.total * 100) + '%'; };
          x.onload = function () { f.xhr = null; (x.status >= 200 && x.status < 300) ? ok() : fail(eroare('Nie udało się przesłać pliku. Spróbuj ponownie.')); };
          x.onerror = function () { f.xhr = null; fail(eroare('Nie udało się przesłać pliku. Sprawdź połączenie z internetem i spróbuj ponownie.')); };
          x.onabort = function () { f.xhr = null; fail(null); };
          x.send(fd);
        });
      })
      .then(function () { f.st = 'ok'; f.el.classList.remove('is-up'); if (f.bar) f.bar.parentNode.remove(); T('report_attachment_added', { tip: f.kind }); render(); })
      .catch(function (e) {
        if (!e) return; // anulat de om (a apăsat ×)
        f.st = 'err'; f.el.classList.remove('is-up'); f.el.classList.add('is-err'); if (f.bar) f.bar.parentNode.remove();
        eroareAtt(ro(e, 'Nie udało się przesłać pliku. Sprawdź połączenie z internetem i spróbuj ponownie.')); T('report_failed', { reason: 'upload' }); render();
      });
  }

  fileIn.addEventListener('change', function () {
    var noi = Array.prototype.slice.call(fileIn.files || []); fileIn.value = '';
    var probleme = [];
    noi.forEach(function (file) {
      var tip = tipDin(file), kind = TIP[tip];
      if (!kind) { probleme.push('„' + file.name + '”: akceptujemy tylko JPG, PNG, MP4 i MOV.'); return; }
      if (file.size > (kind === 'img' ? MAX_IMG : MAX_VID)) { probleme.push('„' + file.name + '” jest za duży (maks. ' + (kind === 'img' ? 10 : 20) + 'MB).'); return; }
      if (files.length >= MAX_FILES) { probleme.push('Możesz załączyć maksymalnie ' + MAX_FILES + ' plików.'); return; }
      if (total() + file.size > MAX_TOTAL) { probleme.push('Pliki przekraczają łącznie 50MB.'); return; }
      var f = { file: file, tip: tip, kind: kind, st: 'new' }; files.push(f); tile(f); urca(f);
    });
    eroareAtt(probleme.filter(function (p, i) { return probleme.indexOf(p) === i; }).join(' '));
    if (files.length > VIZIBILE && noi.length) extins = false;
    render();
  });

  /* ---------- „Trimite”: activ doar cu email valid, subiect, descriere și fără fișiere în curs de urcare ---------- */
  function gata() {
    var n = desc.value.trim().length;
    return EMAIL_RE.test(email.value.trim()) && !!subiect && n >= MIN_DESC && desc.value.length <= MAX_DESC && !files.some(function (f) { return f.st === 'up' || f.st === 'new'; }) && !busy;
  }
  /* butonul arată inactiv până e totul completat, dar rămâne apăsabil: la click spunem exact ce lipsește */
  function sync() { var ok = gata(); go.disabled = busy; go.classList.toggle('ghost', !ok); go.setAttribute('aria-disabled', ok ? 'false' : 'true'); }
  function ceLipseste() {
    var lipsa = [], primul = null, v = email.value.trim();
    if (!EMAIL_RE.test(v)) { emailF.classList.add('is-bad'); lipsa.push(v ? 'poprawny adres e-mail' : 'adres e-mail'); primul = primul || email; }
    if (!subiect) { subF.classList.add('is-bad'); lipsa.push('temat'); primul = primul || subF; }
    if (!desc.value.trim()) { area.classList.add('is-bad'); hint.classList.add('is-bad'); hint.textContent = 'Opis jest wymagany'; lipsa.push('opis'); primul = primul || desc; }
    else if (desc.value.trim().length < MIN_DESC) { area.classList.add('is-bad'); hint.classList.add('is-bad'); lipsa.push('opis o długości co najmniej ' + MIN_DESC + ' znaków'); primul = primul || desc; }
    else if (desc.value.length > MAX_DESC) { lipsa.push('opis o długości maksymalnie ' + MAX_DESC + ' znaków'); primul = primul || desc; }
    var t = lipsa.length ? 'Podaj ' + lipsa.join(', ').replace(/, ([^,]*)$/, ' i $1') + '.' : '';
    if (files.some(function (f) { return f.st === 'up' || f.st === 'new'; })) t = (t ? t + ' ' : '') + 'Poczekaj, aż zakończy się przesyłanie plików.';
    msg.textContent = t;
    if (primul) primul.focus();
    T('report_failed', { reason: 'incomplet' });
  }

  function txt(id) { var f = document.getElementById(id); if (!f || !f.classList.contains('is-set')) return ''; var t = f.querySelector('.txt'); return t ? t.textContent.trim() : ''; }
  function val(id) { var el = document.getElementById(id); return el && el.value ? el.value.trim() : ''; }
  function context() {
    var tab = document.querySelector('.tabs .tab.is-on');
    var doza = val('c-doza'), u = document.getElementById('c-doza-u');
    return {
      pagina: location.origin + location.pathname, dispozitiv: navigator.userAgent, ecran: innerWidth + '×' + innerHeight + ' @' + (window.devicePixelRatio || 1) + 'x',
      limba: navigator.language || '', tab: tab ? tab.textContent.trim() : '',
      produs: txt('f-produs'), cultura: txt('f-cultura'), tinta: txt('f-tinta'),
      doza: doza ? doza + (u ? ' ' + u.textContent.trim() : '') : '', suprafata: val('c-ha'), apa: val('c-apa')
    };
  }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (busy) return;
    if (!gata()) { ceLipseste(); return; }
    var ok = files.filter(function (f) { return f.st === 'ok' && f.path; });
    var body = { action: 'trimite', limba: 'pl', draft: draft, email: email.value.trim(), subiect: subiect, descriere: desc.value.trim(), fisiere: ok.map(function (f) { return f.path; }), context: context(), ph_id: (window.track && window.track.distinctId && window.track.distinctId()) || null, hp: hp.value };
    var fin = function (nr) {
      T('report_submitted', { subiect: subiect, fisiere: ok.length });
      $('r-done-nr').textContent = '#' + nr; $('r-done-email').textContent = body.email;
      form.classList.add('is-done'); done.hidden = false;
      try { form.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { form.scrollIntoView(); }
    };
    if (!FN) { fin('DEMO00'); return; }
    busy = true; form.classList.add('is-busy'); msg.textContent = ''; sync(); go.querySelector('span').textContent = 'Wysyłanie…';
    var AB = window.antibot;
    (AB ? AB.token(form, 'raport') : Promise.resolve(null)).catch(function (e) { e.code = 'antibot'; e.mesajRo = AB.mesaj(e); throw e; })
      .then(function (tk) { body.token = tk; return fetch(FN, { method: 'POST', headers: hdr(), body: JSON.stringify(body) }); })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = eroare(j.mesaj || 'Nie udało się wysłać zgłoszenia. Spróbuj ponownie.'); e.code = j.error || r.status; throw e; } return j; }); })
      .then(function (j) { fin(j.nr); })
      .catch(function (e) {
        T('report_failed', { reason: String(e.code || 'network') });
        msg.textContent = e.mesajRo || ro(e, 'Nie udało się wysłać zgłoszenia. Sprawdź połączenie z internetem i spróbuj ponownie.');
      })
      .finally(function () { busy = false; form.classList.remove('is-busy'); go.querySelector('span').textContent = 'Wyślij'; sync(); });
  });

  $('r-again').addEventListener('click', function () {
    files.forEach(function (f) { if (f.obj) URL.revokeObjectURL(f.obj); });
    files = []; attList.innerHTML = ''; extins = false; draft = uuid();
    desc.value = ''; syncDesc(); subiect = ''; subT.textContent = 'Wybierz temat problemu'; subT.classList.add('ph'); subF.classList.remove('is-set');
    opts.forEach(function (x) { x.removeAttribute('aria-selected'); });
    eroareAtt(''); msg.textContent = ''; form.classList.remove('is-done'); done.hidden = true; render(); desc.focus();
  });

  syncEmail(); syncDesc(); render();
})();
