# Pesticid — aplicația (PWA, cost zero)

Calculator de doză: omnibox (dăunător / boală / buruiană / produs / cultură) → cultură → produse omologate → doză, total, **cantitate per rezervor**.

## Rulare locală

```bash
cp .env.example .env      # completează VITE_SUPABASE_URL și VITE_SUPABASE_ANON_KEY (cheia publishable)
npm install
npm run dev               # http://localhost:5173
```

Fără chei (sau cu `VITE_MOCK=1`) aplicația rulează în **mod demo** cu date reale extrase din DB (`src/mock/fixtures.ts`) — util pentru UI și pentru lucrul offline.

## Build & deploy (Cloudflare Pages, gratuit)

```bash
npm run build             # → dist/ (PWA: manifest + service worker)
```

Cloudflare Pages: *Build command* `npm run build`, *Output directory* `dist`, variabile de mediu `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Orice alt host static (Netlify, Vercel, GitHub Pages) merge la fel.

## Structură

```
src/
  lib/supabase.ts   client + flag MOCK
  lib/api.ts        cauta(), culturiPentruTinta(), recomanda(), inSezon(), tintePentruCultura(), recomandariProdus(),
                    catalogProduse() (RPC catalog_produse), omologariProdus() (RPC omologari_produs)
  lib/calc.ts       formulele (identice cu recomanda() din DB), inclusiv ultima umplere parțială
  lib/format.ts     formatare ro-RO (1.234,5), etichete status
  lib/recents.ts    recente (7 zile) + parametri (ha, apă, rezervor) în localStorage
  components/       Catalog (tab implicit: filtre tip/omologate, căutare, switcher tabel/carduri – sub 720px doar carduri),
                    ProductCalc („Calculator pesticide”: Cultură → Dăunător → Suprafață → Apă → Rezervor → Calculează),
                    Dropdown (câmp Figma cu listă + căutare + valoare liberă),
                    Omnibox (typeahead grupat, tokens, tastatură), ParamsBar, ResultCard, AuthModal
  mock/fixtures.ts  date pentru modul demo
```

## Date

Sursa principală: registrul ANF „Lista pesticide 03.10.2026” importat în Supabase (447 produse, ~3 400 omologări; vezi `docs/schema-v2.md`). Dozele vin tipizate (`doza_min`, `doza_max`, `unitate`); cele neparsate (`confidence = 35`) nu apar în calculator. Dozele exprimate la 1000 L apă sau în % se convertesc la hectar cu volumul de apă ales (`lib/calc.ts: dozaPerHa`).

## Cont & măsurare

- **Cont invizibil**: la prima deschidere `signInAnonymously()` → userul are `user_id`, RLS funcționează, nimic nu i se cere. Când dă email (link magic) sau Google, identitatea se **leagă** de același cont (`updateUser` / `linkIdentity`) — istoricul rămâne.
- **Evenimente** (`src/lib/analytics.ts` → `rpc inregistreaza_eveniment`): vizita, cautare, cautare_fara_rezultat, alegere, cultura_aleasa, calcul, salveaza_click, cont_modal, cont_metoda_click, cont_inchis, login, paywall_afisat. `cont_creat` și `abonament_activat` vin din trigger-e în DB (sursa de adevăr), nu din client.
- **Răspunsurile** (SQL Editor / dashboard, nu prin API): `v_metode_cont` (email vs Google, minute până la cont), `v_primele_cautari`, `v_primele_alegeri`, `v_abonamente` (zile până la plată), `v_funnel_zilnic`, `v_utilizatori` (rând per device).

Setări necesare în Supabase → Authentication:
1. **Anonymous sign-ins: ON** (altfel vizitatorii nu primesc `user_id` și `calcule_recente` nu se poate folosi).
2. **Email**: Magic link activ; template în română.
3. **Google**: provider activat cu Client ID/Secret din Google Cloud; *Redirect URLs* = domeniul aplicației (și `http://localhost:5173` pentru dev).
4. (opțional) **Leaked password protection: ON**.

## Ce lipsește față de design (următorii pași)

- cont + fermă + registrul tratamentelor (tabelele există în DB, UI nu încă)
- tank mix cu 2 ținte (al doilea token în omnibox)
- pagina produsului completă (acum: chips cu combinațiile cultură × țintă)
- microfon / scanare etichetă pe mobil
