#!/usr/bin/env python3
"""Versiunea poloneză a site-ului (agrosphere.eu/pl/), generată din paginile RO deja construite + dicționarul i18n/pl.json.
Rulează după build.py și build_abonamente.py. Paginile RO nu sunt modificate.
- textele vizibile (HTML, atribute, șirurile din JS) se înlocuiesc doar când se potrivesc exact cu o intrare din dicționar;
- căile relative devin absolute, legăturile interne duc la /pl/…, JS-ul tradus stă în /pl/*.js;
- Plan de fertilizare apare în meniu ca „Wkrótce” (regulile sunt cele din România);
- BETA = True: paginile au noindex și nu sunt anunțate în paginile RO (hreflang) până la lansare."""
import html, json, pathlib, re, posixpath
from lansare_pl import PL_PUBLIC
BETA = not PL_PUBLIC  # până la lansare: noindex
root = pathlib.Path(__file__).parent
D = json.loads((root / 'i18n' / 'pl.json').read_text(encoding='utf-8'))
TH = {e['text']: e['pl'] for e in D if e['tip'] in ('html', 'atribut') and e.get('pl')}
TJ = {e['text']: e['pl'] for e in D if e['tip'] == 'js' and e.get('pl')}
PAGES = {'index.html': '', 'abonamente/index.html': 'abonamente/', 'termeni/index.html': 'termeni/',
         'confidentialitate/index.html': 'confidentialitate/', 'dezabonare/index.html': 'dezabonare/'}
JS = ['main.js', 'calc.js', 'search.js', 'report.js', 'abonamente.js', 'antibot.js', 'gads.js', 'analytics.js']
PL_PAGES = {'/': '/pl/', '/abonamente/': '/pl/abonamente/', '/termeni/': '/pl/termeni/', '/confidentialitate/': '/pl/confidentialitate/',
            '/dezabonare/': '/pl/dezabonare/', '/plan-fertilizare/': '/pl/'}
ATTRS = ('placeholder', 'aria-label', 'title', 'alt', 'data-label')
URL_ATTRS = ('href', 'src', 'data-src', 'data-src-2x', 'action')
lipsa = set()
PREVIZ = False  # True la previzualizări: căile rămân relative

