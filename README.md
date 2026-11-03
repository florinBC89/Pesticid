# Pesticid

Calculator de doze pentru pesticidele omologate în România: produs × cultură × dăunător → doza omologată și cantitatea totală.

| Folder | Ce conține |
|---|---|
| `site/` | Site-ul de prezentare (HTML/CSS/JS fără framework): calculator, căutare avansată, listă de așteptare. `python3 build.py` generează `index.html`. |
| `app/` | Aplicația (React + Vite, PWA). Vezi `app/README.md`. |
| `emails/` | Emailurile de bun venit (șablon + 4 variante). `python3 build.py` generează HTML-ul. |
| `supabase/migrations/` | Migrările bazei de date, în ordinea aplicării. |
| `supabase/functions/` | Edge Functions: `bun-venit` (trimite emailul prin Resend), `resend-webhook` (livrare/click → listă + PostHog). |
| `supabase/import/` | Importul registrului ANF (`parse_lista.py`) și exportul pentru calculatorul de pe site. |
| `docs/` | `schema-v2.md` (modelul de date), `posthog.md` (evenimente analytics, securitate). |

Cheile se țin în afara repository-ului: `app/.env` local (vezi `app/.env.example`), secretele Edge Functions în Supabase.
