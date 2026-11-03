# PostHog — strategie și plan de evenimente (Pesticid)

Stare: implementat pe site (noiembrie 2026) în `site/analytics.js`, `calc.js`, `search.js`, `main.js`; evenimentele `onb_*` rămân pentru aplicație. Fără cheie PostHog (`VITE_POSTHOG_KEY` în `app/.env`), evenimentele nu pleacă; cu `?ph_debug=1` în URL apar în consolă. Scop: să vedem dacă fermierii ajung la un rezultat (doză calculată sau fișă de omologare), unde se blochează și ce îi aduce pe lista de așteptare.

## Principii

1. **PostHog Cloud EU** (Frankfurt). Utilizatorii sunt din România, datele rămân în UE.
2. **Un singur proiect, două surse**: site-ul (`source: site`) și aplicația (`source: app`), cu aceleași nume de evenimente, ca să comparăm pâlniile.
3. **Nume în engleză, `snake_case`, trecut, format `obiect_acțiune`** (`calc_result_shown`, nu `Calculează apăsat`). Proprietățile tot `snake_case`. Evenimentele au prefix pe zonă: `calc_`, `search_`, `onb_`, `waitlist_`.
4. **Puține evenimente, cu proprietăți bogate.** Maximum ~25 de evenimente definite. Nu un eveniment pentru fiecare click: `search_field_opened` cu `field: cultura|tinta|produs` în loc de trei evenimente.
5. **Fără date personale în proprietăți.** Emailul nu intră niciodată într-un eveniment; identificăm după `user_id` (din Supabase) abia după creare cont. Pe site, până la cont, totul e anonim.
6. **Cookieless până la consimțământ.** SDK-ul pornește cu `persistence: 'memory'`; după acceptul din bannerul de cookie-uri trece pe `localStorage+cookie`. Înainte de accept numărăm vizite și pâlnii în sesiune, fără utilizatori recurenți.
7. **Autocapture oprit** pe site (zgomot pe chip-uri, sute de click-uri fără sens) și pornit doar în app pentru heatmaps. Session replay pornit cu 5–10% eșantion pe site, 100% în app pe fluxurile noi, cu câmpurile de email mascate.
8. **Un singur loc de definire**: `site/analytics.js` expune `track(name, props)`; calc.js și search.js apelează doar funcția asta. Lista de evenimente de mai jos e sursa de adevăr; orice eveniment nou se adaugă aici întâi.

## Proprietăți comune (pe toate evenimentele)

| Proprietate | Valori | De ce |
|---|---|---|
| `source` | `site`, `app` | compari site vs. app |
| `device` | `mobile`, `tablet`, `desktop` | fluxurile diferă (selector pe tot ecranul pe mobil) |
| `mode` | `calc`, `search` | tabul activ |
| `data_version` | data din `calc-data.json` (`generat`) | ca să nu comparăm rezultate pe seturi de date diferite |
| `session_step` | numărul evenimentului în sesiune | ordinea acțiunilor fără replay |

Culturile, dăunătorii și produsele se trimit ca **id + nume** (`cultura_id`, `cultura`), nu doar nume: numele se schimbă la importuri, id-ul nu.

## Evenimente

### A. Site · hero și taburi

| Eveniment | Când | Proprietăți | Întrebarea la care răspunde |
|---|---|---|---|
| `hero_tab_switched` | click pe un tab | `to: calc|search`, `from` | câți încep cu calculatorul vs. cu căutarea |
| `hero_cta_clicked` | „Creează cont” / „Rezerv loc” din nav | `cta` | de unde pleacă spre listă |

### B. Calculator (`calc_`)

| Eveniment | Când | Proprietăți | Întrebarea |
|---|---|---|---|
| `calc_started` | prima interacțiune cu un selector din sesiune | `first_field` | câți ating calculatorul |
| `calc_field_set` | o valoare aleasă | `field: produs|cultura|tinta`, `id`, `nume`, `via: list|typed|auto|picker`, `query_len`, `options_count` | se alege din top 10 sau după tastare; câte opțiuni erau |
| `calc_field_cleared` | × pe un câmp | `field` | unde se răzgândesc |
| (în căutare: `search_field_cleared`) | × pe un câmp din bară | `field` | |
| `calc_no_match` | tastare fără potriviri | `field`, `query` (max 40 car.) | ce produse / culturi lipsesc din bază (**cel mai valoros eveniment pentru conținut**) |
| `calc_dose_entered` | Doza ta completată | `dose_relation: in_range|below_min|above_max|fixed`, `doza_omologata_min/max`, `unitate` | cât de des pun doze în afara intervalului |
| `calc_result_shown` | click Calculează reușit | `produs_id`, `cultura_id`, `tinta_id`, `ha`, `apa`, `doza`, `unitate`, `pauza`, `total_produs`, `has_concentration_unit` | **evenimentul-cheie de activare**; distribuția de suprafețe arată profilul fermierilor |
| `calc_blocked` | Calculează inactiv și utilizatorul apasă / încearcă | `reason: no_produs|no_cultura|no_tinta|no_dose|above_max|no_ha|no_apa` | unde se opresc |
| `calc_abandoned` | sesiune închisă cu calc început, fără rezultat | `last_field`, `fields_set` | unde cade pâlnia |