# ---- pluralul polonez: 1 / 2–4 (fără 12–14) / restul (genitiv plural) ----
PLURAL_PL = "var GEN = { 'dni': 'dni', 'godziny': 'godzin', 'minuty': 'minut', 'środki': 'środków', 'uprawy': 'upraw', 'agrofagi': 'agrofagów', 'rejestracje': 'rejestracji', 'szkodniki': 'szkodników', 'choroby': 'chorób', 'chwasty': 'chwastów', 'problemy fizjologiczne': 'problemów fizjologicznych', 'zarejestrowane środki': 'zarejestrowanych środków', 'zarejestrowane uprawy': 'zarejestrowanych upraw', 'zarejestrowane agrofagi': 'zarejestrowanych agrofagów' }; function maiMulte(n) { var k = n % 10, h = n % 100; return k >= 2 && k <= 4 && (h < 12 || h > 14); } var TIPN = { Erbicid: 'Herbicyd', Fungicid: 'Fungicyd', Insecticid: 'Insektycyd', Moluscocid: 'Moluskocyd', Nematocid: 'Nematocyd', Rodenticid: 'Rodentycyd', 'Regulator de crestere': 'Regulator wzrostu', Altul: 'Inny' };"
PRE_MAIN_PL = [("  document.querySelectorAll('form.reserve').forEach(function (f) {", "  /* Polonia: NIP (cifra de control) + numele firmei + voievodatul, fără ANAF — firma o verificăm manual */\n  function nipField(f, onChange) {\n    var input = f.querySelector('.field.cui input'), lbl = f.querySelector('.field.cui'), st = f.querySelector('.cui-stare');\n    var firma = f.querySelector('#firma-partener'), woj = f.querySelector('#woj-partener'), stare = 'gol';\n    function curat() { return String(input.value || '').replace(/\\D/g, ''); }\n    function valid(n) { if (!/^\\d{10}$/.test(n)) return false; var w = [6, 5, 7, 2, 3, 4, 5, 6, 7], s = 0; for (var i = 0; i < 9; i++) s += w[i] * +n[i]; s = s % 11; return s !== 10 && s === +n[9]; }\n    function set(s, msg, cls) { stare = s; lbl.classList.toggle('is-ok', s === 'ok'); lbl.classList.toggle('is-err', s === 'gresit'); st.className = 'cui-stare' + (cls ? ' ' + cls : ''); st.textContent = msg || ''; onChange(); }\n    function verifica(final) { var n = curat(); if (!n) { set('gol', ''); return; } if (valid(n)) { set('ok', ''); return; } if (final || n.length >= 10) set('gresit', 'NIP wygląda na niepoprawny. Sprawdź ostatnią cyfrę.', 'err'); else set('scrie', ''); }\n    input.addEventListener('input', function () { verifica(false); });\n    input.addEventListener('blur', function () { verifica(true); });\n    if (woj) { var gol = function () { woj.classList.toggle('is-empty', !woj.value); }; gol(); woj.addEventListener('change', function () { gol(); onChange(); }); }\n    if (firma) firma.addEventListener('input', onChange);\n    return {\n      gata: function () { return stare === 'ok' && !!firma && firma.value.trim().length >= 2 && !!woj && !!woj.value; },\n      cui: curat, firma: function () { return firma ? firma.value.trim() : ''; }, woj: function () { return woj ? woj.value : ''; },\n      forteaza: function () { verifica(true); },\n      eroare: function (msg) { set('gresit', msg, 'err'); }\n    };\n  }\n\n  document.querySelectorAll('form.reserve').forEach(function (f) {"), ("if (f.classList.contains('has-cui')) cui = cuiField(f, function () { sync(); });", "if (f.classList.contains('has-cui')) cui = nipField(f, function () { sync(); });"), ('if (cui) corp.cui = cui.cui();', "corp.tara = 'PL'; corp.limba = 'pl'; if (cui) { corp.nip = cui.cui(); corp.firma = cui.firma(); corp.wojewodztwo = cui.woj(); }"), ("cod === 'cui_negasit' || cod === 'cui')", "cod === 'cui_negasit' || cod === 'cui' || cod === 'firma' || cod === 'wojewodztwo')"), (": cod === 'cui_negasit' ? 'Nu am găsit firma la ANAF. Verifică CUI-ul pe o factură.' : 'CUI-ul nu pare corect. Verifică ultima cifră.');", ": cod === 'firma' ? 'Wpisz nazwę firmy.' : cod === 'wojewodztwo' ? 'Wybierz województwo.' : cod === 'cui_negasit' ? 'Nu am găsit firma la ANAF. Verifică CUI-ul pe o factură.' : 'NIP wygląda na niepoprawny. Sprawdź ostatnią cyfrę.');")]
PRE = {
    'main.js': PRE_MAIN_PL + [("function plural(n, one, few, many) { return n === 1 ? '1 ' + one : (n < 20 ? n + ' ' + few : n + ' de ' + many); }",
                 PLURAL_PL + " function plural(n, one, few, many) { return n === 1 ? '1 ' + one : n + ' ' + (maiMulte(n) ? few : (GEN[many] || many)); }")],
    'calc.js': [("function plural(n, one, few, many) { return n === 1 ? '1 ' + one : (n < 20 ? n + ' ' + few : n + ' de ' + many); }",
                 PLURAL_PL + " function plural(n, one, few, many) { return n === 1 ? '1 ' + one : n + ' ' + (maiMulte(n) ? few : (GEN[many] || many)); }"),
                ("plural(Object.keys(sa).length, 'produs', 'produse', 'produse')", "plural(Object.keys(sa).length, 'środek', 'środki', 'środki')"),
                ("tag: p[3] || 'Produs'", "tag: TIPN[p[3]] || p[3] || 'Środek'"),
                ("els.hint.innerHTML = '<b>' + produse.length + ' produse</b> omologate';", "els.hint.innerHTML = '<b>' + produse.length + '</b> ' + (produse.length === 1 ? 'środek' : maiMulte(produse.length) ? 'środki' : 'środków') + ' w rejestrze';")],
    'search.js': [("function pl(n, one, many) { return n === 1 ? '1 ' + one : (n < 20 ? n + ' ' + many : n + ' de ' + many); }",
                   PLURAL_PL + " function pl(n, one, many) { return n === 1 ? '1 ' + one : n + ' ' + (maiMulte(n) ? many : (GEN[many] || many)); }"),
                  ("(m[tip] < 20 ? ' ' : ' de ')", "' '"),
                  ("lower(p.tip)", "lower(TIPN[p.tip] || p.tip)"), ("esc(p.tip)", "esc(TIPN[p.tip] || p.tip)"), ("var sub = [p.tip];", "var sub = [TIPN[p.tip] || p.tip];"),
                  ("'1 ' + lower(tip)", "'1 ' + lower(TIPN[tip] || tip)")],
}
HTML_POST = [('JSON.stringify({ email: email, t: t })', "JSON.stringify({ email: email, t: t, limba: 'pl' })"),('data-count="450" data-suffix="+">450+', 'data-count="2400" data-suffix="+">2400+'),
             ('data-count="150" data-suffix="+">150+', 'data-count="600" data-suffix="+">600+'),
             ('data-count="350" data-suffix="+">350+', 'data-count="1000" data-suffix="+">1000+'),
             ('<b>ANF, UE</b>', '<b>MRiRW, UE</b>'),
             ('<label class="field has-input" id="f-bloc">', '<label class="field has-input" id="f-bloc" style="display:none">')]
