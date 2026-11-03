# Emailuri Pesticid (bun venit pe lista de așteptare)

- `template.html` – șablonul email-safe (tabele, stiluri inline, 600px, Helvetica/Arial + Inter unde e suportat).
- `variants.json` – textele celor 4 variante + config (URL site, URL imagini, linkuri sociale, statistici, exemplul din calculator).
- `build.py` – generează `out/welcome-<id>.html`; `--assets-url https://<domeniu>/emails/assets` pentru producție.
- `assets/` – imaginile folosite în email (PNG/JPG; SVG și WebP nu sunt afișate de clienții de email). De publicat pe site la `/emails/assets/`.

Variante: `pro-6` (primii 100 PRO), `pro-3` (restul PRO), `agronom-3` (primii 20 AGRONOM), `agronom-45` (restul AGRONOM).
Trimiterea: Supabase Edge Function pe insert în `lista_asteptare` → calculează rangul pe plan → alege varianta → Resend API (`html` = fișierul generat).
