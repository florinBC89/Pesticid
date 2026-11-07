/* Pesticid — căutare avansată: Cultură · Dăunător / boală / buruiană · Produs (opțional).
   Figma: „Search avansat” 2099:47194 (bară, stări, liste cu chip-uri, selectorul pe tot ecranul — Explorare B 2108:22713)
   și „Search v3” 2070:21803 (fișele de rezultat 7–9, listele de omologări 2/4/5/6).
   Date: assets/calc-data.json (produse omologate, culturi cu ierarhia ANF, dăunători/boli/buruieni, recomandări, sinonime).
   Regula „Caută”: inactiv cât nu e nimic tastat sau ales; activ când textul are ≥ 3 litere și există potriviri (face ce face Enter)
   sau când există cel puțin o valoare aleasă. Alegerea unei valori precompletează câmpul și pornește căutarea automat. */
(function () {
  'use strict';
  var root = document.getElementById('search'); if (!root) return;
  var calcEl = document.querySelector('.calc');
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.tabs .tab'));
  var bar = root.querySelector('.sbar'), dd = document.getElementById('s-dd'), res = document.getElementById('s-res'), go = document.getElementById('s-go');
  var pick = document.getElementById('spick'), spIn = document.getElementById('sp-in'), spList = document.getElementById('sp-list'), spGo = document.getElementById('sp-go');
  var T = function (n, p) { if (window.track) window.track(n, p); };
  var TD = function (k, ms, n, p) { if (window.track) window.track.debounced(k, ms, n, p); };
  var sStarted = false; function startSearch(k) { if (sStarted) return; sStarted = true; T('search_started', { first_field: k }); }
  var VIA = { top: 'top', grp: 'group', all: 'alpha' };
  function ctxFields() { return ['c', 't', 'p'].filter(function (k) { return sel[k]; }); }
  var MAX = 10, TOP = 12, PERTIP = 6, ROWS = 7, ROWS_P = 8, CHIPS = 14, MINQ = 3;
  var mq = window.matchMedia('(max-width: 700px)');
  var mobile = function () { return mq.matches; };

  var fmt = function (n, d) { return new Intl.NumberFormat('ro-RO', { maximumFractionDigits: d == null ? 2 : d }).format(n); };
  var norm = function (s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var lower = function (s) { return String(s).charAt(0).toLowerCase() + String(s).slice(1); };
  function pl(n, one, many) { return n === 1 ? '1 ' + one : (n < 20 ? n + ' ' + many : n + ' de ' + many); }
  function unitRo(u) { return (u || '').replace(' apa', ' apă').replace('1000', '1.000').replace(' sem', ' sămânță'); }
  function fmtDoza(r, cuUnit) { return (r[3] === r[4] ? fmt(r[3], 4) : fmt(r[3], 4) + '–' + fmt(r[4], 4)) + (cuUnit === false ? '' : ' ' + unitRo(r[5])); }
  function pauza(v) { return v == null ? 'fără pauză în registru' : 'pauză ' + v + (v === 1 ? ' zi' : ' zile'); }
  function modLabel(m) { return { foliar: 'aplicare foliară', postemergent: 'postemergent', preemergent: 'preemergent', preplantare: 'înainte de plantare', tratament_samanta: 'tratament la sămânță', postrecoltare: 'după recoltare' }[m] || m; }
  function dataRo(s) { return s ? s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4) : ''; }
  var TIP = { daunator: ['dăunător', 'dăunători', 'Dăunător', 'bug', 'c-bug'], boala: ['boală', 'boli', 'Boală', 'leaf', 'c-leaf'], buruiana: ['buruiană', 'buruieni', 'Buruiană', 'weed', 'c-weed'], fiziologic: ['problemă fiziologică', 'probleme fiziologice', 'Fiziologic', 'leaf', 'c-fiz'] };
  var TIPP = { Erbicid: 'erbicide', Fungicid: 'fungicide', Insecticid: 'insecticide', Moluscocid: 'moluscocide', 'Regulator de crestere': 'regulatoare de creștere', Rodenticid: 'rodenticide', Nematocid: 'nematocide', Altul: 'alte produse' };
  function tipCls(t) { return { Insecticid: 'tip', Erbicid: 'erb', Fungicid: 'fun' }[t] || 'alt'; }
  var ICO = {
    bottle: '<path d="M9 3h6v3l2 3v12H7V9l2-3z"/><path d="M9 13h6"/>',
    wheat: '<path d="M12 21V9M12 9c-3 0-5-2-5-5 3 0 5 2 5 5zM12 9c3 0 5-2 5-5-3 0-5 2-5 5zM12 15c-3 0-5-2-5-5 3 0 5 2 5 5zM12 15c3 0 5-2 5-5-3 0-5 2-5 5z"/>',
    bug: '<circle cx="12" cy="13" r="5"/><path d="M12 8V5M7 10l-3-2M17 10l3-2M7 15H4M17 15h3M8 19l-2 2M16 19l2 2"/>',
    leaf: '<path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z"/><path d="M5 19l8-8"/>',
    weed: '<path d="M12 21v-9M12 12c-4 0-6-3-6-7 4 0 6 3 6 7zM12 12c4 0 6-3 6-7-4 0-6 3-6 7zM8 21h8"/>'
  };
  function ico(n) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICO[n] + '</svg>'; }
  var KL = { c: 'Cultură', t: 'Dăunător / boală / buruiană', p: 'Produs (opțional)' };
  var KS = { c: 'cultură', t: 'dăunător', p: 'produs' };
  var PH = { c: 'Scrie sau alege cultura…', t: 'Scrie sau alege dăunătorul…', p: 'Toate produsele omologate' };
  var IDX = { p: 0, c: 1, t: 2 };

  /* ---------- date ---------- */
  var D = null, E = { c: {}, t: {}, p: {} }, N = { c: 0, t: 0, p: 0 }, sel = { c: null, t: null, p: null }, expanded = {};
  function icoOf(it) { return it.k === 'c' ? 'wheat' : it.k === 'p' ? 'bottle' : TIP[it.e.tip] ? TIP[it.e.tip][3] : 'leaf'; }
  fetch('assets/calc-data.json').then(function (r) { return r.json(); }).then(function (data) {
    D = data;
    var syn = { c: {}, t: {} };
    ((data.sinonime || {}).cultura || []).forEach(function (s) { (syn.c[s[0]] = syn.c[s[0]] || []).push(s[1]); });
    ((data.sinonime || {}).tinta || []).forEach(function (s) { (syn.t[s[0]] = syn.t[s[0]] || []).push(s[1]); });
    Object.keys(data.culturi).forEach(function (id) { id = Number(id); var sy = syn.c[id] || []; E.c[id] = { id: id, k: 'c', nume: data.culturi[id], parent: (data.parinti || {})[id] || null, syn: sy, key: norm(data.culturi[id] + ' ' + sy.join(' ')) }; });
    Object.keys(data.tinte).forEach(function (id) { id = Number(id); var sy = syn.t[id] || []; E.t[id] = { id: id, k: 't', nume: data.tinte[id][0], tip: data.tinte[id][1], syn: sy, key: norm(data.tinte[id][0] + ' ' + sy.join(' ')) }; });
    data.produse.forEach(function (p) { E.p[p[0]] = { id: p[0], k: 'p', nume: p[1], tip: p[3], exp: p[4], syn: p[5] || [], key: norm(p[1] + ' ' + (p[5] || []).join(' ')) }; });
    Object.keys(E.c).forEach(function (id) { var par = E.c[id].parent; if (par && E.c[par]) (E.c[par].children = E.c[par].children || []).push(Number(id)); });
    N.c = Object.keys(E.c).length; N.t = Object.keys(E.t).length; N.p = Object.keys(E.p).length;
    root.classList.add('is-ready');
    updateGo();
  }).catch(function () { ['c', 't', 'p'].forEach(function (k) { F[k].input.disabled = true; F[k].input.placeholder = 'Datele nu s-au putut încărca.'; F[k].field.classList.add('is-off'); }); });

  function ctxRecs(skip) {
    return D.recs.filter(function (r) { return (skip === 'p' || !sel.p || r[0] === sel.p) && (skip === 'c' || !sel.c || r[1] === sel.c) && (skip === 't' || !sel.t || r[2] === sel.t); });
  }
  function kindWord(tids, n) {
    var kinds = {}; tids.forEach(function (t) { kinds[E.t[t].tip] = 1; }); var k = Object.keys(kinds);
    return k.length === 1 && TIP[k[0]] ? pl(n, TIP[k[0]][0], TIP[k[0]][1]) : pl(n, 'problemă', 'probleme');
  }
  /* valorile posibile pentru câmpul k, în contextul celorlalte câmpuri alese, cu numărul dimensiunii „celeilalte” */
  function items(k) {
    if (!D) return [];
    var rs = ctxRecs(k), i = IDX[k], cd = k === 'p' ? (sel.c ? 2 : 1) : (sel.p ? (k === 'c' ? 2 : 1) : 0);
    var m = {}, dose = {};
    rs.forEach(function (r) { var id = r[i]; (m[id] = m[id] || {})[r[cd]] = 1; if (k === 'p' && sel.c && sel.t) dose[id] = r; });
    return Object.keys(m).map(Number).map(function (id) {
      var ids = Object.keys(m[id]).map(Number), n = ids.length;
      return { e: E[k][id], id: id, k: k, cnt: n, lbl: cd === 0 ? pl(n, 'produs', 'produse') : cd === 1 ? pl(n, 'cultură', 'culturi') : kindWord(ids, n), rec: dose[id] };
    });
  }
  var byCnt = function (a, b) { return b.cnt - a.cnt || a.e.nume.localeCompare(b.e.nume, 'ro'); };
  var byName = function (a, b) { return a.e.nume.localeCompare(b.e.nume, 'ro'); };
  function match(list, q) { var pre = [], mid = []; list.forEach(function (it) { if (norm(it.e.nume).indexOf(q) === 0) pre.push(it); else if (it.e.key.indexOf(q) >= 0) mid.push(it); }); return pre.sort(byCnt).concat(mid.sort(byCnt)); }
  function ctxText() { var p = []; if (sel.t) p.push('pentru ' + E.t[sel.t].nume); if (sel.c) p.push('la ' + E.c[sel.c].nume); if (sel.p) p.push('cu ' + E.p[sel.p].nume); return p.join(' '); }

  /* ---------- grupurile listei (desktop și mobil) ---------- */
  var lastHits = [];
  function groups(k, q) {
    var all = items(k), out = []; q = norm(q);
    if (q) {
      var hits = match(all, q); lastHits = hits;
      var others0 = 0; if (q.length >= MINQ && !hits.length) ['c', 't', 'p'].forEach(function (o) { if (o !== k && !sel[o]) others0 += match(items(o), q).length; });
      if (q.length >= MINQ) { if (hits.length || others0) TD('search_typed_' + k, 800, 'search_typed', { field: k, query: q.slice(0, 40), hits_count: hits.length, hits_in_other_field: others0 }); else TD('search_typed_' + k, 800, 'search_no_match', { field: k, query: q.slice(0, 40) }); }
      if (hits.length) { out.push({ hd: 'Potriviri pentru „' + q + '”', n: hits.length, chips: hits, limit: MAX, key: 'q' + q, icon: true }); return out; }
      var others = [];
      ['c', 't', 'p'].forEach(function (o) { if (o !== k && !sel[o]) others = others.concat(match(items(o), q).map(function (it) { it.other = true; return it; })); });
      lastHits = others;
      if (others.length) out.push({ hd: 'Nimic la ' + lower(KL[k].replace(' (opțional)', '')) + ' — potriviri în alt câmp', chips: others, limit: MAX, key: 'o' + q, icon: true });
      else out.push({ empty: 'Nimic pentru „' + q + '” în registrul ANF. Încearcă alt nume, o denumire veche sau un sinonim (ex. „păduchi”, „grau toamna”).' });
      return out;
    }
    lastHits = [];
    if (!all.length) { out.push({ empty: 'Nicio omologare în registru ' + ctxText() + '.' }); return out; }
    var ctx = ctxText(), noun = { c: 'Culturi', t: 'Dăunători, boli și buruieni', p: 'Produse' }[k];
    out.push({ hd: ctx ? noun + ' omologate ' + ctx : (k === 'p' ? 'Produse cu cele mai multe culturi omologate' : noun + ' cu cele mai multe produse omologate'), n: ctx ? all.length : null, chips: all.slice().sort(byCnt).slice(0, TOP), icon: true, key: 'top' });
    var rows = [];
    if (k === 'c') {
      var byPar = {}, cnt = {}; all.forEach(function (it) { cnt[it.id] = it; });
      all.forEach(function (it) { if (it.e.parent && E.c[it.e.parent]) (byPar[it.e.parent] = byPar[it.e.parent] || []).push(it); });
      Object.keys(byPar).map(Number).sort(function (a, b) { return byPar[b].length - byPar[a].length || (cnt[b] ? cnt[b].cnt : 0) - (cnt[a] ? cnt[a].cnt : 0); }).forEach(function (par) { rows.push({ lbl: E.c[par].nume, chips: byPar[par].sort(byCnt) }); });
      if (rows.length) out.push({ hd: 'Grupuri din registrul ANF', rows: rows, key: 'grp' });
    } else if (k === 't') {
      ['daunator', 'boala', 'buruiana', 'fiziologic'].forEach(function (tip) { var xs = all.filter(function (it) { return it.e.tip === tip; }); if (xs.length) rows.push({ lbl: TIP[tip][2].replace('Dăunător', 'Dăunători').replace('Boală', 'Boli').replace('Buruiană', 'Buruieni') + ' · ' + xs.length, chips: xs.sort(byCnt).slice(0, PERTIP) }); });
      out.push({ hd: 'Pe tipuri, din registrul ANF', rows: rows, key: 'grp' });
    } else {
      var tips = ['Erbicid', 'Fungicid', 'Insecticid'], rest = all.filter(function (it) { return tips.indexOf(it.e.tip) < 0; });
      tips.forEach(function (tip) { var xs = all.filter(function (it) { return it.e.tip === tip; }); if (xs.length) rows.push({ lbl: TIPP[tip].charAt(0).toUpperCase() + TIPP[tip].slice(1) + ' · ' + xs.length, chips: xs.sort(byCnt).slice(0, PERTIP) }); });
      if (rest.length) rows.push({ lbl: 'Altele · ' + rest.length, chips: rest.sort(byCnt).slice(0, PERTIP) });
      out.push({ hd: 'Pe tipuri, din registrul ANF', rows: rows, key: 'grp' });
    }
    out.push({ hd: (k === 'c' ? 'Toate culturile' : k === 't' ? 'Toate' : 'Toate produsele') + ', alfabetic', n: all.length, chips: all.slice().sort(byName), limit: MAX, key: 'all', nocnt: true });
    return out;
  }
  function chipHtml(it, first, icon, nocnt, g, pos) {
    var sec = nocnt ? '' : '<small>' + esc(it.rec ? fmtDoza(it.rec) : first ? it.lbl : String(it.cnt)) + '</small>';
    return '<button type="button" class="schip" role="option" data-k="' + it.k + '" data-id="' + it.id + '" data-g="' + (g || '') + '" data-pos="' + (pos == null ? '' : pos) + '">' + (icon ? ico(icoOf(it)) : '') + '<span>' + esc(it.e.nume) + '</span>' + sec + (it.other ? '<em>' + KS[it.k] + '</em>' : '') + '</button>';
  }
  function chipsHtml(chips, g, key) {
    var lim = g.limit && !expanded[key] ? g.limit : chips.length, h = '';
    var gk = (g.key || '').charAt(0) === 'q' ? 'typed' : (g.key || '').charAt(0) === 'o' ? 'other_field' : VIA[g.key] || g.key;
    chips.slice(0, lim).forEach(function (it, i) { h += chipHtml(it, i === 0, g.icon, g.nocnt, gk, i); });
    if (chips.length > lim) h += '<button type="button" class="schip more" data-more="' + key + '">… încă ' + (chips.length - lim) + '</button>';
    return h;
  }
  function groupsHtml(k, q, keys) {
    var h = '';
    groups(k, q).forEach(function (g) {
      if (g.empty) { h += '<p class="empty">' + esc(g.empty) + '</p>'; return; }
      var key = k + ':' + g.key;
      h += '<div class="sgrp"><div class="hd">' + esc(g.hd) + (g.n != null ? '<small>' + g.n + '</small>' : '') + '</div>';
      if (g.rows) g.rows.forEach(function (r) { h += '<div class="swrap"><span class="lbl">' + esc(r.lbl) + '</span>' + chipsHtml(r.chips, g, key) + '</div>'; });
      else h += '<div class="swrap">' + chipsHtml(g.chips, g, key) + '</div>';
      h += '</div>';
    });
    if (keys) h += '<div class="skeys"><span>↑ ↓  navighează</span><span>Enter  alege</span><span>Tab  câmpul următor</span><span>Esc  închide</span></div>';
    return h;
  }

  /* ---------- câmpurile din bară ---------- */
  var active = null, chips = [], hi = -1, F = {};
  function SField(k) {
    var self = this; this.k = k; this.el = root.querySelector('.sfield[data-k="' + k + '"]'); this.field = this.el.querySelector('.field'); this.input = this.el.querySelector('input'); this.txt = this.el.querySelector('.txt'); this.x = this.el.querySelector('.x');
    this.input.addEventListener('focus', function () { if (mobile()) { self.input.blur(); openPicker(searchClient(k)); return; } self.field.classList.add('is-on'); active = k; renderDD(); });
    this.input.addEventListener('blur', function () { self.field.classList.remove('is-on'); });
    this.input.addEventListener('input', function () { if (sel[k]) clearField(k, false); renderDD(); updateGo(); });
    this.input.addEventListener('keydown', function (ev) { onKey(ev, self.input); });
    this.x.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); clearField(k, true); if (!mobile()) self.input.focus(); });
    this.el.addEventListener('pointerdown', function (ev) { if (mobile()) { if (!ev.target.closest('.x')) ev.preventDefault(); return; } if (sel[k] && !ev.target.closest('.x')) { ev.preventDefault(); if (dd.hidden || active !== k) { active = k; self.field.classList.add('is-on'); renderDD(); } else closeDD(); } });
    this.el.addEventListener('click', function (ev) { if (mobile() && !ev.target.closest('.x')) { ev.preventDefault(); openPicker(searchClient(k)); } });
  }
  ['c', 't', 'p'].forEach(function (k) { F[k] = new SField(k); });

  function setField(k, e, silent, via, pos) {
    T('search_field_set', { field: k, id: e.id, nume: e.nume, tip: e.tip || null, via: via || 'unknown', position: pos == null ? null : pos, context_fields: ctxFields() });
    var f = F[k]; sel[k] = e.id; f.txt.textContent = e.nume; f.txt.hidden = false; f.x.hidden = false; f.field.classList.add('is-set', 'is-on'); f.input.value = '';
    setTimeout(function () { f.field.classList.remove('is-on'); }, 250);
    if (silent) return;
    closeDD(); updateGo(); renderRes(true);
  }
  /* completează mai multe câmpuri deodată (din rândurile de rezultate) și afișează un singur rezultat */
  function setMany(p, c, t) {
    if (p != null && E.p[p] && sel.p !== p) setField('p', E.p[p], true, 'result_row');
    if (c != null && E.c[c] && sel.c !== c) setField('c', E.c[c], true, 'result_row');
    if (t == null && p != null && c != null) { var ts = {}; D.recs.forEach(function (r) { if (r[0] === p && r[1] === c) ts[r[2]] = 1; }); var k = Object.keys(ts); if (k.length === 1) t = Number(k[0]); }
    if (t != null && E.t[t] && sel.t !== t) setField('t', E.t[t], true, 'result_row');
    closeDD(); updateGo(); renderRes(true);
  }
  function clearField(k, notify) {
    if (notify) T('search_field_cleared', { field: k });
    var f = F[k]; sel[k] = null; f.txt.hidden = true; f.x.hidden = true; f.field.classList.remove('is-set'); f.input.value = '';
    if (notify) { updateGo(); renderRes(); }
  }
  function pickItem(it) { if (it.other) F[it.k].input.value = ''; setField(it.k, it.e, false, it.via || (it.other ? 'other_field' : 'typed'), it.pos); }
  function renderDD() {
    if (!D || !active || mobile()) return;
    var q = F[active].input.value;
    if (dd.hidden) { startSearch(active); T('search_field_opened', { field: active, picker: 'dropdown', context_fields: ctxFields() }); }
    dd.innerHTML = groupsHtml(active, q, true); dd.hidden = false; bar.classList.add('is-open'); F[active].input.setAttribute('aria-expanded', 'true');
    chips = Array.prototype.slice.call(dd.querySelectorAll('.schip[data-id]')); hi = norm(q) && chips.length ? 0 : -1; paintHi();
    updateGo();
  }
  function closeDD() { dd.hidden = true; dd.innerHTML = ''; bar.classList.remove('is-open'); chips = []; hi = -1; ['c', 't', 'p'].forEach(function (k) { F[k].input.setAttribute('aria-expanded', 'false'); }); }
  function paintHi(list) { (list || chips).forEach(function (c, i) { c.classList.toggle('is-hi', i === hi); if (i === hi) c.scrollIntoView({ block: 'nearest' }); }); }
  function onKey(ev, input) {
    var list = input === spIn ? spChips : chips, q = input.value;
    if (ev.key === 'Escape') { if (input === spIn) closePicker(); else { closeDD(); input.blur(); } return; }
    if (ev.key === 'Tab') { closeDD(); return; }
    if (!list.length && ev.key !== 'Enter') { if (ev.key === 'ArrowDown' && input !== spIn) { renderDD(); ev.preventDefault(); } return; }
    if (ev.key === 'ArrowDown') { hi = (hi + 1) % list.length; paintHi(list); ev.preventDefault(); }
    else if (ev.key === 'ArrowUp') { hi = (hi - 1 + list.length) % list.length; paintHi(list); ev.preventDefault(); }
    else if (ev.key === 'Enter') { ev.preventDefault(); if (hi >= 0 && list[hi]) list[hi].click(); else if (input === spIn) { if (spGo.hidden) { var cq = spIn.value, cc = spC; if (cc && cc.goOn(cq)) { closePicker(); cc.onGo(cq); } } else if (!spGo.disabled) spGo.click(); } else if (norm(q) && lastHits.length) pickItem(lastHits[0]); }
  }
  function onListClick(ev) {
    var m = ev.target.closest('.schip.more'); if (m) { T('search_more_expanded', { field: active, group: (m.getAttribute('data-more') || '').split(':')[1] || null, hidden_count: parseInt((m.textContent.match(/\d+/) || [0])[0], 10) }); if (ev.currentTarget === spList) { if (spC) spC.more(m.getAttribute('data-more')); renderPick(); } else { expanded[m.getAttribute('data-more')] = 1; renderDD(); } return; }
    var c = ev.target.closest('.schip[data-id]'); if (!c) return;
    if (ev.currentTarget === spList) { var cl = spC; closePicker(); if (cl) cl.pick(c); return; }
    var it = { k: c.getAttribute('data-k'), id: Number(c.getAttribute('data-id')), via: c.getAttribute('data-g') || null, pos: c.getAttribute('data-pos') ? Number(c.getAttribute('data-pos')) : null }; it.e = E[it.k][it.id]; it.other = active !== it.k;
    pickItem(it);
  }
  root.querySelectorAll('.ichip[data-soon]').forEach(function (b) { b.addEventListener('click', function () { T(/Dictează/.test(b.getAttribute('aria-label')) ? 'search_mic_clicked' : 'search_scan_clicked', {}); }); });
  dd.addEventListener('mousedown', function (ev) { ev.preventDefault(); });
  dd.addEventListener('click', onListClick);
  document.addEventListener('mousedown', function (ev) { if (!dd.hidden && !bar.contains(ev.target)) closeDD(); });

  /* ---------- butonul Caută ---------- */
  /* „Caută” devine activ doar cu toate cele trei câmpuri alese; alegerea unei valori afișează oricum fișa automat,
     așa că butonul rămâne vizibil dar inactiv cât timp rezultatul afișat corespunde exact alegerilor */
  var shownKey = '';
  function selKey() { return [sel.c, sel.t, sel.p].join('|'); }
  function goState(q) { return !!(sel.c && sel.t && sel.p) && !(shownKey === selKey() && !res.hidden); }
  function updateGo() {
    var q = active && !mobile() ? F[active].input.value : '';
    var on = goState(q); go.classList.toggle('is-on', on); go.disabled = !on;
    var onM = !!(spC && !pick.hidden && spC.goOn(spIn.value)); spGo.classList.toggle('is-on', onM); spGo.disabled = !onM;
  }
  go.addEventListener('click', function () {
    if (!goState()) return;
    T('search_submitted', { fields_set: ctxFields(), trigger: 'button' });
    closeDD(); renderRes(); if (!res.hidden) res.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  /* ---------- selectorul pe tot ecranul (mobil) — generic: căutarea și calculatorul îi dau câte un „client” ---------- */
  var spChips = [], spC = null;
  function searchClient(k) {
    return {
      title: { c: 'Alege cultura', t: 'Alege dăunătorul', p: 'Alege produsul' }[k], label: KL[k], ph: PH[k], ico: ico(k === 'c' ? 'wheat' : k === 't' ? 'bug' : 'bottle'), go: null,
      onOpen: function () { if (!D) return false; active = k; expanded = {}; startSearch(k); T('search_field_opened', { field: k, picker: 'fullscreen', context_fields: ctxFields() }); return true; },
      onClose: function () { active = null; updateGo(); },
      render: function (q) { return groupsHtml(k, q, false); },
      pick: function (el) { var it = { k: el.getAttribute('data-k'), id: Number(el.getAttribute('data-id')), via: el.getAttribute('data-g') || null, pos: el.getAttribute('data-pos') ? Number(el.getAttribute('data-pos')) : null }; it.e = E[it.k][it.id]; it.other = k !== it.k; pickItem(it); },
      more: function (key) { expanded[key] = 1; },
      goOn: function (q) { return goState(q); },
      onGo: function (q) { if (norm(q) && lastHits.length) { pickItem(lastHits[0]); return; } if (sel.c || sel.t || sel.p) { renderRes(); if (!res.hidden) res.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }
    };
  }
  /* iPhone: când apare tastatura, Safari derulează ecranul ca să arate câmpul, iar titlul și săgeata „înapoi” ieșeau din ecran.
     Selectorul se lipește de partea vizibilă a ecranului (visualViewport), deasupra tastaturii. */
  function lipestePeEcran(el) {
    var vv = window.visualViewport; if (!vv) return function () {};
    var f = function () { el.style.top = vv.offsetTop + 'px'; el.style.height = vv.height + 'px'; el.style.bottom = 'auto'; };
    vv.addEventListener('resize', f); vv.addEventListener('scroll', f); f();
    return function () { vv.removeEventListener('resize', f); vv.removeEventListener('scroll', f); el.style.top = el.style.height = el.style.bottom = ''; };
  }
  var dezlipeste = function () {};
  function openPicker(client) {
    if (client.onOpen && client.onOpen() === false) return;
    spC = client;
    document.getElementById('sp-title').textContent = client.title; document.getElementById('sp-l').textContent = client.label; document.getElementById('sp-i').innerHTML = client.ico; spGo.textContent = client.go || 'Caută'; spGo.hidden = !client.go;
    spIn.value = ''; spIn.placeholder = client.ph; pick.hidden = false; document.documentElement.classList.add('is-locked');
    renderPick(); dezlipeste = lipestePeEcran(pick); try { spIn.focus({ preventScroll: true }); } catch (e) { spIn.focus(); }
  }
  function closePicker() { if (pick.hidden) return; dezlipeste(); dezlipeste = function () {}; pick.hidden = true; document.documentElement.classList.remove('is-locked'); spChips = []; hi = -1; var c = spC; spC = null; if (c && c.onClose) c.onClose(); }
  function renderPick() {
    if (!spC) return;
    var q = spIn.value; spList.innerHTML = spC.render(q);
    spChips = Array.prototype.slice.call(spList.querySelectorAll('.schip[data-id]')); hi = norm(q) && spChips.length ? 0 : -1; paintHi(spChips);
    document.getElementById('sp-x').hidden = !q; updateGo();
  }
  spIn.addEventListener('input', renderPick);
  spIn.addEventListener('keydown', function (ev) { onKey(ev, spIn); });
  spList.addEventListener('click', onListClick);
  document.getElementById('sp-back').addEventListener('click', closePicker);
  document.getElementById('sp-x').addEventListener('click', function () { spIn.value = ''; renderPick(); try { spIn.focus({ preventScroll: true }); } catch (e) { spIn.focus(); } });
  spGo.addEventListener('click', function () { var q = spIn.value, c = spC; closePicker(); if (c) c.onGo(q); });
  window.PesticidPicker = { open: openPicker, close: closePicker, mobile: mobile, chip: function (html, i) { return html; } };

  /* ---------- rezultate ---------- */
  function setMode(m) {
    tabs.forEach(function (t, i) { var on = (i === 0) === (m === 'calc'); t.classList.toggle('is-on', on); t.setAttribute('aria-selected', on ? 'true' : 'false'); });
    /* pe desktop, tabul Caută Produse păstrează aceeași înălțime a hero-ului ca tabul Calculator (fotografia rămâne la fel de vizibilă) */
    if (m === 'search' && calcEl && !mobile()) { calcEl.hidden = false; root.style.minHeight = Math.round(calcEl.getBoundingClientRect().height) + 'px'; } else root.style.minHeight = '';
    if (calcEl) calcEl.hidden = m !== 'calc'; root.hidden = m !== 'search';
  }
  if (tabs.length > 1) { tabs[0].addEventListener('click', function () { if (!root.hidden) T('hero_tab_switched', { from: 'search', to: 'calc' }); setMode('calc'); }); tabs[1].addEventListener('click', function () { if (root.hidden) T('hero_tab_switched', { from: 'calc', to: 'search' }); setMode('search'); }); }
  window.addEventListener('resize', function () { if (!root.hidden) setMode('search'); });
  function goCalc(p, c, t) {
    if (!window.PesticidCalc || !window.PesticidCalc.set(p, c, t)) return;
    setMode('calc'); setTimeout(function () { calcEl.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 0);
  }
  function renderRes(scroll) {
    var key = (sel.p ? 'p' : '') + (sel.c ? 'c' : '') + (sel.t ? 't' : '');
    if (!key || !D) { res.hidden = true; res.innerHTML = ''; shownKey = ''; updateGo(); return; }
    res.innerHTML = { c: cardC, t: cardT, p: cardP, ct: listCT, pc: listPC, pt: listPT, pct: cardPCT }[key]();
    res.hidden = false; shownKey = selKey(); updateGo();
    var rs0 = ctxRecs(); T(key === 'pct' ? 'search_calc_shown' : 'search_result_shown', { result_type: key, cultura_id: sel.c, tinta_id: sel.t, produs_id: sel.p, omologari: rs0.length, produse: distinct(rs0, 0).length, culturi: distinct(rs0, 1).length, probleme: distinct(rs0, 2).length });
    if (key === 'pct') initForm();
    if (scroll && mobile()) setTimeout(function () { res.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50);
  }
  res.addEventListener('click', function (ev) {
    var tgt = ev.target.closest('[data-more]') ? 'more' : ev.target.closest('[data-calc]') ? 'calc_row' : ev.target.closest('[data-ct]') ? 'dose_chip' : ev.target.closest('[data-k="t"]') ? 'problem' : ev.target.closest('[data-k="c"]') ? 'crop' : ev.target.closest('[data-k="p"]') ? 'product' : null;
    if (tgt) T('search_result_clicked', { result_type: (sel.p ? 'p' : '') + (sel.c ? 'c' : '') + (sel.t ? 't' : ''), target: tgt });
    var m = ev.target.closest('[data-more]'); if (m) { expanded[m.getAttribute('data-more')] = 1; renderRes(); return; }
    var openB = ev.target.closest('[data-open]'); if (openB) { ev.preventDefault(); goCalc(sel.p, sel.c, sel.t); return; }
    if (ev.target.closest('#sf-go')) { calcForm(); return; }
    if (ev.target.closest('.sform .x')) { var inp = ev.target.closest('.field').querySelector('input'); inp.value = ''; checkForm(); inp.focus(); return; }
    var calcB = ev.target.closest('[data-calc]'); if (calcB) { ev.stopPropagation(); var v = calcB.getAttribute('data-calc').split(','); setMany(Number(v[0]), v[1] ? Number(v[1]) : null, v[2] ? Number(v[2]) : null); return; }
    var pair = ev.target.closest('[data-ct]'); if (pair) { ev.stopPropagation(); var w = pair.getAttribute('data-ct').split(','); setMany(sel.p, Number(w[0]), Number(w[1])); return; }
    var el = ev.target.closest('[data-k][data-id]'); if (!el) return;
    setField(el.getAttribute('data-k'), E[el.getAttribute('data-k')][Number(el.getAttribute('data-id'))], false, 'result_card');
  });
  function distinct(rs, i) { var m = {}; rs.forEach(function (r) { m[r[i]] = 1; }); return Object.keys(m).map(Number); }
  function pairs(rs, a, b) { var m = {}; rs.forEach(function (r) { m[r[a] + '|' + r[b]] = 1; }); return Object.keys(m).length; }
  function breakdown(ids, k) {
    var m = {}; ids.forEach(function (id) { var e = E[k][id]; m[e.tip] = (m[e.tip] || 0) + 1; });
    return Object.keys(m).sort(function (a, b) { return m[b] - m[a]; }).map(function (tip) { return k === 't' ? (TIP[tip] ? pl(m[tip], TIP[tip][0], TIP[tip][1]).replace(/^1 problemă fiziologică$/, '1 fiziologică') : m[tip] + ' ' + tip) : (m[tip] === 1 ? '1 ' + lower(tip) : m[tip] + (m[tip] < 20 ? ' ' : ' de ') + (TIPP[tip] || lower(tip))); }).join(' · ');
  }
  function modes(rs) { var m = {}; rs.forEach(function (r) { if (r[7]) m[r[7]] = 1; }); var k = Object.keys(m); return k.length === 1 ? modLabel(k[0]) : ''; }
  function stat(k, v, s) { return '<div class="sstat"><div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + '</div><div class="s">' + esc(s) + '</div></div>'; }
  function more(key, text) { return '<button type="button" class="smore" data-more="' + key + '">' + esc(text) + '</button>'; }
  function names(ids, k, n) { var xs = ids.map(function (id) { return k === 'c' ? E[k][id].nume.toLowerCase() : E[k][id].nume; }).sort(function (a, b) { return a.localeCompare(b, 'ro'); }); return xs.slice(0, n).join(', ') + (xs.length > n ? '…' : ''); }

  /* fișa culturii (Search v3, cadrul 8) */
  function cardC() {
    var c = E.c[sel.c], rs = D.recs.filter(function (r) { return r[1] === c.id; }), ts = distinct(rs, 2), ps = distinct(rs, 0);
    var sub = []; if (c.parent && E.c[c.parent]) sub.push('grup „' + E.c[c.parent].nume + '” în registrul ANF'); if (c.syn.length) sub.push('sinonime în bază: ' + c.syn.join(', ')); if (c.children) sub.push('subtipuri: ' + c.children.map(function (id) { return E.c[id].nume; }).join(', ')); if (!sub.length) sub.push('cultură din registrul ANF');
    var h = '<div class="scard"><div class="sc-head"><div><h3>' + esc(c.nume) + '</h3><p>' + esc(sub.join(' · ')) + '</p></div><div class="sc-tags">' + (c.parent && E.c[c.parent] ? '<span class="stag lime">' + esc(E.c[c.parent].nume) + '</span>' : '') + '</div></div>';
    h += '<div class="sc-stats">' + stat('Probleme omologate', ts.length, breakdown(ts, 't')) + stat('Produse omologate', ps.length, breakdown(ps, 'p')) + stat('Omologări (dăunător × produs)', pairs(rs, 2, 0), 'toate cu doză calculabilă') + '</div>';
    h += '<p class="sc-lead">Alege problema — numărul arată câte produse omologate sunt pentru ea la ' + esc(lower(c.nume)) + '</p><div class="sc-cols">';
    ['daunator', 'boala', 'buruiana', 'fiziologic'].forEach(function (tip) {
      var xs = ts.filter(function (t) { return E.t[t].tip === tip; }); if (!xs.length) return;
      var cnt = {}; rs.forEach(function (r) { if (E.t[r[2]].tip === tip) (cnt[r[2]] = cnt[r[2]] || {})[r[0]] = 1; });
      xs = xs.map(function (t) { return { id: t, n: Object.keys(cnt[t]).length }; }).sort(function (a, b) { return b.n - a.n || E.t[a.id].nume.localeCompare(E.t[b.id].nume, 'ro'); });
      var key = 'c' + c.id + ':' + tip, lim = expanded[key] ? xs.length : ROWS;
      h += '<div class="scol"><div class="ch"><span class="ichip ' + TIP[tip][4] + '">' + ico(TIP[tip][3]) + '</span>' + esc(TIP[tip][2].replace('Dăunător', 'Dăunători').replace('Boală', 'Boli').replace('Buruiană', 'Buruieni')) + ' · ' + xs.length + '</div>';
      xs.slice(0, lim).forEach(function (x) { h += '<button type="button" class="sitem" data-k="t" data-id="' + x.id + '"><span>' + esc(E.t[x.id].nume) + '</span><span class="stag' + (x.n >= 10 ? ' lime' : '') + '">' + pl(x.n, 'produs', 'produse') + '</span></button>'; });
      if (xs.length > lim) h += more(key, '+ încă ' + pl(xs.length - lim, TIP[tip][0], TIP[tip][1]).replace(/^1 /, '') + (xs.length - lim === 1 ? ' (1)' : '') + ' →');
      h += '</div>';
    });
    return h + '</div></div>';
  }
  /* fișa dăunătorului / bolii / buruienii (cadrul 9) */
  function cardT() {
    var t = E.t[sel.t], rs = D.recs.filter(function (r) { return r[2] === t.id; }), cs = distinct(rs, 1), ps = distinct(rs, 0), tp = TIP[t.tip] || TIP.fiziologic;
    var sub = [tp[0]]; if (t.syn.length) sub.push('sinonime în bază: ' + t.syn.join(', '));
    var h = '<div class="scard"><div class="sc-head"><div><h3>' + esc(t.nume) + '</h3><p>' + esc(sub.join(' · ')) + '</p></div><div class="sc-tags"><span class="stag ' + { daunator: 'tip', boala: 'alt', buruiana: 'erb' }[t.tip] + '">' + esc(tp[2]) + '</span></div></div>';
    var ptip = {}; ps.forEach(function (p) { ptip[E.p[p].tip] = 1; }); var pk = Object.keys(ptip), md = modes(rs);
    h += '<div class="sc-stats">' + stat('Culturi cu produse omologate', cs.length, 'din ' + N.c) + stat('Produse omologate', ps.length, (pk.length === 1 ? 'toate ' + (TIPP[pk[0]] || lower(pk[0])) : breakdown(ps, 'p')) + (md ? ' · ' + md : '')) + stat('Omologări (cultură × produs)', pairs(rs, 1, 0), 'toate cu doză calculabilă') + '</div>';
    var cc = {}; rs.forEach(function (r) { (cc[r[1]] = cc[r[1]] || {})[r[0]] = 1; });
    var crops = cs.map(function (c) { return { id: c, n: Object.keys(cc[c]).length }; }).sort(function (a, b) { return b.n - a.n || E.c[a.id].nume.localeCompare(E.c[b.id].nume, 'ro'); });
    var key = 't' + t.id + ':c', lim = expanded[key] ? crops.length : CHIPS;
    h += '<p class="sc-lead">Alege cultura ca să calculezi — numărul arată câte produse omologate sunt pentru ' + esc(lower(t.nume)) + ' la acea cultură</p><div class="schips">';
    crops.slice(0, lim).forEach(function (x, i) { h += '<button type="button" class="schip" data-k="c" data-id="' + x.id + '">' + ico('wheat') + '<span>' + esc(E.c[x.id].nume) + '</span><small>' + (i === 0 ? pl(x.n, 'produs', 'produse') : x.n) + '</small></button>'; });
    if (crops.length > lim) h += '<button type="button" class="schip more" data-more="' + key + '">… încă ' + pl(crops.length - lim, 'cultură', 'culturi') + '</button>';
    h += '</div>';
    var pc = {}, conc = {}; rs.forEach(function (r) { (pc[r[0]] = pc[r[0]] || {})[r[1]] = 1; if (/apa|%/.test(r[5])) conc[r[0]] = 1; });
    var prods = ps.map(function (p) { return { id: p, cs: Object.keys(pc[p]).map(Number) }; }).sort(function (a, b) { return b.cs.length - a.cs.length || E.p[a.id].nume.localeCompare(E.p[b.id].nume, 'ro'); });
    var key2 = 't' + t.id + ':p', lim2 = expanded[key2] ? prods.length : PERTIP;
    h += '<p class="sc-lead">Produse omologate pentru ' + esc(lower(t.nume)) + ' · ' + ps.length + ' — fără cultură aleasă nu se poate calcula doza (diferă pe culturi)</p><div class="srows">';
    prods.slice(0, lim2).forEach(function (x) {
      var p = E.p[x.id], prs = rs.filter(function (r) { return r[0] === x.id; }), m2 = modes(prs);
      h += '<button type="button" class="srow" data-k="p" data-id="' + p.id + '"><span class="ichip">' + ico('bottle') + '</span><span class="t"><b>' + esc(p.nume) + '</b><span>' + esc(lower(p.tip) + (m2 ? ' · ' + m2 : '') + ' · ' + pl(x.cs.length, 'cultură', 'culturi') + ': ' + names(x.cs, 'c', 5) + (conc[x.id] ? ' · doză pe volum de apă' : '')) + '</span></span><span class="tags"><span class="stag ' + tipCls(p.tip) + '">' + esc(p.tip) + '</span><span class="stag lime">Omologat</span></span><span class="go">→ alegi cultura (' + x.cs.length + ')</span></button>';
    });
    h += '</div>';
    if (prods.length > lim2) h += '<div class="sfoot">' + more(key2, '+ încă ' + pl(prods.length - lim2, 'produs', 'produse') + ' (' + names(prods.slice(lim2).map(function (x) { return x.id; }), 'p', 12) + ') →') + '</div>';
    return h + '</div>';
  }
  /* fișa produsului (cadrul 7) */
  function cardP() {
    var p = E.p[sel.p], rs = D.recs.filter(function (r) { return r[0] === p.id; }), cs = distinct(rs, 1), ts = distinct(rs, 2), md = modes(rs);
    var sub = [p.tip]; if (p.exp) sub.push('omologare valabilă până la ' + dataRo(p.exp)); if (md) sub.push(md); if (p.syn.length) sub.push((p.syn.length === 1 ? 'sinonim' : 'sinonime') + ' în bază: ' + p.syn.join(', '));
    var h = '<div class="scard"><div class="sc-head"><div><h3>' + esc(p.nume) + '</h3><p>' + esc(sub.join(' · ')) + '</p></div><div class="sc-tags"><span class="stag ' + tipCls(p.tip) + '">' + esc(p.tip) + '</span><span class="stag lime">Omologat</span></div></div>';
    var dz = {}, pz = {}, units = {}; rs.forEach(function (r) { var k = fmtDoza(r); dz[k] = (dz[k] || 0) + 1; units[r[5]] = 1; var pk = r[6] == null ? 'fără pauză' : String(r[6]); pz[pk] = (pz[pk] || 0) + 1; });
    var dzk = Object.keys(dz).sort(function (a, b) { return dz[b] - dz[a]; }), oneUnit = Object.keys(units).length === 1;
    var dzs = dzk.slice(0, 3).map(function (k, i) { return (i && oneUnit ? k.replace(/ .*$/, '') : k) + ' (' + dz[k] + ')'; }).join(' · ') + (dzk.length > 3 ? ' · …' : '');
    var pzn = Object.keys(pz).filter(function (k) { return k !== 'fără pauză'; }).map(Number).sort(function (a, b) { return a - b; });
    var pzv = pzn.length ? (pzn[0] === pzn[pzn.length - 1] ? pzn[0] + ' zile' : pzn[0] + '–' + pzn[pzn.length - 1] + ' zile') : 'fără pauză';
    var pzs = Object.keys(pz).sort(function (a, b) { return pz[b] - pz[a]; }).map(function (k) { return k + ' (' + pz[k] + ')'; }).join(' · ');
    var kinds = {}; ts.forEach(function (t) { kinds[E.t[t].tip] = 1; }); var kk = Object.keys(kinds);
    h += '<div class="sc-stats">' + stat('Culturi omologate', cs.length, 'din ' + N.c) + stat('Omologări (cultură × dăunător)', pairs(rs, 1, 2), (kk.length === 1 && TIP[kk[0]] ? 'toate ' + TIP[kk[0]][1] : breakdown(ts, 't')) + (md ? ' · ' + md : '')) + stat('Doze în registru', dzk.length, dzs) + stat('Pauză până la recoltare', pzv, pzs) + '</div>';
    h += '<p class="sc-lead">Omologări pe culturi — apasă „Calculează” ca să completezi cultura; dacă rămâne un singur dăunător, se completează singur</p><div class="srows">';
    var byC = {}; rs.forEach(function (r) { (byC[r[1]] = byC[r[1]] || []).push(r); });
    var crops = cs.map(function (c) { var xs = byC[c], seen = {}, list = []; xs.forEach(function (r) { if (!seen[r[2]]) { seen[r[2]] = 1; list.push(r); } }); return { id: c, rs: list }; }).sort(function (a, b) { return b.rs.length - a.rs.length || E.c[a.id].nume.localeCompare(E.c[b.id].nume, 'ro'); });
    var key = 'p' + p.id + ':c', lim = expanded[key] ? crops.length : ROWS_P;
    crops.slice(0, lim).forEach(function (x) {
      var pzc = {}; x.rs.forEach(function (r) { pzc[r[6] == null ? 'x' : r[6]] = 1; }); var pk = Object.keys(pzc).filter(function (k) { return k !== 'x'; }).map(Number).sort(function (a, b) { return a - b; });
      var ptag = pk.length ? 'pauză ' + (pk[0] === pk[pk.length - 1] ? pk[0] : pk[0] + '–' + pk[pk.length - 1]) + ' zile' : 'fără pauză în registru';
      var u1 = x.rs[0][5], same = x.rs.every(function (r) { return r[5] === u1; });
      h += '<div class="srow crop"><span class="cn">' + ico('wheat') + '<span>' + esc(E.c[x.id].nume) + '</span><small>' + kindWord(x.rs.map(function (r) { return r[2]; }), x.rs.length) + '</small></span><span class="chips">';
      x.rs.forEach(function (r, i) { h += '<button type="button" class="stag" data-ct="' + x.id + ',' + r[2] + '" title="Calculează pentru ' + esc(E.t[r[2]].nume) + '">' + esc(E.t[r[2]].nume) + '<small>' + esc(fmtDoza(r, i === 0 || !same)) + '</small></button>'; });
      h += '</span><span class="tags"><span class="stag">' + esc(ptag) + '</span></span><button type="button" class="sbtn" data-calc="' + p.id + ',' + x.id + '">Calculează</button></div>';
    });
    h += '</div>';
    var rest = crops.slice(lim);
    h += '<div class="sfoot">' + (rest.length ? more(key, '+ încă ' + pl(rest.length, 'cultură', 'culturi') + ' · ' + pl(rest.reduce(function (s, x) { return s + x.rs.length; }, 0), 'omologare', 'omologări') + ' (' + names(rest.map(function (x) { return x.id; }), 'c', 20) + ') →') : '<span>' + esc(pl(crops.length, 'cultură omologată', 'culturi omologate')) + '</span>') + '<span>Sursa: registrul ANF, doze omologate</span></div>';
    return h + '</div>';
  }
  /* toate trei alese → fișa omologării, cu calculul cantității în același loc (Search v3, cadrul 3) */
  var recPCT = null;
  function cardPCT() {
    var p = E.p[sel.p], c = E.c[sel.c], t = E.t[sel.t], PC = window.PesticidCalc;
    var rs = ctxRecs().slice().sort(function (a, b) { var s = function (u) { return /\/ha$/.test(u) ? 2 : /apa|%/.test(u) ? 1 : 0; }; return s(b[5]) - s(a[5]); });
    var r = recPCT = rs[0] || null;
    var h = '<div class="scard sc-pct">';
    if (!r) return h + '<div class="sc-head"><div><h3>' + esc(p.nume) + ' la ' + esc(lower(c.nume)) + ' pentru ' + esc(lower(t.nume)) + '</h3><p>nicio omologare în registrul ANF pentru această combinație — alege alt produs din listă</p></div></div></div>';
    h += '<div class="sc-head"><div><h3>' + esc(p.nume) + '</h3><p>' + esc(lower(p.tip) + ' omologat la ' + lower(c.nume) + ' pentru ' + lower(t.nume) + (p.exp ? ' · omologare valabilă până la ' + dataRo(p.exp) : '')) + '</p></div><div class="sc-tags"><span class="stag ' + tipCls(p.tip) + '">' + esc(p.tip) + '</span><span class="stag lime">Omologat</span></div></div>';
    var fix = r[3] === r[4], u = PC ? PC.unitRo(r[5]) : r[5];
    h += '<div class="sc-stats">' + stat('Doză omologată', PC ? PC.fmtDoza(r) : '', fix ? 'doză fixă în registru' : 'interval omologat') + stat('Pauză până la recoltare', r[6] == null ? 'fără pauză' : r[6] + (r[6] === 1 ? ' zi' : ' zile'), r[6] == null ? 'nespecificată în registrul ANF' : 'de la ultimul tratament') + stat('Mod de aplicare', r[7] ? modLabel(r[7]) : '—', r[7] ? 'conform etichetei' : 'nespecificat în registru') + stat('Cultură × dăunător', c.nume, t.nume) + '</div>';
    h += '<p class="sc-lead">Calculează cantitatea pentru suprafața ta — aceleași reguli ca în Calculator</p>';
    var pm = {}; try { pm = JSON.parse(localStorage.getItem('pesticid.site.param') || '{}') || {}; } catch (e) {}
    h += '<div class="sform"><div class="row' + (fix ? ' two' : '') + '">';
    h += '<label class="field has-input has-unit" id="sf-doza"' + (fix ? ' hidden' : '') + '><span class="col"><small>Doza ta</small><span class="val"><input id="sf-d" type="text" inputmode="decimal" autocomplete="off"' + (fix ? ' readonly value="' + esc(fmt(r[3], 4)) + '"' : ' placeholder="' + esc(fmt(r[3], 4) + '–' + fmt(r[4], 4)) + '"') + '><b class="unit">' + esc(u) + '</b><button type="button" class="x" aria-label="Șterge doza" hidden>×</button></span></span></label>';
    h += '<label class="field has-input has-unit" id="sf-ha-f"><span class="col"><small>Suprafață</small><span class="val"><input id="sf-ha" type="text" inputmode="decimal" autocomplete="off" placeholder="ex. 100"' + (pm.ha ? ' value="' + esc(pm.ha) + '"' : '') + '><b class="unit">ha</b><button type="button" class="x" aria-label="Șterge suprafața" hidden>×</button></span></span></label>';
    h += '<label class="field has-input has-unit" id="sf-apa-f"><span class="col"><small>Volum de apă</small><span class="val"><input id="sf-apa" type="text" inputmode="decimal" autocomplete="off" placeholder="ex. 200" value="' + esc(pm.apa || 200) + '"><b class="unit">L/ha</b><button type="button" class="x" aria-label="Șterge volumul de apă" hidden>×</button></span></span></label>';
    h += '</div><p class="doza-msg" id="sf-msg" role="status"></p>';
    h += '<button class="btn ghost" id="sf-go" type="button" disabled><span>Calculează</span><svg class="arr" width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>';
    h += '<div class="calc-res" id="sf-res" hidden><h4>Rezultat calculat</h4><div class="cards" id="sf-cards"></div><p class="calc-note" id="sf-note"></p><p class="res-foot">Odată ce platforma va fi funcțională, aceste rezultate pot fi salvate în Registrele tale.</p></div></div>';
    h += '<div class="sfoot"><span>Sursa: registrul ANF, doze omologate</span></div>';
    return h + '</div>';
  }
  var measure = document.createElement('span'); measure.className = 'measure'; root.appendChild(measure);
  function fitIn(input) { var f = input.closest('.field'); f.classList.toggle('is-empty', !input.value); measure.style.fontWeight = input.value ? '500' : '400'; measure.textContent = input.value || input.placeholder || ''; input.style.width = Math.max(20, measure.offsetWidth + 2) + 'px'; f.querySelector('.x').hidden = !input.value || input.readOnly; }
  function initForm() { checkForm(); var d = document.getElementById('sf-d'); if (d && !d.readOnly && !d.value) setTimeout(function () { d.focus(); }, 0); }
  function checkForm() {
    var r = recPCT, PC = window.PesticidCalc, form = res.querySelector('.sform'); if (!r || !PC || !form) return null;
    var d = document.getElementById('sf-d'), ha = document.getElementById('sf-ha'), apa = document.getElementById('sf-apa'), msg = document.getElementById('sf-msg'), go = document.getElementById('sf-go'), fd = document.getElementById('sf-doza');
    [d, ha, apa].forEach(function (i) { i.value = i.value.replace(/[^0-9.,]/g, ''); fitIn(i); });
    form.classList.remove('has-res'); document.getElementById('sf-res').hidden = true;
    fd.classList.remove('is-warn', 'is-bad'); msg.className = 'doza-msg'; msg.textContent = '';
    var fix = r[3] === r[4], dt = fix ? r[3] : PC.num(d), ok = true;
    if (!fix) { var v = PC.verif(r, dt); if (v.cls) { fd.classList.add('is-' + v.cls); msg.className = 'doza-msg ' + v.cls; msg.textContent = v.msg; if (v.cls === 'bad') ok = false; } }
    var gata = !!(dt != null && PC.num(ha) && PC.num(apa) && ok);
    go.disabled = !gata; go.classList.toggle('ghost', !gata);
    return gata ? { dt: dt, ha: PC.num(ha), apa: PC.num(apa) } : null;
  }
  function calcForm() {
    var v = checkForm(), PC = window.PesticidCalc; if (!v) return;
    var out = PC.calc(recPCT, v.dt, v.ha, v.apa);
    var r0 = recPCT; T('search_calc_result_shown', { origin: 'search', produs_id: sel.p, produs: E.p[sel.p].nume, cultura_id: sel.c, cultura: E.c[sel.c].nume, tinta_id: sel.t, tinta: E.t[sel.t].nume, ha: v.ha, apa: v.apa, doza: v.dt, unitate: r0[5], pauza: r0[6], mod: r0[7], dose_fixed: r0[3] === r0[4] });
    document.getElementById('sf-cards').innerHTML = out.html; document.getElementById('sf-note').textContent = out.note; document.getElementById('sf-res').hidden = false;
    res.querySelector('.sform').classList.add('has-res');
    document.getElementById('sf-res').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  res.addEventListener('input', function (ev) { if (ev.target.closest('.sform')) checkForm(); });
  res.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && ev.target.closest('.sform') && !document.getElementById('sf-go').disabled && !res.querySelector('.sform').classList.contains('has-res')) { ev.preventDefault(); calcForm(); } });

  /* cultură + dăunător → produsele omologate, cu doză și pauză (cadrul 2) */
  function listCT() {
    var c = E.c[sel.c], t = E.t[sel.t], rs = ctxRecs(), seen = {}, list = []; rs.forEach(function (r) { if (!seen[r[0]]) { seen[r[0]] = 1; list.push(r); } });
    list.sort(function (a, b) { return E.p[a[0]].nume.localeCompare(E.p[b[0]].nume, 'ro'); });
    var h = '<div class="scard"><div class="sc-head"><div><h3>' + pl(list.length, 'produs omologat', 'produse omologate') + ' pentru ' + esc(lower(t.nume)) + ' la ' + esc(lower(c.nume)) + '</h3><p>compari doza și pauza, apoi alegi — fiecare rând duce la calculul cantității</p></div><div class="sc-tags"><span class="stag lime">' + esc(c.nume) + '</span><span class="stag ' + { daunator: 'tip', boala: 'alt', buruiana: 'erb' }[t.tip] + '">' + esc(t.nume) + '</span></div></div>';
    if (!list.length) return h + '<p class="sc-lead">Nicio omologare în registru pentru această combinație.</p></div>';
    h += '<div class="srows">';
    list.forEach(function (r) { var p = E.p[r[0]]; h += '<button type="button" class="srow" data-calc="' + p.id + ',' + c.id + ',' + t.id + '"><span class="ichip">' + ico('bottle') + '</span><span class="t"><b>' + esc(p.nume) + '</b><span>' + esc(lower(p.tip) + (r[7] ? ' · ' + modLabel(r[7]) : '') + (p.exp ? ' · omologare valabilă până la ' + dataRo(p.exp) : '')) + '</span></span><span class="tags"><span class="stag">' + esc(fmtDoza(r) + ' · ' + pauza(r[6])) + '</span><span class="stag lime">Omologat</span></span><span class="go">→ calculezi</span></button>'; });
    return h + '</div></div>';
  }
  /* produs + cultură → dăunătorii omologați (cadrul 6) */
  function listPC() {
    var p = E.p[sel.p], c = E.c[sel.c], rs = ctxRecs(), seen = {}, list = []; rs.forEach(function (r) { if (!seen[r[2]]) { seen[r[2]] = 1; list.push(r); } });
    list.sort(function (a, b) { return E.t[a[2]].nume.localeCompare(E.t[b[2]].nume, 'ro'); });
    var h = '<div class="scard"><div class="sc-head"><div><h3>' + esc(p.nume) + ' la ' + esc(lower(c.nume)) + '</h3><p>' + (list.length ? pl(list.length, 'problemă omologată', 'probleme omologate') + ' — alege dăunătorul, boala sau buruiana; doza e din registrul ANF' : 'nicio omologare în registru pentru această combinație') + '</p></div><div class="sc-tags"><span class="stag ' + tipCls(p.tip) + '">' + esc(p.tip) + '</span><span class="stag lime">' + esc(c.nume) + '</span></div></div><div class="srows">';
    list.forEach(function (r) { var t = E.t[r[2]], tp = TIP[t.tip] || TIP.fiziologic; h += '<button type="button" class="srow" data-calc="' + p.id + ',' + c.id + ',' + t.id + '"><span class="ichip ' + tp[4] + '">' + ico(tp[3]) + '</span><span class="t"><b>' + esc(t.nume) + '</b><span>' + esc(tp[0] + (r[7] ? ' · ' + modLabel(r[7]) : '')) + '</span></span><span class="tags"><span class="stag">' + esc(fmtDoza(r) + ' · ' + pauza(r[6])) + '</span></span><span class="go">→ calculezi</span></button>'; });
    return h + '</div></div>';
  }
  /* produs + dăunător → culturile omologate (cadrul 4/5) */
  function listPT() {
    var p = E.p[sel.p], t = E.t[sel.t], rs = ctxRecs(), seen = {}, list = []; rs.forEach(function (r) { if (!seen[r[1]]) { seen[r[1]] = 1; list.push(r); } });
    list.sort(function (a, b) { return E.c[a[1]].nume.localeCompare(E.c[b[1]].nume, 'ro'); });
    var h = '<div class="scard"><div class="sc-head"><div><h3>' + esc(p.nume) + ' pentru ' + esc(lower(t.nume)) + '</h3><p>' + (list.length ? pl(list.length, 'cultură omologată', 'culturi omologate') + ' — alege cultura; doza diferă pe culturi' : 'nicio omologare în registru pentru această combinație') + '</p></div><div class="sc-tags"><span class="stag ' + tipCls(p.tip) + '">' + esc(p.tip) + '</span><span class="stag ' + { daunator: 'tip', boala: 'alt', buruiana: 'erb' }[t.tip] + '">' + esc(t.nume) + '</span></div></div><div class="srows">';
    list.forEach(function (r) { var c = E.c[r[1]]; h += '<button type="button" class="srow" data-calc="' + p.id + ',' + c.id + ',' + t.id + '"><span class="ichip">' + ico('wheat') + '</span><span class="t"><b>' + esc(c.nume) + '</b><span>' + esc((c.parent && E.c[c.parent] ? 'grup „' + E.c[c.parent].nume + '”' : 'cultură') + (r[7] ? ' · ' + modLabel(r[7]) : '')) + '</span></span><span class="tags"><span class="stag">' + esc(fmtDoza(r) + ' · ' + pauza(r[6])) + '</span></span><span class="go">→ calculezi</span></button>'; });
    return h + '</div></div>';
  }

  /* trecerea desktop ↔ mobil cu lista deschisă */
  mq.addEventListener ? mq.addEventListener('change', function () { closeDD(); if (!mq.matches) closePicker(); }) : mq.addListener(function () { closeDD(); });
})();