LOCALE = [("'ro-RO'", "'pl-PL'"), (", 'ro')", ", 'pl')")]
POST = {
    'report.js': [("{ action: 'url', draft: draft,", "{ action: 'url', limba: 'pl', draft: draft,"), ("{ action: 'trimite', draft: draft,", "{ action: 'trimite', limba: 'pl', draft: draft,")],
    'calc.js': LOCALE,
    'main.js': [],
    'search.js': LOCALE + [('ANF', 'MRiRW'), ('păduchi', 'mszyce'), ('grau toamna', 'pszenica ozima')] + [('aria-label="Șterge suprafața"', 'aria-label="Wyczyść powierzchnię"'), ('aria-label="Șterge volumul de apă"', 'aria-label="Wyczyść ilość wody"'),
                  ('aria-label="Șterge doza"', 'aria-label="Wyczyść dawkę"')],
}
# cuvinte scurte (șirul exact, cu spațiile lui), doar în fișierele unde sunt text vizibil
CUVINTE = {
    'main.js': {'zi': 'dzień', 'zile': 'dni', 'ore': 'godziny', 'minut': 'minuta', 'minute': 'minuty'},
    'calc.js': {' zi': ' dzień', ' zile': ' dni', ' zile.': ' dni.', 'postemergent': 'powschodowo', 'preemergent': 'przedwschodowo',
                'boli': 'choroby', 'buruieni': 'chwasty', 'probleme': 'agrofagi',
                '. Scrie primele litere ca să filtrezi.': '. Wpisz pierwsze litery, aby zawęzić listę.',
                '. Aplicarea peste doza omologată este interzisă.': '. Stosowanie powyżej dawki zarejestrowanej jest zabronione.'},
    'search.js': {' zi': ' dzień', ' zile': ' dni', 'postemergent': 'powschodowo', 'preemergent': 'przedwschodowo',
                  'boli': 'choroby', 'buruieni': 'chwasty', 'probleme': 'agrofagi', 'produs': 'środek', 'produse': 'środki', 'culturi': 'uprawy',
                  'omologare': 'rejestracja', 'sinonim': 'synonim', 'sinonime': 'synonimy', 'erbicide': 'herbicydy', 'fungicide': 'fungicydy',
                  'insecticide': 'insektycydy', 'moluscocide': 'moluskocydy', 'rodenticide': 'rodentycydy', 'nematocide': 'nematocydy',
                  'pentru ': 'dla ', 'la ': 'w uprawie ', 'cu ': 'ze środkiem ', ' pentru ': ' dla ', ' la ': ' w uprawie ', 'din ': 'z ',
                  'toate ': 'wszystkie ', 'subtipuri: ': 'podtypy: ', ' omologate ': ' zarejestrowane '},
    'report.js': {'emailul': 'adres e-mail', 'subiectul': 'temat', 'descrierea': 'opis', ' caractere': ' znaków'},
}

def tr_text(raw, table):
    """Traduce un text păstrând spațiile de la capete; cheia este textul fără spații la capete."""
    core = raw.strip()
    if not core: return raw
    if core not in table: return raw
    lead = raw[:len(raw) - len(raw.lstrip())]; trail = raw[len(raw.rstrip()):]
    return lead + table[core] + trail