Pâlnie: `calc_started → calc_field_set(produs) → (cultura) → (tinta) → calc_result_shown`.

### C. Căutare avansată (`search_`)

| Eveniment | Când | Proprietăți | Întrebarea |
|---|---|---|---|
| `search_started` | primul câmp atins | `first_field` | câți încep cu cultura vs. dăunătorul vs. produsul (validează ordinea câmpurilor) |
| `search_field_opened` | lista / selectorul pe tot ecranul deschis | `field`, `picker: dropdown|fullscreen`, `context_fields` (ce era deja ales) | câți deschid fără să tasteze |
| `search_typed` | la 3+ litere, cu debounce 800 ms | `field`, `query`, `hits_count`, `hits_in_other_field` | ce caută lumea, ce nu găsim (sinonime noi pentru tabela `sinonime`) |
| `search_field_set` | valoare aleasă | `field`, `id`, `nume`, `via: top|group|alpha|typed|more|other_field|result_card`, `position` | din ce grup se alege (justifică top 12 / grupuri ANF / alfabetic) |
| `search_no_match` | 3+ litere fără nicio potrivire | `field`, `query` | lacune în bază |
| `search_more_expanded` | „… încă N” | `field`, `group`, `hidden_count` | dacă listele scurte sunt suficiente |
| `search_submitted` | click Caută / Enter | `fields_set: [c,t,p]`, `trigger: button|enter|auto` | câți apasă efectiv Caută vs. auto |
| `search_result_shown` | fișă afișată | `result_type: cultura|tinta|produs|ct|pc|pt|pct`, `ids`, `counts` (produse / culturi / probleme) | ce fișe se cer; fișele goale (`counts = 0`) |
| `search_result_clicked` | click într-o fișă | `result_type`, `target: problem|crop|product|calc_row|more` | fișa duce mai departe sau e capăt de drum |
| `search_calc_shown` | fișa omologării cu calcul (toate trei alese) | `produs_id`, `cultura_id`, `tinta_id` | |
| `search_calc_result_shown` | Calculează din fișă | aceleași ca `calc_result_shown` + `origin: search` | activare și din căutare |
| `search_mic_clicked` / `search_scan_clicked` | butoanele „în curând” | `device` | cererea pentru dictare / scanare înainte să le construim |

Pâlnie: `search_started → search_field_set → search_result_shown → search_result_clicked → search_calc_result_shown`.

### D. Lista de așteptare și onboarding (`waitlist_`, `onb_`)

| Eveniment | Când | Proprietăți | Întrebarea |
|---|---|---|---|
| `waitlist_viewed` | secțiunea „Acces timpuriu” intră în ecran | `plan_visible` | câți ajung la ofertă |
| `waitlist_form_started` | focus în câmpul de email | `plan: pro|agronom` | |
| `waitlist_submitted` | trimitere reușită | `plan`, `had_calc_result`, `had_search_result`, `results_before_signup` | **cine se înscrie: cei care au calculat ceva sau cei care doar au citit** |
| `waitlist_failed` | eroare | `plan`, `reason: invalid_email|network|duplicate` | |
| `onb_email_opened` / `onb_email_clicked` | din Resend (webhook → PostHog) | `email_no: 1..4`, `plan`, `link` | care din cele 4 emailuri aduce lumea înapoi |
| `onb_account_created` | cont în app | `plan`, `days_since_waitlist`, `source_email_no` | conversia listă → cont |
| `onb_step_completed` | pași din app | `step: farm|parcels|first_calc|registru`, `step_no` | unde se abandonează onboarding-ul |
| `onb_first_calc` | primul calcul în app | `days_since_signup` | time-to-value |

Identificare: la `onb_account_created` apelăm `posthog.identify(user_id, { plan, judet })` și `alias` cu id-ul anonim de pe site, ca pâlnia site → app să rămână legată. `judet` doar dacă îl cerem în onboarding, niciodată adresa.

