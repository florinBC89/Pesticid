#!/usr/bin/env python3
"""Compune index.html (site-ul) și preview.html (pagină pentru Artifact, fără schelet HTML) din body.html + styles.css + main.js."""
import pathlib
root = pathlib.Path(__file__).parent
body = (root / 'body.html').read_text(encoding='utf-8')
css = (root / 'styles.css').read_text(encoding='utf-8')
js = (root / 'main.js').read_text(encoding='utf-8')
calc = (root / 'calc.js').read_text(encoding='utf-8')
search = (root / 'search.js').read_text(encoding='utf-8')
analytics = (root / 'analytics.js').read_text(encoding='utf-8')
report = (root / 'report.js').read_text(encoding='utf-8')
env = (root / '..' / 'app' / '.env').read_text() if (root / '..' / 'app' / '.env').exists() else ''
phkey = env.split('VITE_POSTHOG_KEY=')[1].split()[0] if 'VITE_POSTHOG_KEY=' in env else ''
ph = f'<meta name="pesticid-posthog" data-key="{phkey}" data-host="https://eu.i.posthog.com">' if phkey else ''
sbkey = (root / '..' / 'app' / '.env').read_text().split('VITE_SUPABASE_ANON_KEY=')[1].split()[0] if (root / '..' / 'app' / '.env').exists() else ''
sb = f'<meta name="pesticid-supabase" data-url="https://rpwmfhlmdscjpcrqqmyf.supabase.co" data-key="{sbkey}">' if sbkey else ''
# Turnstile (Cloudflare, anti-robot): cheia de site e publică; cheia secretă stă doar în Supabase (TURNSTILE_SECRET)
ts = '<meta name="pesticid-turnstile" data-key="0x4AAAAAAF0iO2Yk4JMq4zBE">'
# previzualizarea (Artifact) nu se poate conecta la Supabase: acolo formularele rămân în mod demonstrativ
fonts = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">'
desc = 'Calculator de doză pentru pesticide: alegi cultura, dăunătorul și suprafața și primești produsele omologate cu doza exactă.'
index = f'''<!doctype html>
<html lang="ro" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Pesticid — Calculator de doză pentru pesticide</title>
<meta name="description" content="{desc}">
<meta name="theme-color" content="#cedbf6">
<link rel="canonical" href="https://pesticid.info/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Pesticid.info">
<meta property="og:locale" content="ro_RO">
<meta property="og:url" content="https://pesticid.info/">
<meta property="og:title" content="Pesticid.info — Îți calculează doza">
<meta property="og:description" content="{desc}">
<meta property="og:image" content="https://pesticid.info/assets/og-image.jpg">
<meta property="og:image:secure_url" content="https://pesticid.info/assets/og-image.jpg">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Pesticid.info — calculatorul de doză pentru pesticide">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Pesticid.info — Îți calculează doza">
<meta name="twitter:description" content="{desc}">
<meta name="twitter:image" content="https://pesticid.info/assets/og-image.jpg">
<link rel="icon" href="favicon.ico" sizes="48x48">
<link rel="icon" type="image/png" sizes="32x32" href="assets/favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="assets/favicon-16.png">
<link rel="apple-touch-icon" href="assets/apple-touch-icon.png">
<link rel="manifest" href="site.webmanifest">
{sb}
{ts}
{ph}
{fonts}
<link rel="stylesheet" href="styles.css">
</head>
<body>
{body}
<script src="analytics.js"></script>
<script src="antibot.js"></script>
<script src="main.js"></script>
<script src="calc.js"></script>
<script src="search.js"></script>
<script src="report.js"></script>
</body>
</html>
'''
(root / 'index.html').write_text(index, encoding='utf-8')
preview = f'''<title>Pesticid</title>
<meta name="claude:viewport-fit-sides" content="cover">
{fonts}
<style>
{css}
</style>
{body}
<script>
{analytics}
</script>
<script>
{js}
</script>
<script>
{calc}
</script>
<script>
{search}
</script>
<script>
{report}
</script>
'''
(root / 'preview.html').write_text(preview, encoding='utf-8')
print('index.html', len(index), 'preview.html', len(preview))