STR = re.compile(r"""'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`""")
def tr_js(src, fis=''):
    masked = re.sub(r'/\*.*?\*/', lambda m: ' ' * len(m.group(0)), src, flags=re.S)
    masked = re.sub(r'(?m)(^|[^:\'"\\])//[^\n]*', lambda m: m.group(1) + ' ' * (len(m.group(0)) - len(m.group(1))), masked)
    out, last = [], 0
    for m in STR.finditer(masked):
        gi = next(i for i, g in enumerate(m.groups()) if g is not None); q = "'\"`"[gi]
        raw = src[m.start() + 1:m.end() - 1]
        new = raw
        if raw == 'assets/calc-data.json': new = ('' if PREVIZ else '/') + 'assets/calc-data-pl.json'   # datele poloneze
        elif raw.startswith('assets/') and not PREVIZ: new = '/' + raw                     # fetch('assets/…') din /pl/
        elif raw in CUVINTE.get(fis, {}): new = CUVINTE[fis][raw]
        elif raw.strip() in TJ:
            new = tr_text(raw, TJ)
            new = re.sub(r'(?<!\\)' + re.escape(q), '\\\\' + q, new).replace('\n', '\\n')
        out.append(src[last:m.start() + 1]); out.append(new); last = m.end() - 1
    out.append(src[last:])
    return ''.join(out)

def abs_url(u, d):
    if not u or re.match(r'^(https?:|//|/|#|mailto:|tel:|data:|javascript:|blob:)', u): return u
    path, sep, frag = u.partition('#')
    a = posixpath.normpath(posixpath.join('/' + d, path)) + ('/' if path.endswith('/') or path == '' else '')
    a = a.replace('//', '/')
    return a + (sep + frag if sep else '')

def pl_url(u):
    if not u.startswith('/') or u.startswith('//'): return u
    path, sep, frag = u.partition('#')
    if path in PL_PAGES: path = PL_PAGES[path]
    elif path.lstrip('/') in JS: path = '/pl' + path
    elif path == '/index.html': path = '/pl/'
    return path + (sep + frag if sep else '')

def tr_tag(tag, d):
    def attr(m):
        name, q, val = m.group(1), m.group(2), m.group(3)
        v = html.unescape(val)
        if name in ATTRS or (name == 'content' and re.search(r'(name|property)="(description|og:title|og:description|twitter:title|twitter:description|og:image:alt)"', tag)):
            nv = tr_text(v, TH)
            if nv != v: return f'{name}={q}{html.escape(nv, quote=True)}{q}'
        if PREVIZ: pass
        elif name == 'style' and 'url(' in v:
            nv = re.sub(r"url\((['\"]?)([^'\")]+)\1\)", lambda u: 'url(' + u.group(1) + abs_url(u.group(2), d) + u.group(1) + ')', v)
            if nv != v: return f'{name}={q}{html.escape(nv, quote=False)}{q}'
        if name in URL_ATTRS and not PREVIZ:
            nv = pl_url(abs_url(v, d))
            if nv != v: return f'{name}={q}{html.escape(nv, quote=True)}{q}'
        return m.group(0)
    return re.sub(r'([\w:-]+)=(["\'])(.*?)\2', attr, tag, flags=re.S)

