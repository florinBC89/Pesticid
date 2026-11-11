/* Pesticid — calculatorul din hero (Figma 2095:40620 / 2095:40621 / componente 2096:45264).
   Date: assets/calc-data.json (doar produse omologate, nexpirate, cu doză parsată; generat de build_data).
   Flux: produs → cultură → dăunător/boală/buruiană → doză omologată (afișare) → doza ta → suprafață → apă → calcul.
   Toate cele trei selectoare sunt combo-uri: scrii ca să filtrezi, lista arată maximum 10 rânduri. */
(function () {
  'use strict';
  var root = document.querySelector('.calc');
  if (!root) return;
  var MAX = 10;
  var T = function (n, p) { if (window.track) window.track(n, p); };
  var TD = function (k, ms, n, p) { if (window.track) window.track.debounced(k, ms, n, p); };
  var started = false; function startCalc(field) { if (started) return; started = true; T('calc_started', { first_field: field }); }
  var via = 'list';
  var $ = function (s) { return root.querySelector(s); };
  var els = {
    hint: $('#c-hint'),
    dozaOm: $('#c-doza-om'), dozaOmV: $('#c-doza-om-v'), dozaF: $('#f-doza'), dozaIn: $('#c-doza'), dozaU: $('#c-doza-u'), dozaMsg: $('#c-doza-msg'),
    haF: $('#f-ha'), ha: $('#c-ha'), apaF: $('#f-apa'), apa: $('#c-apa'), blocF: $('#f-bloc'), bloc: $('#c-bloc'),
    doza: $('.doza'), btn: $('#c-go'), res: $('#c-res'), cards: $('#c-cards'), note: $('.calc-note')
  };
  var D = null, produse = [], popular = [], sel = { p: null, c: null, t: null, rec: null, culOpts: [], tinOpts: [] };
  var fmt = function (n, d) { return new Intl.NumberFormat('ro-RO', { maximumFractionDigits: d == null ? 2 : d }).format(n); };
  var norm = function (s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); };
  function unitProdus(u) { if (!u) return ''; if (u.indexOf('ml') === 0) return 'ml'; if (u.indexOf('L') === 0) return 'L'; if (u.indexOf('kg') === 0) return 'kg'; if (u.indexOf('g') === 0) return 'g'; return u; }
  function estePerHa(u) { return u === 'L/ha' || u === 'kg/ha' || u === 'ml/ha' || u === 'g/ha'; }
  function esteConc(u) { return u === 'L/1000 L apa' || u === 'kg/1000 L apa' || u === '%'; }
  function dozaPerHa(d, u, apa) { if (u === 'L/1000 L apa' || u === 'kg/1000 L apa') return d / 1000 * apa; if (u === '%') return d / 100 * apa; return d; }
  function unitRo(u) { return (u || '').replace(' apa', ' wody'); }
  function fmtDoza(r) { return (r[3] === r[4] ? fmt(r[3], 4) : fmt(r[3], 4) + '–' + fmt(r[4], 4)) + ' ' + unitRo(r[5]); }
  function modLabel(m) { return { foliar: 'oprysk nalistny', postemergent: 'powschodowo', preemergent: 'przedwschodowo', preplantare: 'przed sadzeniem', tratament_samanta: 'zaprawianie nasion', postrecoltare: 'po zbiorze' }[m] || m; }
  function tipCls(t) { return { Insecticid: 'tip', Erbicid: 'erb', Fungicid: 'fun' }[t] || 'alt'; }
  var ICO = {
    bottle: '<path d="M9 3h6v3l2 3v12H7V9l2-3z"/><path d="M9 13h6"/>',
    wheat: '<path d="M12 21V9M12 9c-3 0-5-2-5-5 3 0 5 2 5 5zM12 9c3 0 5-2 5-5-3 0-5 2-5 5zM12 15c-3 0-5-2-5-5 3 0 5 2 5 5zM12 15c3 0 5-2 5-5-3 0-5 2-5 5z"/>',
    bug: '<circle cx="12" cy="13" r="5"/><path d="M12 8V5M7 10l-3-2M17 10l3-2M7 15H4M17 15h3M8 19l-2 2M16 19l2 2"/>',
    leaf: '<path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z"/><path d="M5 19l8-8"/>',
    weed: '<path d="M12 21v-9M12 12c-4 0-6-3-6-7 4 0 6 3 6 7zM12 12c4 0 6-3 6-7-4 0-6 3-6 7zM8 21h8"/>'
  };
  function ico(n) { return '<svg viewBox="0 0 24 24" fill="none" stroke="#3f4b66" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICO[n] + '</svg>'; }
  function tipIco(t) { return { daunator: 'bug', boala: 'leaf', buruiana: 'weed' }[t] || 'leaf'; }
  var GEN = { 'dni': 'dni', 'godziny': 'godzin', 'minuty': 'minut', 'środki': 'środków', 'uprawy': 'upraw', 'agrofagi': 'agrofagów', 'rejestracje': 'rejestracji', 'szkodniki': 'szkodników', 'choroby': 'chorób', 'chwasty': 'chwastów', 'problemy fizjologiczne': 'problemów fizjologicznych', 'zarejestrowane środki': 'zarejestrowanych środków', 'zarejestrowane uprawy': 'zarejestrowanych upraw', 'zarejestrowane agrofagi': 'zarejestrowanych agrofagów' }; function maiMulte(n) { var k = n % 10, h = n % 100; return k >= 2 && k <= 4 && (h < 12 || h > 14); } function plural(n, one, few, many) { return n === 1 ? '1 ' + one : n + ' ' + (maiMulte(n) ? few : (GEN[many] || many)); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ---------- combo generic: câmp cu input, listă de max. 10, × de golire ---------- */
  var openCombo = null;
  function Combo(id, o) {
    var self = this;
    this.sel = $('#s-' + id); this.field = $('#f-' + id); this.input = $('#c-' + id); this.dd = this.sel.querySelector('.dd'); this.list = $('#c-' + id + '-list');
    this.txt = this.field.querySelector('.txt'); this.x = this.field.querySelector('.x'); this.tag = this.field.querySelector('.tagr, .cnt');
    this.o = o; this.hits = []; this.hi = -1; this.value = null;
    this.input.addEventListener('input', function () { if (self.value) self.clear(false); self.render(); });
    this.input.addEventListener('focus', function () { startCalc(id); if (mobil()) { self.input.blur(); deschidePicker(self); return; } if (!self.value) self.render(); });
    this.input.addEventListener('keydown', function (ev) {
      if (self.dd.hidden) { if (ev.key === 'ArrowDown') { self.render(); ev.preventDefault(); } return; }
      if (ev.key === 'ArrowDown') { self.hi = (self.hi + 1) % self.hits.length; self.paint(); ev.preventDefault(); }
      else if (ev.key === 'ArrowUp') { self.hi = (self.hi - 1 + self.hits.length) % self.hits.length; self.paint(); ev.preventDefault(); }
      else if (ev.key === 'Enter') { if (self.hits[self.hi]) { self.pick(self.hits[self.hi]); ev.preventDefault(); } }
      else if (ev.key === 'Tab') { closeAll(); }
    });
    this.x.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); T('calc_field_cleared', { field: id }); self.clear(true); self.input.focus(); });
    this.field.addEventListener('click', function (ev) { if (ev.target.closest('.x')) return; if (self.field.classList.contains('is-off')) { ev.preventDefault(); return; } if (mobil()) { ev.preventDefault(); deschidePicker(self); return; } if (self.value) { ev.preventDefault(); if (self.dd.hidden) self.render(true); else closeAll(); } });
  }
  Combo.prototype.enable = function (on, ph) { this.field.classList.toggle('is-off', !on); this.input.disabled = !on; this.input.placeholder = ph; };
  Combo.prototype.set = function (v, label, tagText, tagCls) {
    this.value = v; this.txt.textContent = label; this.txt.hidden = false; this.x.hidden = false; this.field.classList.add('is-set'); this.input.value = label;
    if (tagText) { this.tag.textContent = tagText; this.tag.className = 'tag xs ' + (this.tag.classList.contains('cnt') ? 'cnt' : 'tagr ' + tagCls); this.tag.hidden = false; }
    closeAll();
  };
  Combo.prototype.clear = function (notify) { this.value = null; this.txt.hidden = true; this.x.hidden = true; this.tag.hidden = true; this.field.classList.remove('is-set'); this.input.value = ''; if (notify && this.o.onClear) this.o.onClear(); };
  Combo.prototype.render = function (all) {
    var q = all || this.value ? '' : this.input.value; var r = this.o.options(q); this.hits = r.items.slice(0, MAX); this.hi = this.hits.length && q ? 0 : -1; this.head = r.head || ''; this.more = Math.max(0, r.items.length - this.hits.length); this.paint();
  };
  Combo.prototype.paint = function () {
    var self = this, ul = this.list; ul.innerHTML = '';
    if (!this.hits.length) { var e = document.createElement('li'); e.className = 'empty'; e.textContent = this.o.empty; ul.appendChild(e); open(this); var q0 = norm(this.input.value); if (q0.length >= 3) TD('calc_nm_' + this.sel.id, 800, 'calc_no_match', { field: this.sel.id.slice(2), query: q0.slice(0, 40) }); return; }
    if (this.head) { var h = document.createElement('li'); h.className = 'hd'; h.textContent = this.head; ul.appendChild(h); }
    this.hits.forEach(function (it, i) {
      var li = document.createElement('li'); li.className = 'opt' + (i === self.hi ? ' is-hi' : ''); li.setAttribute('role', 'option');
      li.innerHTML = '<span class="nm">' + ico(it.ico) + '<span>' + esc(it.label) + '</span></span><span class="tag xs ' + it.tagCls + '">' + esc(it.tag) + '</span>';
      li.addEventListener('mousedown', function (ev) { ev.preventDefault(); self.pick(it); });
      ul.appendChild(li);
    });
    if (this.more) { var m = document.createElement('li'); m.className = 'more'; m.textContent = '+ jeszcze ' + this.more + '. Wpisz pierwsze litery, aby zawęzić listę.'; ul.appendChild(m); }
    open(this);
  };
  Combo.prototype.pick = function (it) { via = mobil() ? 'picker' : (this.input.value && !this.value ? 'typed' : 'list'); this.lastQuery = this.input.value; this.o.onPick(it); };
  /* pe mobil, fiecare combo se deschide în selectorul pe tot ecranul (același ca la căutarea avansată, Explorare B) */
  function mobil() { return !!(window.PesticidPicker && window.PesticidPicker.mobile()); }
  function spQuery() { var i = document.getElementById('sp-in'); return i ? i.value : ''; }
  function deschidePicker(c) {
    var P = window.PesticidPicker, hits = [], tot = false, MAXP = 10;
    var meta = { produs: ['Wybierz środek', 'Szukaj lub wpisz nazwę środka…', 'bottle', 'Środek'], cultura: ['Wybierz uprawę', 'Wpisz lub wybierz uprawę…', 'wheat', 'Uprawa'], tinta: ['Wybierz agrofaga', 'Wpisz lub wybierz agrofaga…', 'bug', 'Szkodnik / choroba / chwast'] }[c.sel.id.slice(2)];
    P.open({
      title: meta[0], label: meta[3], ph: meta[1], ico: ico(meta[2]), go: null,
      onOpen: function () { if (c.input.disabled) return false; startCalc(c.sel.id.slice(2)); closeAll(); tot = false; return true; },
      render: function (q) {
        var r = c.o.options(q); hits = r.items;
        if (!hits.length) { if (norm(q).length >= 3) TD('calc_nm_' + c.sel.id, 800, 'calc_no_match', { field: c.sel.id.slice(2), query: norm(q).slice(0, 40) }); return '<p class="empty">' + esc(c.o.empty) + '</p>'; }
        var h = '<div class="sgrp"><div class="hd">' + esc(norm(q) ? 'Wyniki dla „' + q + '”' : r.head || 'Wszystkie') + '<small>' + hits.length + '</small></div><div class="swrap">';
        hits.forEach(function (it, i) { h += '<button type="button" class="schip" data-id="' + i + '">' + ico(it.ico) + '<span>' + esc(it.label) + '</span><small>' + esc(it.tag) + '</small></button>'; });
        h += '</div></div>';
        if (!norm(q) && c === cProd && produse.length > hits.length) {
          var all = produse.slice().sort(function (a, b) { return a.nume.localeCompare(b.nume, 'ro'); }), lim = tot ? all.length : MAXP;
          h += '<div class="sgrp"><div class="hd">Wszystkie środki, alfabetycznie<small>' + all.length + '</small></div><div class="swrap">';
          all.slice(0, lim).forEach(function (it) { h += '<button type="button" class="schip" data-id="' + (hits.push(it) - 1) + '">' + ico(it.ico) + '<span>' + esc(it.label) + '</span><small>' + esc(it.tag) + '</small></button>'; });
          if (all.length > lim) h += '<button type="button" class="schip more" data-more="tot">… jeszcze ' + (all.length - lim) + '</button>';
          h += '</div></div>';
        }
        return h;
      },
      more: function () { tot = true; },
      pick: function (el) { var it = hits[Number(el.getAttribute('data-id'))]; if (it) { c.input.value = spQuery(); c.pick(it); } },
      goOn: function (q) { return !!(norm(q) && hits.length); },
      onGo: function (q) { if (norm(q) && hits.length) c.pick(hits[0]); }
    });
  }
  function open(c) { closeAll(); c.sel.classList.add('is-open'); c.field.classList.add('is-open'); c.input.setAttribute('aria-expanded', 'true'); c.dd.hidden = false; openCombo = c; }
  function closeAll() { if (!openCombo) return; openCombo.sel.classList.remove('is-open'); openCombo.field.classList.remove('is-open'); openCombo.input.setAttribute('aria-expanded', 'false'); openCombo.dd.hidden = true; openCombo = null; }
  document.addEventListener('mousedown', function (ev) { if (openCombo && !openCombo.sel.contains(ev.target)) closeAll(); });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') closeAll(); });
  function filtru(items, q, key) { var k = norm(q); if (!k) return items; var pre = [], mid = []; items.forEach(function (it) { var at = norm(it[key || 'label']).indexOf(k); if (at === 0) pre.push(it); else if (at > 0) mid.push(it); }); return pre.concat(mid); }

  /* ---------- cele trei combo-uri ---------- */
  var cProd = new Combo('produs', {
    empty: 'Żaden zarejestrowany środek nie pasuje. Spróbuj innej nazwy lub dawnej nazwy handlowej (np. Racing).',
    options: function (q) { if (!D) return { items: [] }; if (!norm(q)) return { head: 'Najpopularniejsze środki', items: popular }; return { items: filtru(produse, q, 'key') }; },
    onPick: function (p) { alegeProdus(p); },
    onClear: function () { sel.p = null; resetCultura(); }
  });
  var cCul = new Combo('cultura', {
    empty: 'Żadna zarejestrowana uprawa dla tego środka nie pasuje.',
    options: function (q) { return { items: filtru(sel.culOpts, q) }; },
    onPick: function (o) { alegeCultura(o); },
    onClear: function () { sel.c = null; sel.t = null; sel.rec = null; cTin.clear(false); cTin.enable(false, 'Najpierw wybierz uprawę'); els.dozaIn.value = ''; actualizeaza(); }
  });
  var cTin = new Combo('tinta', {
    empty: 'Żaden zarejestrowany agrofag dla tej kombinacji nie pasuje.',
    options: function (q) { return { items: filtru(sel.tinOpts, q) }; },
    onPick: function (o) { alegeTinta(o); },
    onClear: function () { sel.t = null; sel.rec = null; els.dozaIn.value = ''; actualizeaza(); }
  });

  /* ---------- încărcare date ---------- */
  fetch('/assets/calc-data.json').then(function (r) { return r.json(); }).then(function (data) {
    D = data; if (window.track) window.track.register({ data_version: data.generat || null });
    produse = data.produse.map(function (p) { return { id: p[0], nume: p[1], label: p[1], tip: p[3], ico: 'bottle', tag: p[3] || 'Środek', tagCls: tipCls(p[3]), key: p[1] + ' ' + (p[5] || []).join(' ') }; });
    var nc = {}; data.recs.forEach(function (r) { (nc[r[0]] = nc[r[0]] || {})[r[1]] = 1; });
    popular = produse.slice().sort(function (a, b) { return Object.keys(nc[b.id] || {}).length - Object.keys(nc[a.id] || {}).length || a.nume.localeCompare(b.nume, 'ro'); }).slice(0, MAX);
    cProd.enable(true, 'Szukaj lub wybierz środek');
    els.hint.innerHTML = '<b>' + produse.length + '</b> ' + (produse.length === 1 ? 'środek' : maiMulte(produse.length) ? 'środki' : 'środków') + ' w rejestrze';
    root.classList.add('is-ready');
  }).catch(function () { cProd.enable(false, 'Nie udało się wczytać danych.'); els.hint.textContent = 'Nie udało się wczytać danych.'; });

  function alegeProdus(p) {
    T('calc_field_set', { field: 'produs', id: p.id, nume: p.nume, tip: p.tip, via: via, query_len: (cProd.lastQuery || '').length, options_count: produse.length }); via = 'list'; cProd.lastQuery = '';
    sel.p = p; cProd.set(p, p.nume, p.tag, p.tagCls);
    resetCultura();
    var byC = {}; D.recs.forEach(function (r) { if (r[0] === p.id) (byC[r[1]] = byC[r[1]] || {})[r[2]] = D.tinte[r[2]][1]; });
    var L = { daunator: ['szkodnik', 'szkodniki', 'szkodniki'], boala: ['choroba', 'choroby', 'choroby'], buruiana: ['chwast', 'chwasty', 'chwasty'] };
    sel.culOpts = Object.keys(byC).map(Number).sort(function (a, b) { return D.culturi[a].localeCompare(D.culturi[b], 'ro'); }).map(function (id) {
      var ts = Object.keys(byC[id]), kinds = {}; ts.forEach(function (t) { kinds[byC[id][t]] = 1; }); var k = Object.keys(kinds); var lbl = (k.length === 1 && L[k[0]]) || ['agrofag', 'agrofagi', 'agrofagi'];
      return { id: id, label: D.culturi[id], ico: 'wheat', tag: plural(ts.length, lbl[0], lbl[1], lbl[2]), tagCls: 'cnt' };
    });
    cCul.enable(true, 'Wybierz uprawę');
    if (sel.culOpts.length === 1) { via = 'auto'; alegeCultura(sel.culOpts[0]); } else { actualizeaza(); setTimeout(function () { cCul.input.focus(); }, 0); }
  }
  function resetCultura() { sel.c = null; sel.t = null; sel.rec = null; sel.culOpts = []; sel.tinOpts = []; cCul.clear(false); cCul.enable(false, 'Najpierw wybierz środek'); cTin.clear(false); cTin.enable(false, 'Najpierw wybierz uprawę'); els.dozaIn.value = ''; actualizeaza(); }
  function alegeCultura(o) {
    T('calc_field_set', { field: 'cultura', id: o.id, nume: o.label, via: via, query_len: (cCul.lastQuery || '').length, options_count: sel.culOpts.length }); via = 'list'; cCul.lastQuery = '';
    sel.c = o.id; sel.t = null; sel.rec = null; cCul.set(o, o.label, o.tag, 'cnt');
    var seen = {}, opts = [];
    D.recs.forEach(function (r) { if (r[0] === sel.p.id && r[1] === sel.c && !seen[r[2]]) { seen[r[2]] = 1; var sa = {}; D.recs.forEach(function (q) { if (q[1] === sel.c && q[2] === r[2]) sa[q[0]] = 1; }); opts.push({ id: r[2], label: D.tinte[r[2]][0], tip: D.tinte[r[2]][1], ico: tipIco(D.tinte[r[2]][1]), tag: plural(Object.keys(sa).length, 'środek', 'środki', 'środki'), tagCls: 'cnt' }); } });
    opts.sort(function (a, b) { return a.label.localeCompare(b.label, 'ro'); });
    sel.tinOpts = opts; cTin.clear(false); cTin.enable(true, 'Wybierz szkodnika / chorobę / chwast'); els.dozaIn.value = '';
    if (opts.length === 1) { via = 'auto'; alegeTinta(opts[0]); } else { actualizeaza(); setTimeout(function () { cTin.input.focus(); }, 0); }
  }
  function alegeTinta(o) {
    T('calc_field_set', { field: 'tinta', id: o.id, nume: o.label, tip: o.tip, via: via, query_len: (cTin.lastQuery || '').length, options_count: sel.tinOpts.length }); via = 'list'; cTin.lastQuery = '';
    sel.t = o.id; cTin.set(o, o.label, o.tag, 'cnt');
    var recs = D.recs.filter(function (r) { return r[0] === sel.p.id && r[1] === sel.c && r[2] === sel.t; });
    recs.sort(function (a, b) { return (estePerHa(b[5]) ? 2 : esteConc(b[5]) ? 1 : 0) - (estePerHa(a[5]) ? 2 : esteConc(a[5]) ? 1 : 0); });
    sel.rec = recs[0] || null; els.dozaIn.value = '';
    actualizeaza();
    if (sel.rec && sel.rec[3] !== sel.rec[4]) setTimeout(function () { els.dozaIn.focus(); }, 0);
    else if (!num(els.ha)) setTimeout(function () { els.ha.focus(); }, 0);
  }

  /* ---------- câmpuri numerice ---------- */
  function num(el) { var v = parseFloat(String(el.value).replace(',', '.')); return isFinite(v) && v > 0 ? v : null; }
  var measure = document.createElement('span'); measure.className = 'measure'; root.appendChild(measure);
  function fitInput(input) {
    var f = input.closest('.field'); var empty = !input.value;
    f.classList.toggle('is-empty', empty);
    measure.style.fontWeight = empty ? '400' : '500';
    measure.textContent = input.value || input.placeholder || '';
    input.style.width = Math.max(20, measure.offsetWidth + 2) + 'px';
  }
  function bindNumeric(f, input) {
    var x = f.querySelector('.x');
    input.addEventListener('input', function () { input.value = input.value.replace(/[^0-9.,]/g, ''); actualizeaza(); });
    input.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && !els.btn.disabled && !root.classList.contains('has-res')) { els.btn.click(); ev.preventDefault(); } });
    x.addEventListener('click', function (ev) { ev.preventDefault(); input.value = ''; actualizeaza(); input.focus(); });
  }
  bindNumeric(els.dozaF, els.dozaIn); bindNumeric(els.haF, els.ha); bindNumeric(els.apaF, els.apa);
  /* Bloc fizic: identificator numeric (doar cifre), opțional; același comportament ca „Doza ta” (× de golire, lățime după conținut) */
  els.bloc.addEventListener('input', function () { els.bloc.value = els.bloc.value.replace(/[^0-9]/g, ''); els.blocF.querySelector('.x').hidden = !els.bloc.value; fitInput(els.bloc); if (root.classList.contains('has-res')) actualizeaza(); });
  els.bloc.addEventListener('focus', function () { startCalc('bloc'); });
  els.bloc.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); cProd.input.focus(); } });
  els.blocF.querySelector('.x').addEventListener('click', function (ev) { ev.preventDefault(); els.bloc.value = ''; els.blocF.querySelector('.x').hidden = true; fitInput(els.bloc); els.bloc.focus(); });

  /* ---------- doză + buton ---------- */
  /* verificarea dozei tale față de intervalul omologat (folosită și de fișa omologării din căutare) */
  function verif(r, dt) {
    var u = unitRo(r[5]);
    if (r[3] === r[4] || dt == null) return { cls: '', msg: '' };
    if (dt > r[4]) return { cls: 'bad', msg: 'Twoja dawka (' + fmt(dt, 4) + ' ' + u + ') przekracza maksymalną zarejestrowaną dawkę ' + fmt(r[4], 4) + ' ' + u + '. Stosowanie powyżej dawki zarejestrowanej jest zabronione.' };
    if (dt < r[3]) return { cls: 'warn', msg: 'Twoja dawka (' + fmt(dt, 4) + ' ' + u + ') jest poniżej minimalnej zarejestrowanej dawki ' + fmt(r[3], 4) + ' ' + u + ': mniejsza skuteczność i ryzyko powstania odporności.' };
    return { cls: '', msg: '' };
  }
  function actualizeaza() {
    els.res.hidden = true; els.note.textContent = ''; root.classList.remove('has-res');
    var r = sel.rec;
    els.dozaF.classList.remove('is-warn', 'is-bad', 'is-fixed', 'is-off');
    els.dozaMsg.textContent = ''; els.dozaMsg.className = 'doza-msg';
    var dozaOk = true, dozaX = els.dozaF.querySelector('.x');
    if (r) {
      var u = unitRo(r[5]);
      els.dozaOmV.textContent = fmtDoza(r); els.dozaOmV.classList.remove('ph'); els.dozaOm.classList.add('is-set');
      els.dozaU.textContent = u;
      if (r[3] === r[4]) {
        /* doză fixă: Doza ta = doza omologată, nu se poate schimba */
        els.dozaIn.disabled = false; els.dozaIn.readOnly = true; els.dozaIn.value = fmt(r[3], 4); els.dozaF.classList.add('is-fixed'); dozaX.hidden = true;
      } else {
        els.dozaIn.disabled = false; els.dozaIn.readOnly = false; els.dozaIn.placeholder = fmt(r[3], 4) + '–' + fmt(r[4], 4);
        dozaX.hidden = !els.dozaIn.value;
        var v = verif(r, num(els.dozaIn));
        var dtv = num(els.dozaIn); if (dtv != null) TD('calc_dose', 800, 'calc_dose_entered', { dose_relation: v.cls === 'bad' ? 'above_max' : v.cls === 'warn' ? 'below_min' : 'in_range', doza: dtv, doza_min: r[3], doza_max: r[4], unitate: r[5] });
        if (v.cls) { els.dozaF.classList.add('is-' + v.cls); els.dozaMsg.className = 'doza-msg ' + v.cls; els.dozaMsg.textContent = v.msg; if (v.cls === 'bad') dozaOk = false; }
      }
      var parts = [fmtDoza(r)]; if (r[6] != null) parts.push('karencja ' + r[6] + (r[6] === 1 ? ' dzień' : ' dni')); if (r[7]) parts.push(modLabel(r[7]));
      els.doza.innerHTML = 'Dawka <span class="tag">Zarejestrowana</span> <b></b>'; els.doza.querySelector('b').textContent = parts[0]; els.doza.appendChild(document.createTextNode(parts.length > 1 ? ' · ' + parts.slice(1).join(' · ') : '')); els.doza.classList.add('is-on');
    } else {
      els.dozaOmV.textContent = sel.p ? (sel.c ? 'Uzupełni się po wyborze agrofaga' : 'Uzupełni się po wyborze uprawy') : 'Uzupełni się po wyborze agrofaga'; els.dozaOmV.classList.add('ph'); els.dozaOm.classList.remove('is-set');
      els.dozaIn.disabled = true; els.dozaIn.readOnly = false; els.dozaIn.value = ''; els.dozaIn.placeholder = 'Twoja dawka'; els.dozaU.textContent = ''; els.dozaF.classList.add('is-off'); dozaX.hidden = true;
      els.doza.innerHTML = 'Dawka <span class="tag muted">Zarejestrowana</span> '; els.doza.appendChild(document.createTextNode(sel.p ? (sel.c ? 'wybierz szkodnika, chorobę lub chwast' : 'wybierz uprawę') : 'wybierz jeden z zarejestrowanych środków')); els.doza.classList.remove('is-on');
    }
    /* „Doza ta” apare doar când doza omologată e un interval; la doză fixă nu e nimic de editat */
    var interval = !!(r && r[3] !== r[4]);
    els.dozaF.hidden = !interval; els.dozaOm.parentElement.classList.toggle('one', !interval);
    els.haF.querySelector('.x').hidden = !els.ha.value; els.apaF.querySelector('.x').hidden = !els.apa.value;
    fitInput(els.dozaIn); fitInput(els.ha); fitInput(els.apa); fitInput(els.bloc);
    var dozaGata = r && (r[3] === r[4] || num(els.dozaIn) != null);
    var gata = !!(r && dozaGata && num(els.ha) && num(els.apa) && dozaOk);
    els.btn.disabled = !gata; els.btn.classList.toggle('ghost', !gata);
  }

  /* ---------- calcul ---------- */
  function card(k, v, u, h) { return '<div class="cstat"><div class="k">' + esc(k) + '</div><div class="v"><span>' + esc(v) + '</span><small>' + esc(u) + '</small></div><div class="h">' + esc(h) + '</div></div>'; }
  function calcHtml(r, dta, ha, apa) {
    var u = r[5], up = unitProdus(u), uro = unitRo(u);
    try { localStorage.setItem('pesticid.site.param', JSON.stringify({ ha: ha, apa: apa })); } catch (e) {}
    var html = '', note = [];
    if (els.bloc.value) note.push('Blok fizyczny (APIA) ' + els.bloc.value + '.');
    if (estePerHa(u) || esteConc(u)) {
      var d = dozaPerHa(dta, u, apa), total = d * ha, apaTot = apa * ha, conc = d / apa * 100;
      html += card('Całkowita ilość środka', fmt(total, 3), up, fmt(d, 4) + ' ' + up + '/ha × ' + fmt(ha) + ' ha');
      html += card('Całkowita ilość wody', fmt(apaTot, 0), 'L', fmt(apa, 0) + ' L/ha × ' + fmt(ha) + ' ha');
      html += card('Stężenie', fmt(conc, 3), '%', 'w cieczy użytkowej');
      if (esteConc(u)) note.push('Dawka jest podana na ilość wody (' + uro + '): przy ' + fmt(apa, 0) + ' L/ha oznacza to ' + fmt(d, 4) + ' ' + up + '/ha.');
      if (r[3] !== r[4]) note.push('Obliczono dla twojej dawki: ' + fmt(dta, 4) + ' ' + uro + (dta < r[3] ? ' (poniżej minimalnej zarejestrowanej dawki)' : '') + '.');
      if (r[6] != null) note.push('Okres karencji: ' + r[6] + ' dni.');
    } else {
      html += '<p class="calc-warn">Dawka tego środka jest podana na nasiona (' + esc(uro) + '), a nie na hektar. Dla ' + fmt(ha) + ' ha obliczasz ją według ilości użytego materiału siewnego, a nie według ilości wody.</p>';
    }
    return { html: html, note: note.join(' ') };
  }
  root.addEventListener('pointerdown', function (ev) {
    var b = ev.target.closest('#c-go'); if (!b || !b.disabled) return;
    var r = sel.rec, reason = !sel.p ? 'no_produs' : sel.c == null ? 'no_cultura' : !r ? 'no_tinta' : (r[3] !== r[4] && num(els.dozaIn) == null) ? 'no_dose' : (num(els.dozaIn) != null && num(els.dozaIn) > r[4]) ? 'above_max' : !num(els.ha) ? 'no_ha' : !num(els.apa) ? 'no_apa' : 'unknown';
    T('calc_blocked', { reason: reason });
  });
  els.btn.addEventListener('click', function () {
    var r = sel.rec; if (!r) return;
    var ha = num(els.ha), apa = num(els.apa); if (!ha || !apa) return;
    var dta = r[3] === r[4] ? r[3] : num(els.dozaIn); if (dta == null || dta > r[4]) return;
    var out = calcHtml(r, dta, ha, apa);
    T('calc_result_shown', { produs_id: sel.p.id, produs: sel.p.nume, cultura_id: sel.c, cultura: D.culturi[sel.c], tinta_id: sel.t, tinta: D.tinte[sel.t][0], ha: ha, apa: apa, doza: dta, unitate: r[5], pauza: r[6], mod: r[7], total_produs: estePerHa(r[5]) || esteConc(r[5]) ? dozaPerHa(dta, r[5], apa) * ha : null, dose_fixed: r[3] === r[4], has_concentration_unit: esteConc(r[5]), has_bloc_fizic: !!els.bloc.value });
    els.cards.innerHTML = out.html; els.res.hidden = false; els.note.textContent = out.note;
    root.classList.add('has-res');
    els.res.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  /* parametri memorați */
  try { var pm = JSON.parse(localStorage.getItem('pesticid.site.param') || 'null'); if (pm) { if (pm.ha) els.ha.value = pm.ha; if (pm.apa) els.apa.value = pm.apa; } } catch (e) {}
  if (!els.apa.value) els.apa.value = 200;
  actualizeaza();

  /* API pentru căutarea avansată: precompletează produs → cultură → dăunător și lasă calculatorul să ceară doar ce lipsește */
  window.PesticidCalc = {
    verif: verif, calc: calcHtml, fmtDoza: fmtDoza, unitRo: unitRo, fmt: fmt, num: num,
    set: function (pid, cid, tid) {
      if (!D) return false;
      var p = produse.filter(function (x) { return x.id === pid; })[0]; if (!p) return false;
      closeAll(); alegeProdus(p);
      if (cid != null) { var c = sel.culOpts.filter(function (o) { return o.id === cid; })[0]; if (c && sel.c !== c.id) alegeCultura(c); }
      if (tid != null && sel.c != null) { var t = sel.tinOpts.filter(function (o) { return o.id === tid; })[0]; if (t && sel.t !== t.id) alegeTinta(t); }
      return true;
    }
  };
})();
