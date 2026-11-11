#!/usr/bin/env python3
"""Versiunea poloneză a site-ului (agrosphere.eu/pl/), generată din paginile RO deja construite + dicționarul i18n/pl.json.
Rulează după build.py și build_abonamente.py. Paginile RO nu sunt modificate.
- textele vizibile (HTML, atribute, șirurile din JS) se înlocuiesc doar când se potrivesc exact cu o intrare din dicționar;
- căile relative devin absolute, legăturile interne duc la /pl/…, JS-ul tradus stă în /pl/*.js;
- Plan de fertilizare apare în meniu ca „Wkrótce” (regulile sunt cele din România);
- BETA = True: paginile au noindex și nu sunt anunțate în paginile RO (hreflang) până la lansare."""
import html, json, pathlib, re, posixpath
BETA = True
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

def tr_text(raw, table):
    """Traduce un text păstrând spațiile de la capete; cheia este textul fără spații la capete."""
    core = raw.strip()
    if not core: return raw
    if core not in table: return raw
    lead = raw[:len(raw) - len(raw.lstrip())]; trail = raw[len(raw.rstrip()):]
    return lead + table[core] + trail

STR = re.compile(r"""'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`""")
def tr_js(src):
    masked = re.sub(r'/\*.*?\*/', lambda m: ' ' * len(m.group(0)), src, flags=re.S)
    masked = re.sub(r'(?m)(^|[^:\'"\\])//[^\n]*', lambda m: m.group(1) + ' ' * (len(m.group(0)) - len(m.group(1))), masked)
    out, last = [], 0
    for m in STR.finditer(masked):
        gi = next(i for i, g in enumerate(m.groups()) if g is not None); q = "'\"`"[gi]
        raw = src[m.start() + 1:m.end() - 1]
        new = raw
        if raw.startswith('assets/'): new = '/' + raw                     # fetch('assets/…') din /pl/
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
        if name in URL_ATTRS:
            nv = pl_url(abs_url(v, d))
            if nv != v: return f'{name}={q}{html.escape(nv, quote=True)}{q}'
        return m.group(0)
    return re.sub(r'([\w:-]+)=(["\'])(.*?)\2', attr, tag, flags=re.S)

TOK = re.compile(r'(<script\b[^>]*>.*?</script>|<style\b[^>]*>.*?</style>|<!--.*?-->|<[^>]+>)', re.S | re.I)
def tr_html(s, d, canon):
    # meniul: Plan de fertilizare → „În curând” (regulile de fertilizare sunt cele din România)
    for c in ('menu-it', 'mm-it'):
        s = s.replace(f'<a class="{c}" href="/plan-fertilizare/">Plan de fertilizare</a>',
                      f'<span class="{c} is-soon" aria-disabled="true"><span>Plan de fertilizare</span><span class="soon">În curând</span></span>')
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
for j in JS:
    (root / 'pl' / j).write_text(tr_js((root / j).read_text(encoding='utf-8')), encoding='utf-8')
# previzualizări pentru Artifact (un singur fișier, fără schelet)
for src, dst in (('preview.html', 'preview-pl.html'), ('preview-abonamente.html', 'preview-abonamente-pl.html')):
    if (root / src).exists():
        (root / dst).write_text(tr_html((root / src).read_text(encoding='utf-8'), '', '/pl/'), encoding='utf-8')
print('pl/: %d pagini, %d fișiere JS; texte RO rămase netraduse în HTML: %d' % (len(PAGES), len(JS), len(lipsa)))
for x in sorted(lipsa)[:40]: print('  -', x)