TOK = re.compile(r'(<script\b[^>]*>.*?</script>|<style\b[^>]*>.*?</style>|<!--.*?-->|<[^>]+>)', re.S | re.I)
HTML_PRE = [('            <div class="cui-wrap">\n              <label class="field cui" for="cui-partener">\n                <span class="col"><small>CUI</small><input type="text" name="cui" id="cui-partener" placeholder="ex. RO 12345678" autocomplete="off" inputmode="numeric" autocapitalize="characters" spellcheck="false" maxlength="14" role="combobox" aria-expanded="false" aria-controls="cui-lista" aria-autocomplete="list" aria-describedby="cui-stare"></span>\n                <span class="cui-ic" aria-hidden="true"></span>\n              </label>\n              <div class="cui-dd" id="cui-lista" role="listbox" aria-label="Firma găsită după CUI" hidden></div>\n            </div>', '            <div class="cui-wrap">\n              <label class="field cui" for="cui-partener">\n                <span class="col"><small>NIP</small><input type="text" name="nip" id="cui-partener" placeholder="np. 123-456-32-18" autocomplete="off" inputmode="numeric" spellcheck="false" maxlength="16" aria-describedby="cui-stare"></span>\n                <span class="cui-ic" aria-hidden="true"></span>\n              </label>\n            </div>\n            <div class="pl-firma">\n              <label class="field" for="firma-partener"><span class="col"><small>Nazwa firmy</small><input type="text" name="firma" id="firma-partener" placeholder="Pełna nazwa firmy" autocomplete="organization" maxlength="200"></span></label>\n              <label class="field" for="woj-partener"><span class="col"><small>Województwo</small><select name="wojewodztwo" id="woj-partener" required><option value="">Wybierz województwo</option><option value="dolnośląskie">dolnośląskie</option><option value="kujawsko-pomorskie">kujawsko-pomorskie</option><option value="lubelskie">lubelskie</option><option value="lubuskie">lubuskie</option><option value="łódzkie">łódzkie</option><option value="małopolskie">małopolskie</option><option value="mazowieckie">mazowieckie</option><option value="opolskie">opolskie</option><option value="podkarpackie">podkarpackie</option><option value="podlaskie">podlaskie</option><option value="pomorskie">pomorskie</option><option value="śląskie">śląskie</option><option value="świętokrzyskie">świętokrzyskie</option><option value="warmińsko-mazurskie">warmińsko-mazurskie</option><option value="wielkopolskie">wielkopolskie</option><option value="zachodniopomorskie">zachodniopomorskie</option></select></span><i class="chev" aria-hidden="true"></i></label>\n            </div>')]
def tr_html(s, d, canon):
    for a_, b_ in HTML_PRE: s = s.replace(a_, b_)
    # meniul: Plan de fertilizare → „În curând” (regulile de fertilizare sunt cele din România)
    for c in ('menu-it', 'mm-it'):
        s = s.replace(f'<a class="{c}" href="/plan-fertilizare/">Plan de fertilizare</a>',
                      f'<span class="{c} is-soon" aria-disabled="true"><span>Plan de fertilizare</span><span class="soon" lang="en">Soon</span></span>')
    parts = TOK.split(s); out = []
    for p in parts:
        if not p: continue
        if p.startswith('<script'):
            m = re.match(r'(<script\b[^>]*>)(.*?)(</script>)', p, re.S | re.I)
            out.append(tr_tag(m.group(1), d) + (tr_js(m.group(2)) if 'src=' not in m.group(1) else m.group(2)) + m.group(3))
        elif p.startswith('<style') or p.startswith('<!--'): out.append(p)
        elif p.startswith('<'): out.append(tr_tag(p, d))
        else:
            v = html.unescape(p); nv = tr_text(v, TH)
            if nv != v: out.append(html.escape(nv, quote=False))
            else:
                if v.strip() and re.search(r'[ăâîșțĂÂÎȘȚ]', v): lipsa.add(v.strip()[:80])
                out.append(p)
    s = ''.join(out)
    for a_, b_ in HTML_POST: s = s.replace(a_, b_)
    s = re.sub(r'<html lang="ro"', '<html lang="pl"', s, count=1)
    s = s.replace('content="ro_RO"', 'content="pl_PL"')
    s = re.sub(r'(<link rel="canonical" href=")https://agrosphere\.eu/[^"]*(")', r'\g<1>https://agrosphere.eu' + canon + r'\2', s)
    s = re.sub(r'(<meta property="og:url" content=")https://agrosphere\.eu/[^"]*(")', r'\g<1>https://agrosphere.eu' + canon + r'\2', s)
    if BETA: s = s.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<meta name="robots" content="noindex">', 1)
    return s

for src, d in PAGES.items():
    out = root / 'pl' / src
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(tr_html((root / src).read_text(encoding='utf-8'), d, '/pl/' + d), encoding='utf-8')
def patch(src, lst, fis):
    for old, new in lst:
        assert old in src, f'{fis}: nu găsesc {old[:70]!r}'
        src = src.replace(old, new)
    return src
for j in JS:
    src = patch((root / j).read_text(encoding='utf-8'), PRE.get(j, []), j)
    (root / 'pl' / j).write_text(patch(tr_js(src, j), POST.get(j, []), j), encoding='utf-8')
# previzualizări pentru Artifact (un singur fișier, fără schelet)
PREVIZ = True
for src, dst in (('preview.html', 'preview-pl.html'), ('preview-abonamente.html', 'preview-abonamente-pl.html')):
    if (root / src).exists():
        # în Artifact pagina nu are <html lang>: îl setăm înainte de scripturi, ca selectorul și analytics să știe că e PL
        h = tr_html((root / src).read_text(encoding='utf-8'), '', '/pl/')
        h = "<script>document.documentElement.lang='pl';</script>\n" + h
        (root / dst).write_text(h, encoding='utf-8')
PREVIZ = False
print('pl/: %d pagini, %d fișiere JS; texte RO rămase netraduse în HTML: %d' % (len(PAGES), len(JS), len(lipsa)))
for x in sorted(lipsa)[:40]: print('  -', x)
