# AgroSphere (agrosphere.eu) — reguli de lucru

## Hard rules
- **Nicio modificare nu ajunge live fără test și aprobare.** Orice push pe `main` care atinge `site/` publică automat pe agrosphere.eu (GitHub Pages, `.github/workflows/pages.yml`). De aceea:
  1. lucrul se face pe ramura `previzualizare` (niciodată direct pe `main`);
  2. se testează local (Playwright, desktop + telefon) și se publică previzualizarea ca Artifact pentru Florin;
  3. abia după ce Florin scrie explicit „publică”, `previzualizare` se aduce în `main` (fast-forward) și se verifică site-ul live.
  Asta e valabil și pentru reparații mici sau urgente.
- Documentul de business (PDF) rămâne privat: nu se publică și nu se pune în repo.
- Secretele (chei API, Turnstile secret etc.) nu se pun în chat sau în git; stau doar în Supabase (Edge Function Secrets / Vault).
- Răspunsurile către Florin: în română, pe scurt, verificat înainte de a afirma ceva.
