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
{sb}
{ph}
{fonts}
<link rel="stylesheet" href="styles.css">
</head>
<body>
{body}
<script src="analytics.js"></script>
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