### E. Raportează o problemă (`report_`)
| Eveniment | Când | Proprietăți | |
|---|---|---|---|
| `report_form_started` | primul focus / alegere în formular | — | |
| `report_attachment_added` | un fișier s-a urcat cu succes | `tip: img|vid` | |
| `report_submitted` | raport primit de server | `subiect`, `fisiere` (număr) | conținutul descrierii NU se trimite în PostHog |
| `report_failed` | eroare la urcare sau trimitere | `reason: upload|rate|email|network|…` | |

Butonul din nav („Am o problemă”, înlocuiește „Creează cont”) trimite `hero_cta_clicked` cu `cta: nav_am_o_problema`.

## Ce urmărim în dashboard-ul inițial

1. **Activare**: % din sesiuni cu `calc_result_shown` sau `search_calc_result_shown`. Ținta primelor săptămâni: 25%.
2. **Pâlnia calculatorului** pe mobil vs. desktop; pasul cu cea mai mare cădere.
3. **Top 20 `*_no_match`** pe săptămână → lista de produse / sinonime de adăugat în bază (intrare directă în `lista_asteptare` de conținut).
4. **`search_field_set.via`**: dacă `alpha` e sub 5%, lista alfabetică poate fi scoasă de pe mobil.
5. **`waitlist_submitted.had_calc_result`**: dacă înscrierile vin mai ales după un rezultat, mutăm formularul mai aproape de rezultat.
6. **Distribuția `ha`** din rezultate: mic / mijlociu / mare, ca să știm cine folosește de fapt site-ul.
7. **Replay** doar pentru sesiunile cu `calc_blocked` sau `calc_abandoned` cu 2+ câmpuri alese.

## Ce nu urmărim

- Click pe fiecare chip (acoperit de `search_field_set.via`).
- Scroll depth (fără valoare la un calculator).
- Textul tastat sub 3 litere.
- Emailuri, nume, IP-uri în proprietăți.

## Implementare pe site — stare

Făcut: pașii 1–3 și 6 de mai jos (SDK pe CDN, banner de consimțământ, instrumentare, listă de evenimente). Făcut și: `ph_id` în `lista_asteptare` (trimis de site la înscriere) și Edge Function `resend-webhook` (Resend → `onb_email_delivered | clicked | bounced | complained | delayed`, cu `distinct_id = ph_id`). Secrete necesare în Supabase: `POSTHOG_KEY` (Project API key), `RESEND_WEBHOOK_SECRET` (Signing secret al webhook-ului). Cheia PostHog intră și în `app/.env` ca `VITE_POSTHOG_KEY` pentru site.

## Implementare pe site (ordine)

1. `site/analytics.js`: încarcă `posthog-js` de pe CDN doar după `DOMContentLoaded`, `api_host: https://eu.i.posthog.com`, `persistence: 'memory'`, `autocapture: false`, `capture_pageview: true`, `session_recording.maskAllInputs: true`, eșantion replay 10%. Expune `window.track`. Proprietățile comune se adaugă prin `register`.
2. Banner de cookie-uri minimal (acceptă / doar necesare); la accept `posthog.set_config({ persistence: 'localStorage+cookie' })`.
3. Instrumentare în `calc.js` și `search.js` în punctele de mai sus (în jur de 20 de apeluri).
4. Formularul de listă: `waitlist_submitted` după răspunsul funcției `rezerva_loc`, cu `distinct_id` trimis și în Supabase (coloană `ph_id` în `lista_asteptare`), ca să legăm emailurile Resend de sesiunea anonimă.
5. În Supabase: funcție Edge pentru webhook-urile Resend → `posthog.capture` server-side pentru `onb_email_*`.
6. Verificare: în PostHog, „Data management → Events” trebuie să arate exact lista de mai sus și nimic altceva; definim pâlniile din secțiunea de dashboard.

## Cost

Planul gratuit PostHog include 1 milion de evenimente și 5.000 de înregistrări de sesiune pe lună. La 10.000 de utilizatori cu ~30 de evenimente pe vizită și 20 de vizite pe lună ajungem la ~6 milioane de evenimente, adică aproximativ 25–30 $ pe lună; sub 2.000 de utilizatori rămânem în planul gratuit.


## Securitate (audit 02.11.2026)

Aplicat: funcția de trigger nu mai e executabilă de rolurile publice; `rezerva_loc` validează emailul și planul în funcție și limitează rata (20/minut și 200/oră global, 5/oră pe IP, IP păstrat doar ca hash SHA-256); webhook-ul Resend deduplică după `svix-id` (`resend_webhook_ids`). Acceptat ca risc minor: răspunsurile pg_net (cu antetul secret) rămân 6 ore, vizibile doar pentru `postgres`/`service_role`. De făcut din dashboard la lansarea aplicației: Authentication → Settings → Leaked password protection.
