#!/usr/bin/env python3
"""Pagina „Abonamente” (Figma 2292:12017 / 2292:11398 / 2292:44219).

  python3 site/build_abonamente.py
  → site/abonamente/index.html     pagina pentru site
  → site/preview-abonamente.html   previzualizare de sine stătătoare (CSS + JS incluse), pentru Artifact

Antetul (meniul), banda de sus și subsolul se iau din body.html, ca să nu existe două versiuni;
aici „Abonamente” e elementul activ. Data de final a campaniei vine tot din body.html (data-campaign-end).
"""
import pathlib, re

root = pathlib.Path(__file__).parent
body = (root / 'body.html').read_text(encoding='utf-8')
ab = (root / 'abonamente-body.html').read_text(encoding='utf-8')
css = (root / 'styles.css').read_text(encoding='utf-8')
mainjs = (root / 'main.js').read_text(encoding='utf-8')
abjs = (root / 'abonamente.js').read_text(encoding='utf-8')
env = root / '..' / 'app' / '.env'
phkey = env.read_text().split('VITE_POSTHOG_KEY=')[1].split()[0] if env.exists() and 'VITE_POSTHOG_KEY=' in env.read_text() else ''

header = body.split('<main id="top">')[0]
footer = '<footer' + body.split('<footer', 1)[1].split('</footer>')[0] + '</footer>'
sfarsit = re.search(r'data-campaign-end="([^"]+)"', body).group(1)

CK = '<img class="ck" src="{A}assets/check.svg" alt="" width="22" height="22">'
PERKS = {
    'MICA': ['Import din <b>centralizatorul APIA</b>, parcele și planuri salvate',
             'Registru de tratamente <b>completat automat</b> din calculator',
             'Export PDF pentru <b>controlul APIA/ANF</b>',
             '<b>Când pot stropi</b> pe fiecare parcelă, cu alerte',
             '<b>Magazie, cost pe hectar</b> și cereri de ofertă',
             '<b>2 utilizatori</b> (de ex. tu și un operator)'],
    'MARE': ['Tot ce găsești în <b>Fermă mică</b>',
             '<b>Utilizatori nelimitați</b> cu roluri: administrator, șef de fermă, operator',
             '<b>Mai multe ferme sau firme</b> în același cont',
             '<b>Facturile din SPV</b> intră automat în magazie',
             '<b>Rapoarte de cost pe parcelă</b> și export pentru contabilitate',
             '<b>Suport prioritar</b>'],
    'PARTENER': ['Profil cu insigna <b>„Verificat AgroSphere”</b>',
                 '<b>Cereri de ofertă</b> nelimitate din județele tale',
                 'Catalog legat de <b>listele ANF și MADR</b>',
                 '<b>Comenzi, livrări și facturi</b> în același loc',
                 '<b>Statistici</b>: oferte trimise, câștigate, valoare',
                 'Verificarea documentelor <b>gratuită la lansare</b>'],
}


def continut(prefix_assets):
    h = ab
    for k, items in PERKS.items():
        h = h.replace('{{PERKS_%s}}' % k, '\n'.join(f'            <li>{CK.format(A=prefix_assets)}<span>{t}</span></li>' for t in items))
    return f'<main id="top" data-campaign-end="{sfarsit}">\n' + h.replace('{{A}}', prefix_assets) + '</main>'


def antet(prefix):
    h = header.replace('href="#', f'href="{prefix}#')
    for cls in ('menu-it', 'mm-it'):
        h = h.replace(f'<a class="{cls} is-on" href="{prefix}#top" aria-current="page">Calculator pesticide</a>', f'<a class="{cls}" href="{prefix}">Calculator pesticide</a>')
        h = h.replace(f'<a class="{cls}" href="/abonamente/">Abonamente</a>', f'<a class="{cls} is-on" href="/abonamente/" aria-current="page">Abonamente</a>')
    return h


fonts = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">'
desc = 'Abonamentele AgroSphere, valabile de la lansarea platformei: Fermă mică (până la 100 ha), Fermă mare (peste 100 ha) și Partener. Plată lunară sau anuală, cu 2 luni gratuite.'

# 1) pagina pentru site
ph = f'<meta name="pesticid-posthog" data-key="{phkey}" data-host="https://eu.i.posthog.com">' if phkey else ''
pagina = f'''<!doctype html>
<html lang="ro" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Abonamente — AgroSphere</title>
<meta name="description" content="{desc}">
<meta name="theme-color" content="#cedbf6">
<link rel="canonical" href="https://agrosphere.eu/abonamente/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="AgroSphere">
<meta property="og:locale" content="ro_RO">
<meta property="og:url" content="https://agrosphere.eu/abonamente/">
<meta property="og:title" content="Abonamente AgroSphere">
<meta property="og:description" content="{desc}">
<meta property="og:image" content="https://agrosphere.eu/assets/og-image.jpg">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
{ph}
{fonts}
<link rel="stylesheet" href="/styles.css">
</head>
<body>
{antet('/').replace('src="assets/', 'src="/assets/')}
{continut('/')}
{footer.replace('src="assets/', 'src="/assets/').replace('href="#', 'href="/#').replace('href="confidentialitate/', 'href="/confidentialitate/').replace('href="termeni/', 'href="/termeni/')}
<script src="/analytics.js"></script>
<script src="/main.js"></script>
<script src="/abonamente.js"></script>
</body>
</html>
'''
(root / 'abonamente').mkdir(exist_ok=True)
(root / 'abonamente' / 'index.html').write_text(pagina, encoding='utf-8')

# 2) previzualizarea (Artifact)
preview = f'''<title>Abonamente — AgroSphere</title>
<meta name="claude:viewport-fit-sides" content="cover">
{fonts}
<style>
{css}
</style>
{antet('https://agrosphere.eu/')}
{continut('')}
{footer}
<script>
{mainjs}
</script>
<script>
{abjs}
</script>
'''
(root / 'preview-abonamente.html').write_text(preview, encoding='utf-8')
print('abonamente/index.html', len(pagina), '· preview-abonamente.html', len(preview))
