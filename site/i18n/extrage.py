#!/usr/bin/env python3
"""Extrage textele traductibile din paginile construite (RO) și din fișierele JS, pentru dicționarul pl.json.
Rulare: python3 -I site/i18n/extrage.py > site/i18n/texte.json"""
import json, re, pathlib, html.parser
root = pathlib.Path(__file__).resolve().parent.parent
PAGES = ['index.html', 'abonamente/index.html', 'termeni/index.html', 'confidentialitate/index.html', 'dezabonare/index.html']
JS = ['main.js', 'calc.js', 'search.js', 'report.js', 'abonamente.js', 'antibot.js', 'gads.js', 'analytics.js']
ATTRS = {'placeholder', 'aria-label', 'title', 'alt', 'data-label'}
META = {'description', 'og:title', 'og:description', 'twitter:title', 'twitter:description', 'og:image:alt'}
LETTER = re.compile(r'[A-Za-zĂÂÎȘȚăâîșțŞşŢţ]')
out = {}
def add(text, kind, where, ctx=''):
    t = text.strip()
    if not t or not LETTER.search(t): return
    e = out.setdefault((kind, t), {'text': t, 'tip': kind, 'unde': [], 'context': ctx[:300]})
    if where not in e['unde']: e['unde'].append(where)

class P(html.parser.HTMLParser):
    def __init__(self, where):
        super().__init__(convert_charrefs=True); self.where = where; self.stack = []; self.block = []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        for k in ATTRS:
            if a.get(k): add(a[k], 'atribut', self.where)
        if tag == 'meta' and (a.get('name') in META or a.get('property') in META) and a.get('content'): add(a['content'], 'atribut', self.where)
        if tag in ('input', 'button') and a.get('value') and a.get('type') in ('button', 'submit'): add(a['value'], 'atribut', self.where)
        if tag not in ('br', 'img', 'input', 'meta', 'link', 'hr', 'source', 'wbr'): self.stack.append(tag)
    def handle_endtag(self, tag):
        while self.stack:
            if self.stack.pop() == tag: break
    def handle_data(self, data):
        if self.stack and self.stack[-1] in ('style',): return
        if self.stack and self.stack[-1] == 'script':
            js_literals(data, self.where + ' <script>'); return
        add(data, 'html', self.where)

STR = re.compile(r"""'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`""")
def js_literals(src, where):
    # comentariile nu se traduc
    code = re.sub(r'/\*.*?\*/', lambda m: ' ' * len(m.group(0)), src, flags=re.S)
    code = re.sub(r'(?m)(^|[^:\'"\\])//[^\n]*', lambda m: m.group(1) + ' ' * (len(m.group(0)) - len(m.group(1))), code)
    for m in STR.finditer(code):
        s = next(g for g in m.groups() if g is not None)
        if not LETTER.search(s): continue
        if re.fullmatch(r'[\w.#:\-\[\]=*>+~ ,()"\'/?&%@!]*', s) and ' ' not in s.strip() and not re.search(r'[ĂÂÎȘȚăâîșț]', s) and not re.match(r'[A-ZĂÂÎȘȚ][a-zăâîșț]', s):
            continue  # identificatori, clase CSS, chei, URL-uri fără spațiu
        if re.match(r'^(https?:|/|\.|#|\[|data-|aria-)', s) or re.search(r'<\w|</', s) and not LETTER.search(re.sub(r'<[^>]+>', '', s)): continue
        line_start = code.rfind('\n', 0, m.start()) + 1; line_end = code.find('\n', m.end())
        add(s, 'js', where, code[line_start:line_end if line_end > 0 else None].strip())

for p in PAGES:
    P(p).feed((root / p).read_text(encoding='utf-8'))
for j in JS:
    js_literals((root / j).read_text(encoding='utf-8'), j)
res = sorted(out.values(), key=lambda e: (e['unde'][0], e['tip']))
print(json.dumps(res, ensure_ascii=False, indent=1))
