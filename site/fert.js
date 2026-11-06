/* AgroSphere — Plan de fertilizare (model simplificat al Ministerului Mediului, doar azot).
   Același aspect ca „Calculator pesticide”, alt mecanism: nu căutăm doza într-un tabel, ci facem bilanțul de azot.
   Planificat: bloc fizic, parcelă, suprafață, cultură, N planificat (kg s.a./ha) — cu ajutor din consumurile specifice ICPA.
   Realizat: aplicări de îngrășăminte minerale din lista MADR → kg N/ha (cantitate × % N), total, avertismente.
   Planul (mai multe parcele) se ține în browser și se descarcă în formatul oficial (14 coloane), prin tipărire ca PDF.
   Date: <script type="application/json" id="fert-data"> (previzualizare) sau Supabase, tabelul public `fertilizanti`. */
(function () {
  'use strict';
  var root = document.getElementById('fp');
  if (!root) return;
  var $ = function (s) { return document.getElementById(s); };
  var T = function (n, p) { if (window.track) window.track(n, p); };
  var KEY = 'agrosphere.plan_fertilizare';
  var MAX = 10;

  var fmt = function (n, d) { return new Intl.NumberFormat('ro-RO', { maximumFractionDigits: d == null ? 1 : d }).format(n); };
  var num = function (s) { var v = parseFloat(String(s || '').replace(/\s/g, '').replace(',', '.')); return isFinite(v) ? v : null; };
  var norm = function (s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  /* consumuri specifice de azot, kg N / t recoltă principală (+ secundară) — ICPA, Codul de bune practici, tabelul 1.
     leg: leguminoase — cea mai mare parte din azot vine din fixarea biologică, nu din îngrășăminte */
  var CULTURI = [
    ['Grâu de toamnă', 26.5], ['Orz și orzoaică', 23.0], ['Porumb boabe', 27.5], ['Floarea-soarelui', 36.5],
    ['Rapiță', 51.5], ['Soia', 70.0, 1], ['Porumb pentru siloz', 6.5], ['Secară', 27.5], ['Ovăz', 28.5],
    ['Sfeclă de zahăr', 4.9], ['Sfeclă furajeră', 3.8], ['Cartof', 5.2], ['Mazăre boabe', 61.0, 1], ['Fasole boabe', 59.5, 1],
    ['In pentru semințe', 59.0], ['In pentru fuior', 11.0], ['Cânepă', 10.0], ['Lucernă (masă verde)', 8.0, 1],
    ['Trifoi roșu (masă verde)', 6.5, 1], ['Pajiște naturală', 6.5], ['Tomate', 2.9], ['Varză de toamnă', 3.5],
    ['Măr', 1.6], ['Viță de vie (struguri de vin)', 6.5]
  ].map(function (c) { return { nume: c[0], csp: c[1], leg: !!c[2], k: norm(c[0]) }; });
  /* cele mai folosite îngrășăminte cu azot, primele în listă când câmpul e gol */
  var POPULARE = ['1.3', '1.1', '1.2', '7.2', '1.4', '1.16', '4.1', '4.2', '4.4', '1.20'];

  var F = [], FBY = {};
  var plan = [];
  var apl = [];
  var planAuto = false;

  /* ---------- combo simplu (aceleași clase ca în calculatorul de pesticide) ---------- */
  var deschis = null;
  function inchide() { if (deschis) { deschis.dd.hidden = true; deschis.field.classList.remove('is-open'); deschis.sel.classList.remove('is-open'); deschis.input.setAttribute('aria-expanded', 'false'); deschis = null; } }
  document.addEventListener('mousedown', function (e) { if (deschis && !deschis.sel.contains(e.target)) inchide(); });
  function Combo(sel, o) {
    var c = { sel: sel, field: sel.querySelector('.field'), input: sel.querySelector('input'), dd: sel.querySelector('.dd'), list: sel.querySelector('.plist'), hits: [], hi: -1, o: o };
    function paint() {
      var ul = c.list; ul.innerHTML = '';
      if (!c.hits.length) { ul.innerHTML = '<li class="empty">' + esc(o.empty) + '</li>'; }
      else {
        if (c.head) { var h = document.createElement('li'); h.className = 'hd'; h.textContent = c.head; ul.appendChild(h); }
        c.hits.forEach(function (it, i) {
          var li = document.createElement('li'); li.className = 'opt' + (i === c.hi ? ' is-hi' : ''); li.setAttribute('role', 'option');
          li.innerHTML = '<span class="nm"><span>' + esc(it.label) + '</span></span>' + (it.tag ? '<span class="tag xs ' + (it.tagCls || 'muted') + '">' + esc(it.tag) + '</span>' : '');
          li.addEventListener('mousedown', function (ev) { ev.preventDefault(); pick(it); });
          ul.appendChild(li);
        });
        if (c.more) { var m = document.createElement('li'); m.className = 'more'; m.textContent = '… încă ' + c.more + '. Scrie ca să restrângi lista.'; ul.appendChild(m); }
      }
      if (deschis && deschis !== c) inchide();
      c.dd.hidden = false; c.field.classList.add('is-open'); c.sel.classList.add('is-open'); c.input.setAttribute('aria-expanded', 'true'); deschis = c;
    }
    function render() { var r = o.options(c.input.value); c.hits = r.items.slice(0, MAX); c.more = Math.max(0, r.items.length - c.hits.length); c.head = r.head || ''; c.hi = c.hits.length && c.input.value ? 0 : -1; paint(); }
    function pick(it) { c.input.value = it.label; inchide(); o.onPick(it); }
    c.input.addEventListener('focus', function () { if (mobil() && o.picker) { c.input.blur(); deschidePicker(c); return; } render(); });
    c.field.addEventListener('click', function (ev) { if (mobil() && o.picker) { ev.preventDefault(); deschidePicker(c); } });
    c.input.addEventListener('input', function () { if (o.onType) o.onType(c.input.value); render(); });
    c.input.addEventListener('keydown', function (ev) {
      if (c.dd.hidden) { if (ev.key === 'ArrowDown') { render(); ev.preventDefault(); } return; }
      if (ev.key === 'ArrowDown') { c.hi = (c.hi + 1) % c.hits.length; paint(); ev.preventDefault(); }
      else if (ev.key === 'ArrowUp') { c.hi = (c.hi - 1 + c.hits.length) % c.hits.length; paint(); ev.preventDefault(); }
      else if (ev.key === 'Enter') { if (c.hits[c.hi]) { pick(c.hits[c.hi]); ev.preventDefault(); } }
      else if (ev.key === 'Escape' || ev.key === 'Tab') inchide();
    });
    return c;
  }

  /* ---------- pe telefon: selectorul pe tot ecranul (același ca în calculatorul de pesticide și în căutare) ---------- */
  var mq = window.matchMedia('(max-width: 700px)');
  function mobil() { return mq.matches && !!document.getElementById('spick'); }
  var ICO = {
    wheat: '<path d="M12 21V9M12 9c-3 0-5-2-5-5 3 0 5 2 5 5zM12 9c3 0 5-2 5-5-3 0-5 2-5 5zM12 15c-3 0-5-2-5-5 3 0 5 2 5 5zM12 15c3 0 5-2 5-5-3 0-5 2-5 5z"/>',
    sac: '<path d="M8 7h8l2 13H6z"/><path d="M9 7c0-2 1.3-3 3-3s3 1 3 3"/><path d="M10 13h4"/>'
  };
  var ico = function (n) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICO[n] + '</svg>'; };
  var sp = null, spC = null, spHits = [], spTot = false, spLim = 40;
  function sp$() {
    if (sp) return sp;
    var el = document.getElementById('spick');
    sp = { el: el, title: $('sp-title'), lbl: $('sp-l'), ico: $('sp-i'), input: $('sp-in'), x: $('sp-x'), list: $('sp-list'), go: $('sp-go') };
    sp.input.addEventListener('input', randeazaPicker);
    sp.input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') inchidePicker();
      else if (ev.key === 'Enter') { ev.preventDefault(); var b = sp.list.querySelector('.schip[data-id]') || sp.list.querySelector('.schip[data-custom]'); if (b) b.click(); }
    });
    sp.x.addEventListener('click', function () { sp.input.value = ''; randeazaPicker(); sp.input.focus(); });
    $('sp-back').addEventListener('click', inchidePicker);
    sp.list.addEventListener('click', function (ev) {
      var m = ev.target.closest('.schip.more'); if (m) { spTot = true; randeazaPicker(); return; }
      var b = ev.target.closest('.schip'); if (!b || !spC) return;
      var c = spC, q = sp.input.value.trim();
      if (b.hasAttribute('data-custom')) { inchidePicker(); c.input.value = q; if (c.o.onType) c.o.onType(q); return; }
      var it = spHits[Number(b.getAttribute('data-id'))]; inchidePicker(); if (it) { c.input.value = it.label; c.o.onPick(it); }
    });
    return sp;
  }
  function deschidePicker(c) {
    var s = sp$(), P = c.o.picker; spC = c; spTot = false;
    s.title.textContent = P.title; s.lbl.textContent = P.label; s.ico.innerHTML = ico(P.ico); s.input.placeholder = P.ph; s.input.value = '';
    s.go.hidden = true; s.el.hidden = false; document.documentElement.classList.add('is-locked');
    randeazaPicker(); s.input.focus();
  }
  function inchidePicker() { if (!sp || sp.el.hidden) return; sp.el.hidden = true; document.documentElement.classList.remove('is-locked'); spC = null; }
  function chips(items, start) { return items.map(function (it, i) { return '<button type="button" class="schip" data-id="' + (start + i) + '">' + ico(spC.o.picker.ico) + '<span>' + esc(it.label) + '</span>' + (it.tag ? '<small>' + esc(it.tag) + '</small>' : '') + '</button>'; }).join(''); }
  function randeazaPicker() {
    if (!spC) return;
    var q = sp.input.value, P = spC.o.picker, r = spC.o.options(q), h = '';
    spHits = r.items.slice();
    sp.x.hidden = !q;
    if (norm(q)) {
      var vis = spTot ? spHits : spHits.slice(0, spLim);
      if (spHits.length) h += '<div class="sgrp"><div class="hd">Potriviri pentru „' + esc(q.trim()) + '”<small>' + spHits.length + '</small></div><div class="swrap">' + chips(vis, 0) + (spHits.length > vis.length ? '<button type="button" class="schip more">… încă ' + (spHits.length - vis.length) + '</button>' : '') + '</div></div>';
      else if (!P.custom) h += '<p class="empty">' + esc(spC.o.empty) + '</p>';
      /* cultura poate fi și una care nu e în listă: o păstrăm așa cum a scris-o omul */
      if (P.custom && !spHits.some(function (it) { return norm(it.label) === norm(q); })) h += '<div class="sgrp"><div class="hd">Altă cultură</div><div class="swrap"><button type="button" class="schip" data-custom="1">' + ico(P.ico) + '<span>Folosește „' + esc(q.trim()) + '”</span></button></div></div>';
    } else {
      h += '<div class="sgrp"><div class="hd">' + esc(r.head || 'Toate') + '<small>' + spHits.length + '</small></div><div class="swrap">' + chips(spHits, 0) + '</div></div>';
      if (P.toate) {
        var all = P.toate(), lim = spTot ? all.length : 10, start = spHits.length;
        spHits = spHits.concat(all.slice(0, lim));
        h += '<div class="sgrp"><div class="hd">' + esc(P.toateTitlu) + '<small>' + all.length + '</small></div><div class="swrap">' + chips(all.slice(0, lim), start) + (all.length > lim ? '<button type="button" class="schip more">… încă ' + (all.length - lim) + '</button>' : '') + '</div></div>';
      }
    }
    sp.list.innerHTML = h;
  }

  /* ---------- date ---------- */
  function incarca() {
    var el = document.getElementById('fert-data');
    if (el) { try { return Promise.resolve(JSON.parse(el.textContent)); } catch (e) { /* cade pe Supabase */ } }
    var m = document.querySelector('meta[name="pesticid-supabase"]');
    if (!m) return Promise.reject(new Error('fără sursă de date'));
    var url = m.getAttribute('data-url') + '/rest/v1/fertilizanti?select=nr_madr,denumire,n,unitate_npk,forma,categorie_nr,productie_oprita&n=gt.0&unitate_npk=in.(%25,g/l)&order=id';
    var k = m.getAttribute('data-key');
    return fetch(url, { headers: { apikey: k, Authorization: 'Bearer ' + k } }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (rows) { return rows.map(function (r) { return [r.nr_madr, r.denumire, Number(r.n), r.unitate_npk, r.forma, r.categorie_nr, r.productie_oprita ? 1 : 0]; }); });
  }
  function pregateste(rows) {
    F = rows.map(function (r) { return { nr: r[0], nume: r[1], n: r[2], u: r[3], forma: r[4], cat: r[5], oprit: !!r[6], k: norm(r[1]) }; })
      .filter(function (f) { return f.n > 0 && (f.u === '%' || f.u === 'g/l'); });
    F.forEach(function (f) { FBY[f.nr] = f; });
    $('fp-hint').innerHTML = 'Model simplificat · <b>azot (N)</b> · ' + F.length + ' îngrășăminte MADR';
  }
  var lichid = function (f) { return f.u === 'g/l'; };
  var unitCant = function (f) { return f && lichid(f) ? 'L/ha' : 'kg/ha'; };
  var tagF = function (f) { return f.u === '%' ? fmt(f.n, 2) + '% N' : fmt(f.n, 1) + ' g/l N'; };
  /* kg N/ha dintr-o cantitate de produs: kg/ha × %N / 100, sau L/ha × g/l / 1000 */
  var kgN = function (f, q) { return f && q ? (lichid(f) ? q * f.n / 1000 : q * f.n / 100) : 0; };
  var cantPentru = function (f, n) { return lichid(f) ? n * 1000 / f.n : n * 100 / f.n; };

  /* ---------- planificat ---------- */
  var cultSel = null, cult = Combo($('fp-s-cult'), {
    empty: 'Nicio cultură găsită. Poți păstra ce ai scris.',
    picker: { title: 'Alege cultura', label: 'Cultura', ph: 'Scrie sau alege cultura…', ico: 'wheat', custom: true },
    options: function (q) { var k = norm(q); var it = CULTURI.filter(function (c) { return !k || c.k.indexOf(k) >= 0; }).map(function (c) { return { label: c.nume, c: c, tag: c.leg ? 'leguminoasă' : fmt(c.csp, 1) + ' kg N/t', tagCls: 'muted' }; }); return { items: it, head: k ? '' : 'Consum specific de azot (ICPA)' }; },
    onPick: function (it) { cultSel = it.c; sugereaza(); actualizeaza(); },
    onType: function () { cultSel = null; sugereaza(); actualizeaza(); }
  });
  function sugereaza() {
    var rec = num($('fp-rec').value), msg = $('fp-plan-msg'), plan = $('fp-plan');
    msg.className = 'doza-msg'; msg.textContent = '';
    if (!cultSel) return;
    if (cultSel.leg) { msg.className = 'doza-msg warn'; msg.textContent = cultSel.nume + ' e leguminoasă: își fixează singură cea mai mare parte din azot, de obicei nu are nevoie de mult N.'; return; }
    if (!rec) { msg.textContent = 'Scrie recolta scontată ca să-ți propunem necesarul de azot (' + fmt(cultSel.csp, 1) + ' kg N pe tona de recoltă).'; return; }
    var nc = Math.round(rec * cultSel.csp);
    if (!plan.value || planAuto) { plan.value = String(nc); planAuto = true; }
    msg.innerHTML = 'Necesar orientativ: ' + fmt(rec, 2) + ' t/ha × ' + fmt(cultSel.csp, 1) + ' kg N/t = <b>' + nc + ' kg N/ha</b> (consum specific ICPA). Scade azotul din sol și de la cultura premergătoare, dacă ai studiu agrochimic.';
  }
  $('fp-rec').addEventListener('input', function () { sugereaza(); actualizeaza(); });
  $('fp-plan').addEventListener('input', function () { planAuto = false; actualizeaza(); });
  ['fp-ha', 'fp-bloc', 'fp-parc'].forEach(function (id) { $(id).addEventListener('input', actualizeaza); });

  /* ---------- realizat: aplicări ---------- */
  function aplicareNoua() { apl.push({ f: null, q: null, d1: '', d2: '' }); deseneazaAplicari(); }
  function deseneazaAplicari() {
    var box = $('fp-apl'); box.innerHTML = '';
    apl.forEach(function (a, i) {
      var div = document.createElement('div'); div.className = 'fp-a';
      div.innerHTML =
        '<div class="fp-a-top"><b>Aplicarea ' + (i + 1) + '</b>' + (apl.length > 1 ? '<button type="button" class="fp-link fp-del">Șterge</button>' : '') + '</div>' +
        '<div class="sel"><label class="field has-input"><span class="col"><small>Îngrășământ mineral</small><span class="val"><input type="text" autocomplete="off" spellcheck="false" placeholder="Caută: uree, azotat de amoniu, UAN…" role="combobox" aria-expanded="false"></span></span><i class="chev" aria-hidden="true"></i></label><div class="dd" hidden><ul class="plist" role="listbox"></ul></div></div>' +
        '<div class="row"><label class="field has-input has-unit fp-q"><span class="col"><small>Cantitate</small><span class="val"><input type="text" inputmode="decimal" autocomplete="off" placeholder="ex. 300"><b class="unit">kg/ha</b></span></span></label>' +
        '<div class="fp-dsel"><label class="field has-input fp-d"><span class="col"><small>Perioada aplicării</small><span class="val"><input type="text" inputmode="numeric" autocomplete="off" placeholder="zz.ll.aaaa – zz.ll.aaaa" maxlength="23" aria-label="Perioada aplicării: de la zi.lună.an până la zi.lună.an"></span></span><button type="button" class="fp-cal-btn" aria-label="Alege perioada din calendar" aria-expanded="false">' + IC_CAL + '</button></label><div class="fp-cal" hidden></div></div></div>' +
        '<p class="fp-a-out"></p>';
      box.appendChild(div);
      var inF = div.querySelector('.sel input'), inQ = div.querySelector('.fp-q input'), inD = div.querySelector('.fp-d input'), out = div.querySelector('.fp-a-out');
      if (a.f) inF.value = a.f.nume; if (a.q) inQ.value = String(a.q).replace('.', ',');
      Combo(div.querySelector('.sel'), {
        empty: 'Niciun îngrășământ cu azot găsit în lista MADR.',
        picker: { title: 'Alege îngrășământul', label: 'Îngrășământ mineral', ph: 'Caută: uree, azotat de amoniu, UAN…', ico: 'sac', toateTitlu: 'Toate îngrășămintele cu azot, alfabetic',
          toate: function () { return F.slice().sort(function (x, y) { return x.nume.localeCompare(y.nume, 'ro'); }).map(function (f) { return { label: f.nume, f: f, tag: tagF(f) }; }); } },
        options: function (q) {
          var k = norm(q), it;
          if (!k) it = POPULARE.map(function (nr) { return FBY[nr]; }).filter(Boolean);
          else it = F.filter(function (f) { return f.k.indexOf(k) >= 0; }).sort(function (x, y) { return (x.k.indexOf(k) === 0 ? 0 : 1) - (y.k.indexOf(k) === 0 ? 0 : 1) || x.oprit - y.oprit || x.cat - y.cat; });
          return { items: it.map(function (f) { return { label: f.nume, f: f, tag: tagF(f), tagCls: f.oprit ? 'muted' : 'cnt' }; }), head: k ? '' : 'Cele mai folosite' };
        },
        onPick: function (itm) { a.f = itm.f; div.querySelector('.fp-q .unit').textContent = unitCant(a.f); actualizeazaAplicare(a, out); actualizeaza(); },
        onType: function () { a.f = null; actualizeazaAplicare(a, out); actualizeaza(); }
      });
      if (a.f) div.querySelector('.fp-q .unit').textContent = unitCant(a.f);
      inQ.addEventListener('input', function () { a.q = num(inQ.value); actualizeazaAplicare(a, out); actualizeaza(); });
      CampData(div.querySelector('.fp-dsel'), a.d1, a.d2, function (d1, d2) { a.d1 = d1; a.d2 = d2; actualizeazaAplicare(a, out); actualizeaza(); });
      out.addEventListener('click', function (ev) {
        var b = ev.target.closest('.fp-fill'); if (!b || !a.f) return;
        var rest = Math.max(0, (num($('fp-plan').value) || 0) - totalN(a));
        a.q = Math.round(cantPentru(a.f, rest)); inQ.value = String(a.q); actualizeazaAplicare(a, out); actualizeaza();
        T('fert_fill_rest', { produs: a.f.nume });
      });
      var del = div.querySelector('.fp-del'); if (del) del.addEventListener('click', function () { apl.splice(i, 1); deseneazaAplicari(); actualizeaza(); });
      actualizeazaAplicare(a, out);
    });
    potrivesteToate(); /* câmpurile noi de cantitate: unitatea lângă cifre */
  }
  function totalN(fara) { return apl.reduce(function (s, a) { return s + (a === fara ? 0 : kgN(a.f, a.q)); }, 0); }
  function interzisZi(m, z) { return m === 11 || m === 12 || m === 1 || m === 2 || (m === 3 && z <= 15); }
  /* perioada aplicării atinge intervalul interzis 1 noiembrie – 15 martie? (se verifică fiecare zi; perioadele sunt scurte) */
  function interzis(a) {
    if (!a.d1) return false;
    var t = new Date(a.d1 + 'T12:00:00'), e = new Date((a.d2 || a.d1) + 'T12:00:00');
    for (var i = 0; t <= e && i < 400; i++, t.setDate(t.getDate() + 1)) if (interzisZi(t.getMonth() + 1, t.getDate())) return true;
    return false;
  }
  function actualizeazaAplicare(a, out) {
    var ha = num($('fp-ha').value), plan = num($('fp-plan').value), h = [];
    if (!a.f) { out.innerHTML = '<span class="ph">Alege îngrășământul.</span>'; return; }
    if (a.f.oprit) h.push('<span class="fp-w">Producția acestui produs e marcată ca oprită temporar în lista MADR.</span>');
    if (a.q) {
      var n = kgN(a.f, a.q);
      h.push('= <b>' + fmt(n, 1) + ' kg N/ha</b>' + (ha ? ' · pe ' + fmt(ha, 2) + ' ha: <b>' + (lichid(a.f) ? fmt(a.q * ha, 0) + ' L' : fmt(a.q * ha / 1000, 2) + ' t') + '</b> de produs' : ''));
    }
    if (plan) {
      var rest = Math.max(0, plan - totalN(a));
      if (rest > 0 && (!a.q || Math.abs(kgN(a.f, a.q) - rest) > 0.5)) h.push('<button type="button" class="fp-link fp-fill">Completează până la ' + fmt(plan, 0) + ' kg N/ha planificat: ' + fmt(Math.round(cantPentru(a.f, rest)), 0) + ' ' + unitCant(a.f) + '</button>');
    }
    if (interzis(a)) h.push('<span class="fp-bad">Atenție: împrăștierea îngrășămintelor e interzisă între 1 noiembrie și 15 martie.</span>');
    out.innerHTML = h.join(' ');
  }
  $('fp-add-apl').addEventListener('click', function () { aplicareNoua(); T('fert_application_added', { n: apl.length }); });

  /* câmpurile cu unitate: lățimea inputului urmează textul, ca unitatea (ha, t/ha, kg/ha…) să stea lângă cifre — ca în calculatorul de pesticide */
  var masura = document.createElement('span'); masura.className = 'measure'; root.appendChild(masura);
  function potriveste(input) {
    var gol = !input.value; input.closest('.field').classList.toggle('is-empty', gol);
    masura.style.fontWeight = gol ? '400' : '500'; masura.textContent = input.value || input.placeholder || '';
    input.style.width = Math.max(20, masura.offsetWidth + 2) + 'px';
  }
  function potrivesteToate() { Array.prototype.forEach.call(root.querySelectorAll('.has-unit input'), potriveste); }
  root.addEventListener('input', function (ev) {
    var i = ev.target; if (!i.closest || !i.closest('.has-unit')) return;
    var v = i.value.replace(/[^0-9.,]/g, ''); if (v !== i.value) i.value = v;
  }, true);

  /* ---------- data aplicării: se scrie de mână (zz.ll.aaaa) sau se alege din calendar ---------- */
  var IC_CAL = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>';
  var LUNI = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var isoDin = function (y, m, d) { return y + '-' + pad(m) + '-' + pad(d); };
  var calDeschis = null;
  document.addEventListener('mousedown', function (e) { if (calDeschis && !calDeschis.wrap.contains(e.target)) calDeschis.close(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && calDeschis) calDeschis.close(); });
  /* perioada aplicării: „01.10.2026 – 05.10.2026” — se scrie de mână (doar cifrele) sau se alege din calendar:
     primul click = începutul, al doilea = sfârșitul (o singură zi = un singur click pe aceeași zi de două ori sau „Gata”) */
  function CampData(wrap, d1, d2, onChange) {
    var field = wrap.querySelector('.field'), input = wrap.querySelector('input'), btn = wrap.querySelector('.fp-cal-btn'), pop = wrap.querySelector('.fp-cal');
    var azi = new Date(), a1 = d1 || '', a2 = d2 || '', vy = azi.getFullYear(), vm = azi.getMonth() + 1, hover = '';
    var ro = function (iso) { var p = iso.split('-'); return p[2] + '.' + p[1] + '.' + p[0]; };
    function arata() { input.value = a1 ? ro(a1) + (a2 && a2 !== a1 ? ' – ' + ro(a2) : '') : ''; }
    function anunta() { field.classList.remove('is-bad'); onChange(a1, a2 || a1); }
    function valid(z, l, an) { var t = new Date(an, l - 1, z); return an >= 2000 && an <= 2100 && t.getFullYear() === an && t.getMonth() === l - 1 && t.getDate() === z; }
    /* scris de mână: doar cifre; punctele și liniuța se pun singure */
    input.addEventListener('input', function () {
      var d = input.value.replace(/\D/g, '').slice(0, 16), f = function (x) { return x.length > 4 ? x.slice(0, 2) + '.' + x.slice(2, 4) + '.' + x.slice(4) : x.length > 2 ? x.slice(0, 2) + '.' + x.slice(2) : x; };
      input.value = d.length > 8 ? f(d.slice(0, 8)) + ' – ' + f(d.slice(8)) : f(d);
      var bun = true, n1 = '', n2 = '';
      if (d.length >= 8) { var z = +d.slice(0, 2), l = +d.slice(2, 4), an = +d.slice(4, 8); if (valid(z, l, an)) n1 = isoDin(an, l, z); else bun = false; }
      if (d.length === 16) { var z2 = +d.slice(8, 10), l2 = +d.slice(10, 12), an2 = +d.slice(12, 16); if (valid(z2, l2, an2)) n2 = isoDin(an2, l2, z2); else bun = false; if (n1 && n2 && n2 < n1) bun = false; }
      field.classList.toggle('is-bad', !bun);
      a1 = bun ? n1 : ''; a2 = bun && d.length === 16 ? n2 : '';
      onChange(a1, a2 || a1);
      if (a1) { var p = a1.split('-'); vy = +p[0]; vm = +p[1]; }
      if (!pop.hidden) deseneaza();
    });
    function deseneaza() {
      var prim = new Date(vy, vm - 1, 1), start = (prim.getDay() + 6) % 7, zile = new Date(vy, vm, 0).getDate();
      var aziIso = isoDin(azi.getFullYear(), azi.getMonth() + 1, azi.getDate()), sf = a2 || (a1 && hover > a1 ? hover : ''), h = '';
      h += '<div class="fp-cal-head"><button type="button" class="fp-cal-nav" data-nav="-1" aria-label="Luna anterioară">‹</button><b>' + LUNI[vm - 1] + ' ' + vy + '</b><button type="button" class="fp-cal-nav" data-nav="1" aria-label="Luna următoare">›</button></div>';
      h += '<p class="fp-cal-step">' + (!a1 || a2 ? 'Alege <b>prima zi</b> a aplicării' : 'Alege <b>ultima zi</b> (sau aceeași zi, dacă a fost o singură zi)') + '</p>';
      h += '<div class="fp-cal-grid">' + ['L', 'Ma', 'Mi', 'J', 'V', 'S', 'D'].map(function (z) { return '<span class="wd">' + z + '</span>'; }).join('');
      for (var i = 0; i < start; i++) h += '<span></span>';
      for (var z = 1; z <= zile; z++) {
        var iz = isoDin(vy, vm, z), capat = iz === a1 || iz === a2, inInt = a1 && sf && iz > a1 && iz < sf;
        var cls = 'fp-day' + (capat ? ' is-sel' : '') + (inInt ? ' is-in' : '') + (iz === aziIso ? ' is-today' : '') + (interzisZi(vm, z) ? ' is-forb' : '');
        h += '<button type="button" class="' + cls + '" data-d="' + iz + '"' + (interzisZi(vm, z) ? ' title="Perioadă interzisă (1 noiembrie – 15 martie)"' : '') + '>' + z + '</button>';
      }
      h += '</div><div class="fp-cal-foot"><span class="fp-cal-leg"><i></i>1 nov – 15 mar: interzis</span>' + (a1 && !a2 ? '<button type="button" class="fp-link" data-gata="1">Gata (o singură zi)</button>' : '<button type="button" class="fp-link" data-d="' + aziIso + '">Azi</button>') + '</div>';
      pop.innerHTML = h;
    }
    var api = {
      wrap: wrap,
      open: function () { if (calDeschis && calDeschis !== api) calDeschis.close(); if (a1) { var p = a1.split('-'); vy = +p[0]; vm = +p[1]; } deseneaza(); pop.hidden = false; field.classList.add('is-open'); wrap.classList.add('is-open'); btn.setAttribute('aria-expanded', 'true'); calDeschis = api; },
      close: function () { if (a1 && !a2) { a2 = a1; arata(); anunta(); } hover = ''; pop.hidden = true; field.classList.remove('is-open'); wrap.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false'); if (calDeschis === api) calDeschis = null; }
    };
    btn.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); if (pop.hidden) api.open(); else api.close(); });
    input.addEventListener('focus', function () { if (!mobil()) api.open(); });
    pop.addEventListener('mousedown', function (ev) { ev.preventDefault(); }); /* păstrează focusul în câmp */
    pop.addEventListener('mouseover', function (ev) { var d = ev.target.closest('[data-d]'); if (a1 && !a2 && d && d.getAttribute('data-d') !== hover) { hover = d.getAttribute('data-d'); deseneaza(); } });
    pop.addEventListener('click', function (ev) {
      var n = ev.target.closest('[data-nav]');
      if (n) { vm += +n.getAttribute('data-nav'); if (vm < 1) { vm = 12; vy--; } if (vm > 12) { vm = 1; vy++; } deseneaza(); return; }
      if (ev.target.closest('[data-gata]')) { api.close(); return; }
      var d = ev.target.closest('[data-d]'); if (!d) return;
      var iz = d.getAttribute('data-d');
      if (!a1 || a2) { a1 = iz; a2 = ''; arata(); anunta(); deseneaza(); return; }   /* începutul perioadei */
      if (iz < a1) { a2 = a1; a1 = iz; } else a2 = iz;                                  /* sfârșitul (dacă e înainte, se inversează) */
      arata(); anunta(); api.close();
    });
    arata();
    return api;
  }

  /* ---------- rezumat + avertismente ---------- */
  function actualizeaza() {
    potrivesteToate();
    var plan = num($('fp-plan').value), tot = totalN(), cards = $('fp-cards'), w = [];
    cards.innerHTML =
      '<div class="cstat"><span class="k">Planificat N</span><span class="v">' + (plan ? fmt(plan, 0) : '—') + ' <small>kg s.a./ha</small></span></div>' +
      '<div class="cstat"><span class="k">Realizat N (total)</span><span class="v">' + fmt(tot, 1) + ' <small>kg s.a./ha</small></span></div>' +
      '<div class="cstat"><span class="k">' + (plan && tot > plan ? 'Peste plan' : 'Rămas de aplicat') + '</span><span class="v">' + (plan ? fmt(Math.abs(plan - tot), 1) : '—') + ' <small>kg N/ha</small></span></div>';
    if (plan && tot > plan * 1.05) w.push('Ai aplicat mai mult azot decât ai planificat (' + fmt(tot, 0) + ' față de ' + fmt(plan, 0) + ' kg N/ha).');
    if (apl.some(function (a) { return interzis(a); })) w.push('Una dintre aplicări e în perioada interzisă (1 noiembrie – 15 martie).');
    $('fp-warn').innerHTML = w.map(function (t) { return '<p class="calc-warn">' + esc(t) + '</p>'; }).join('');
    $('fp-go-msg').textContent = '';
  }

  /* ---------- planul (mai multe parcele) ---------- */
  function salveaza() { try { localStorage.setItem(KEY, JSON.stringify(plan)); } catch (e) { /* fără stocare: planul rămâne doar pe pagină */ } }
  function citeste() { try { plan = JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch (e) { plan = []; } }
  var dataRo = function (d) { if (!d) return ''; var p = d.split('-'); return p[2] + '.' + p[1] + '.' + p[0]; };
  function randuriAplicari(r, cheie) { return r.apl.map(function (a) { return esc(a[cheie]); }).join('<br>'); }
  function celule(r) {
    return [esc(r.bloc), esc(r.parc), fmt(r.ha, 2), esc(r.cult), fmt(r.plan, 0), '', '', '',
      randuriAplicari(r, 'tip'), randuriAplicari(r, 'cant'), randuriAplicari(r, 'n'), randuriAplicari(r, 'data'), r.apl.length ? fmt(r.total, 1) : '', esc(r.obs)];
  }
  var CAP = '<thead><tr><th colspan="5" class="g-pl">Planificat</th><th colspan="8" class="g-re">Realizat</th><th rowspan="4">Obs.</th></tr>' +
    '<tr><th rowspan="3">Bloc fizic nr.</th><th colspan="2">Parcela</th><th rowspan="3">Cultura</th><th rowspan="3">Planificat N<br>kg s.a./ha</th><th colspan="6" class="g-re">Îngrășăminte aplicate</th><th rowspan="3" class="g-re">Data aplic.</th><th rowspan="3" class="g-re">Total N<br>kg s.a./ha</th></tr>' +
    '<tr><th rowspan="2">Nr.</th><th rowspan="2">Supraf. ha</th><th colspan="3" class="g-re">Organice</th><th colspan="3" class="g-re">Minerale</th></tr>' +
    '<tr><th class="g-re">Tip</th><th class="g-re">t/ha</th><th class="g-re">kg N/ha</th><th class="g-re">Tip</th><th class="g-re">t/ha</th><th class="g-re">kg N/ha</th></tr>' +
    '<tr class="nr">' + [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map(function (n) { return '<th>' + n + '</th>'; }).join('') + '</tr></thead>';
  function deseneazaPlan() {
    var box = $('fp-plan-box');
    box.hidden = !plan.length; $('fp-cnt').textContent = plan.length === 1 ? '1 parcelă' : plan.length + ' parcele';
    $('fp-tbl').innerHTML = CAP + '<tbody>' + plan.map(function (r, i) {
      return '<tr>' + celule(r).map(function (c) { return '<td>' + c + '</td>'; }).join('') + '<td class="del"><button type="button" class="fp-link" data-i="' + i + '" aria-label="Șterge parcela">×</button></td></tr>';
    }).join('') + '</tbody>';
    var thead = $('fp-tbl').querySelector('thead tr'); if (thead) thead.insertAdjacentHTML('beforeend', '<th rowspan="5" class="del"></th>');
    $('fp-print-doc').innerHTML = '<div class="fp-pr-head"><h1>Plan de fertilizare (model simplificat)</h1><p>Generat cu AgroSphere · agrosphere.eu</p></div>' +
      '<table class="fp-tbl">' + CAP + '<tbody>' + plan.map(function (r) { return '<tr>' + celule(r).map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>' +
      '<ol class="fp-pr-note"><li>Nr. blocului fizic</li><li>Nr. parcelei</li><li>Suprafața parcelei în hectare</li><li>Tipul culturii</li><li>Kg azot substanță activă (s.a.) la hectar</li><li>Ex.: gunoi proaspăt GP / gunoi fermentat GF / mraniță M</li><li>Tone pe hectar aplicate</li><li>Azot s.a. în kg la hectar. Nu depășiți 170 kg azot s.a. la hectar!</li><li>Tipul de îngrășământ, conform specificațiilor producătorului</li><li>Tone de îngrășământ aplicate (L/ha la produsele lichide dozate în g/l)</li><li>Azot s.a., conform instrucțiunilor producătorului</li><li>Data aplicării. Este interzisă împrăștierea îngrășămintelor între 1 noiembrie – 15 martie!</li><li>Suma coloanelor 8 + 11</li></ol>';
  }
  $('fp-tbl').addEventListener('click', function (ev) {
    var b = ev.target.closest('button[data-i]'); if (!b) return;
    plan.splice(+b.getAttribute('data-i'), 1); salveaza(); deseneazaPlan();
  });
  $('fp-go').addEventListener('click', function () {
    var ha = num($('fp-ha').value), pl = num($('fp-plan').value), c = $('fp-cult').value.trim(), msg = $('fp-go-msg'), lipsa = [];
    if (!$('fp-bloc').value.trim()) lipsa.push('blocul fizic');
    if (!ha) lipsa.push('suprafața');
    if (!c) lipsa.push('cultura');
    if (pl == null) lipsa.push('azotul planificat');
    var incomplete = apl.filter(function (a) { return (a.f && !a.q) || (!a.f && a.q); }).length;
    if (lipsa.length || incomplete) { msg.className = 'doza-msg bad'; msg.textContent = lipsa.length ? 'Completează ' + lipsa.join(', ') + '.' : 'O aplicare are produsul sau cantitatea lipsă.'; return; }
    var ap = apl.filter(function (a) { return a.f && a.q; }).map(function (a) {
      return { tip: a.f.nume, cant: lichid(a.f) ? fmt(a.q, 0) + ' L/ha' : fmt(a.q / 1000, 3), n: fmt(kgN(a.f, a.q), 1), data: dataRo(a.d1) + (a.d2 && a.d2 !== a.d1 ? ' – ' + dataRo(a.d2) : '') };
    });
    plan.push({ bloc: $('fp-bloc').value.trim(), parc: $('fp-parc').value.trim(), ha: ha, cult: c, plan: pl, apl: ap, total: totalN(), obs: $('fp-obs').value.trim() });
    salveaza(); deseneazaPlan();
    T('fert_parcel_added', { cultura: c, aplicari: ap.length });
    ['fp-parc', 'fp-ha', 'fp-rec', 'fp-plan', 'fp-obs'].forEach(function (id) { $(id).value = ''; });
    apl = []; aplicareNoua(); planAuto = false; sugereaza(); actualizeaza();
    msg.className = 'doza-msg ok'; msg.textContent = 'Parcela a fost adăugată în plan. Blocul fizic și cultura au rămas completate pentru parcela următoare.';
    $('fp-plan-box').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  /* golirea cere o a doua apăsare (fără confirm(): nu apare în toate browserele/aplicațiile) */
  var golire = null;
  $('fp-clear').addEventListener('click', function () {
    var b = $('fp-clear');
    if (!golire) { b.textContent = 'Sigur? Apasă din nou ca să ștergi tot'; golire = setTimeout(function () { golire = null; b.textContent = 'Golește planul'; }, 4000); return; }
    clearTimeout(golire); golire = null; b.textContent = 'Golește planul';
    plan = []; salveaza(); deseneazaPlan(); T('fert_plan_cleared', {});
  });
  $('fp-print').addEventListener('click', function () {
    T('fert_plan_printed', { parcele: plan.length });
    document.body.classList.add('fp-printing');
    var gata = function () { document.body.classList.remove('fp-printing'); window.removeEventListener('afterprint', gata); };
    window.addEventListener('afterprint', gata);
    window.print();
    setTimeout(gata, 1000);
  });

  /* ---------- pornire ---------- */
  /* varianta de tipărit stă direct în <body>, ca la tipărire să putem ascunde tot restul paginii */
  var pr = $('fp-print-doc'); pr.classList.add('fp-print-host'); document.body.appendChild(pr);
  citeste(); deseneazaPlan(); aplicareNoua(); actualizeaza();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(potrivesteToate);
  incarca().then(function (rows) { pregateste(rows); deseneazaAplicari(); })
    .catch(function () { $('fp-hint').textContent = 'Lista de îngrășăminte nu s-a putut încărca.'; });
})();
