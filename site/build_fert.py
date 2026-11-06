#!/usr/bin/env python3
"""Pagina „Plan de fertilizare” (încă nepublicată: nu e în lista din .github/workflows/pages.yml).

  python3 site/build_fert.py
  → site/plan-fertilizare/index.html   pagina pentru site (datele vin din Supabase, tabelul public `fertilizanti`)
  → site/preview-fert.html             previzualizare de sine stătătoare (CSS + JS + date incluse), pentru Artifact

Antetul (meniul) se ia din body.html, ca să nu existe două versiuni; aici „Plan de fertilizare” e elementul activ.
"""
import json, pathlib, re

root = pathlib.Path(__file__).parent
body = (root / 'body.html').read_text(encoding='utf-8')
fert = (root / 'fert-body.html').read_text(encoding='utf-8')
css = (root / 'styles.css').read_text(encoding='utf-8')
js = (root / 'fert.js').read_text(encoding='utf-8')
mainjs = (root / 'main.js').read_text(encoding='utf-8')
env = root / '..' / 'app' / '.env'
sbkey = env.read_text().split('VITE_SUPABASE_ANON_KEY=')[1].split()[0] if env.exists() else ''
phkey = env.read_text().split('VITE_POSTHOG_KEY=')[1].split()[0] if env.exists() and 'VITE_POSTHOG_KEY=' in env.read_text() else ''

header = body.split('<main id="top">')[0]
footer = '<footer' + body.split('<footer', 1)[1].split('</footer>')[0] + '</footer>' if '<footer' in body else ''


def antet(prefix):
    h = header.replace('href="#', f'href="{prefix}#')
    # „Calculator pesticide” devine link spre prima pagină; „Plan de fertilizare” e pagina curentă
    h = h.replace(f'<a class="menu-it is-on" href="{prefix}#top" aria-current="page">Calculator pesticide</a>', f'<a class="menu-it" href="{prefix}">Calculator pesticide</a>')
    h = h.replace(f'<a class="mm-it is-on" href="{prefix}#top" aria-current="page">Calculator pesticide</a>', f'<a class="mm-it" href="{prefix}">Calculator pesticide</a>')
    h = h.replace('<a class="menu-it" href="/plan-fertilizare/">Plan de fertilizare</a>', '<a class="menu-it is-on" href="/plan-fertilizare/" aria-current="page">Plan de fertilizare</a>')
    h = h.replace('<a class="mm-it" href="/plan-fertilizare/">Plan de fertilizare</a>', '<a class="mm-it is-on" href="/plan-fertilizare/" aria-current="page">Plan de fertilizare</a>')
    return h


def continut(prefix_assets):
    return f'''<main id="top">
  <section class="hero fp-hero">
    <div class="hero-clip"><div class="hero-bg" data-src="{prefix_assets}assets/hero-camp.webp" data-src-2x="{prefix_assets}assets/hero-camp-2x.webp" role="img" aria-label="Câmp cultivat la apus"></div></div>
    <div class="wrap">
      <div class="hero-copy">
        <h1>Planul de fertilizare <b>completat în câteva minute</b></h1>
        <p class="lead">Completezi parcela și azotul planificat, alegi îngrășămintele din <b>lista oficială MADR</b>, iar noi calculăm <b>kg de azot pe hectar</b>. La final descarci planul în <b>formatul oficial</b> (model simplificat).</p>
{fert}
      </div>
    </div>
  </section>
</main>'''


fonts = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">'
extra_css = '.fp-hero .calc { width: min(1100px, 100%); }\n.fp-hero .hero-copy { max-width: 1160px; }\n'

# 1) pagina pentru site
ph = f'<meta name="pesticid-posthog" data-key="{phkey}" data-host="https://eu.i.posthog.com">' if phkey else ''
sb = f'<meta name="pesticid-supabase" data-url="https://rpwmfhlmdscjpcrqqmyf.supabase.co" data-key="{sbkey}">' if sbkey else ''
pagina = f'''<!doctype html>
<html lang="ro" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Plan de fertilizare — AgroSphere</title>
<meta name="description" content="Completezi planul de fertilizare (model simplificat): parcelă, azot planificat, îngrășăminte din lista oficială MADR și kg N/ha calculat automat.">
<meta name="theme-color" content="#cedbf6">
<link rel="canonical" href="https://agrosphere.eu/plan-fertilizare/">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
{sb}
{ph}
{fonts}
<link rel="stylesheet" href="/styles.css">
<style>{extra_css}</style>
</head>
<body>
{antet('/').replace('src="assets/', 'src="/assets/')}
{continut('/')}
{footer.replace('src="assets/', 'src="/assets/').replace('href="#', 'href="/#')}
<script src="/analytics.js"></script>
<script src="/main.js"></script>
<script src="/fert.js"></script>
</body>
</html>
'''
(root / 'plan-fertilizare').mkdir(exist_ok=True)
(root / 'plan-fertilizare' / 'index.html').write_text(pagina, encoding='utf-8')

# 2) previzualizarea (Artifact): fără Supabase — lista de îngrășăminte cu azot e inclusă în pagină
src = json.loads((root / '..' / 'supabase' / 'import' / 'madr' / 'out' / 'fertilizanti.json').read_text(encoding='utf-8'))
date = [[r['nr_madr'], r['denumire'], r['n'], r['unitate_npk'], r['forma'], r['categorie_nr'], 1 if r['productie_oprita'] else 0]
        for r in src if r['n'] and r['unitate_npk'] in ('%', 'g/l')]
preview = f'''<title>Plan de fertilizare — AgroSphere</title>
<meta name="claude:viewport-fit-sides" content="cover">
{fonts}
<style>
{css}
{extra_css}
</style>
{antet('https://agrosphere.eu/')}
{continut('')}
<script type="application/json" id="fert-data">{json.dumps(date, ensure_ascii=False)}</script>
<script>
{mainjs}
</script>
<script>
{js}
</script>
'''
(root / 'preview-fert.html').write_text(preview, encoding='utf-8')
print('plan-fertilizare/index.html', len(pagina), '· preview-fert.html', len(preview), '·', len(date), 'îngrășăminte cu N')
