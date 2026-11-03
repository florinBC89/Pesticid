# Pesticid — schema de date v2 (Supabase)

Proiect: `rpwmfhlmdscjpcrqqmyf` (eu-west-1). Migrările sunt în `supabase/migrations/` și au fost aplicate pe proiect în ordinea 01 → 06.

## Principiu

Trei straturi, toate în `public`:

| Strat | Tabele | Rol |
|---|---|---|
| **A — brut (existent)** | `culturi`, `daunatori`, `pesticide`, `produse`, `substante`, `produs_substanta`, `recomandari`, `search_cache`, `popular_searches` | Ce a venit din importul „Centralizator”. Coloanele text (`doza`, `unitate_doza`, `pauza`) rămân neatinse, ca urmă de audit. |
| **B — canonic/tipizat (nou)** | coloane noi pe tabelele de mai sus + `tinte`, `daunator_tinta`, `tinta_cultura`, `restrictii_produs`, `compatibilitate_produse`, `sinonime`, `cautari_fara_rezultat`, `import_raw` | Sursa de adevăr pentru aplicație. **Doza se citește din `recomandari.doza_min / doza_max / unitate`, niciodată din `doza` (text).** |
| **C — fermă (nou, RLS)** | `ferme`, `ferme_membri`, `parcele`, `echipamente`, `operatori`, `tratamente`, `tratament_produse`, `magazie`, `calcule_recente` | Datele private ale fermierului: profil, parcele, **registrul tratamentelor**, stoc. |

Obiectul de business central rămâne **produs × cultură × țintă → doză** (`recomandari`). Tot ce e în jur există ca să facă rândul ăsta găsibil, corect și calculabil.

## Entități canonice

- **Culturi**: rândurile brute („Grau”, „orz de toamna”, „rau de primavara”) au `canonic_id` → cultura canonică cu diacritice și `slug` (`grau-de-toamna`). Canonicele au `parinte_id` (ierarhie: `grau-de-toamna → grau → cereale-paioase`), ca recomandările date generic „la grâu” să apară și pentru grâul de toamnă. `culturi_ancestori(slug)` întoarce lanțul.
- **Ținte** (`tinte`): dăunător / boală / buruiană / fiziologic, cu `nume_stiintific`, `slug`, `luni_sezon` (pentru „în sezon acum”). Șirurile compuse din `daunatori` („Afide, tripsi, viermele roșu…”) se leagă la mai multe ținte prin `daunator_tinta`.
- **Produse**: `nume_canonic` („KARATE ZEON”), `nume_secundare` (`{NINJA}`), `slug`, `status` (omologat / retras / expirat / interzis / duplicat), `nr_omologare`, `formulare`, `cod_mod_actiune` (IRAC/FRAC/HRAC), `toxic_albine`, `eticheta_url`.
- **Sinonime**: limbajul fermierilor → entități („păduchi” → afide, „pir” → *Elymus repens*, „Ninja” → Karate Zeon). Cresc din `cautari_fara_rezultat` (`raporteaza_cautare(q)`).

## API (funcții SQL, expuse prin PostgREST `rpc/`)

| Funcție | Ce face |
|---|---|
| `cauta(q, lim, luna)` | Omnibox: typeahead peste `private.search_index` (culturi + ținte + produse + substanțe + sinonime), fără diacritice, prefix > fuzzy (`pg_trgm`), bonus „în sezon” și „omologat”, penalizare „retras”. Întoarce `entitate_tip`, `slug`, `scor`, `in_sezon`, `extra` (culturi pentru țintă, status produs…). |
| `culturi_pentru_tinta(tinta_slug)` | Pasul „La ce cultură?” — culturile cu produse pentru ținta aleasă, inclusiv copiii din ierarhie (`potrivire = exacta / parinte`). |
| `recomanda(cultura_slug, tinta_slug, ha, apa_l_ha, rezervor_l, lim, min_confidence)` | Produsele omologate + **calculul**: `cantitate_totala`, `apa_totala`, `nr_umpleri`, `cantitate_per_rezervor`, `concentratie_pct`, plus `restrictii` (jsonb). Include recomandările de la cultura părinte (`potrivire_cultura`). Exclude rândurile cu `confidence < 20`. |
| `in_sezon(luna, culturi_slug[], lim)` | „În sezon acum” pentru zero-query, filtrat pe culturile fermierului. |
| `raporteaza_cautare(q, judet)` | Înregistrează un termen fără rezultat în jurnalul `cautari_fara_rezultat` (insert-only, prin RLS). Agregarea pe termen e în view-ul `v_cautari_fara_rezultat` (doar dashboard / service_role). |
| `refresh_search_index()` | Reîmprospătează view-ul materializat `private.search_index` după import (doar service_role). View-ul stă în schema `private`, neexpusă prin API; clientul îl atinge doar prin `cauta()`. |

Calculul în DB folosește `doza_min`; UI-ul poate recalcula pe orice doză din intervalul `[doza_min, doza_max]` cu aceleași formule:

```
cantitate_totala        = doza × ha
apa_totala              = apa_l_ha × ha
nr_umpleri              = apa_totala / rezervor_l
cantitate_per_rezervor  = doza × (rezervor_l / apa_l_ha)
ultima umplere parțială = restul de ha × doza  (UI)
```

## Registrul tratamentelor (strat C)

`tratamente` = o trecere (dată, parcelă, cultură, ha, apă/ha, echipament, operator, `sursa` = calcul / tank_mix / manual, `recoltare_permisa_de`).
`tratament_produse` = produsele din acea trecere (tank mix = mai multe rânduri), cu doză, cantități, `pauza_zile`, `nr_omologare_snapshot` (ce scria în registru la momentul aplicării) și `ordine_umplere`.

RLS: un utilizator vede/editează doar fermele în care e `owner` sau membru (`ferme_membri`, roluri owner / agronom / operator / cititor). Planul Agronom = același cont, mai multe ferme.

## Importul registrului ANF (Lista_pesticide-03.10.2026.xlsx) — 30.10.2026

Pipeline (reproductibil): `supabase/import/anf_2026_10/parse_lista.py lista.xlsx` → fișiere SQL în `out/` (schema de staging `import_anf_*` + date, bucăți ≤ 42 KB) → migrarea `20261030_09_import_anf.sql` (transformă staging-ul în tabelele canonice; poate fi rulată de mai multe ori). Raportul parsării: `out/raport.md`.

Rezultat în bază:

| Ce | Câte | Note |
|---|---|---|
| produse din ANF | 447 (300 omologate, 147 expirate) | 462 produse în total; cele 39 din Centralizator potrivite după nume/nume secundar au fost actualizate, recomandările lor vechi (135) au `status = 'retras'` |
| recomandări ANF | 3 375 active | din 3 740 rânduri de staging; 365 erau dubluri exacte (produs × cultură × țintă × doză) și au fost colapsate |
| culturi canonice | 159 (+78) | 6 create automat, categorie „altele” (pepiniere, plante aromatice, ornamentale, silvicultură, spații de depozitare, cultură nespecificată) |
| ținte canonice | 356 (+304) | 211 create automat din textul brut, fără regulă — de unit/verificat; 899 șiruri brute → `daunatori` + `daunator_tinta` (2 916 legături) |
| produse fără omologări lucrate | 2 118 în `import_raw` (`procesat = false`) | „celelalte substanțe” — coada pentru următoarea tură de lucru în ANF |

Încredere (`recomandari.confidence`, toate cu `needs_review = true`):

| confidence | rânduri | ce înseamnă |
|---|---|---|
| 60 | 2 944 | doză parsată (min/max/unitate), text curat |
| 45 | 118 | doză parsată dar din text ambiguu (ex. „x–y L/ha în funcție de…”, culturi compuse) |
| 35 | 291 | **doza nu a putut fi parsată** (`doza_min` null, textul brut e în `doza`) — nu apar în calculator, trebuie completate manual |
| 10 | 22 | tipul produsului nu se potrivește cu ținta sau unitate suspectă — excluse din `recomanda()` |

Unități noi acceptate: `L/1000 L apa`, `kg/1000 L apa`, `%` (doze ca concentrație, frecvente la legume/pomi/viță). Aplicația le convertește la hectar prin volumul de apă ales (`dozaPerHa()` în `app/src/lib/calc.ts`). Tipuri noi de produs: Rodenticid, Moluscocid, Nematocid.

Limitări cunoscute: `mod_aplicare` e dedus din text (`parse_mod_aplicare`) și greșește la granule încorporate în sol (apar ca „foliar”); grupurile generice de buruieni („buruieni dicotiledonate anuale”) sunt o singură țintă, nu specii; secvențele de id au fost realiniate la `max(id)` (seed-urile anterioare aveau id explicit).

## Securitate și performanță (Supabase Advisors, 30.10.2026)

Migrarea `20261030_10_avize_supabase.sql` închide avertismentele raportate de Supabase:

- extensiile `unaccent` și `pg_trgm` sunt în schema `extensions` (nu în `public`); `f_unaccent` folosește dicționarul `extensions.unaccent`;
- `search_index` e în schema `private`, deci nu apare în API-ul REST; `cauta()` și `refresh_search_index()` citesc de acolo;
- funcțiile apelate de client (`inregistreaza_eveniment`, `raporteaza_cautare`) sunt `SECURITY INVOKER`; scrierea e permisă prin politici RLS de INSERT, clientul nu poate citi `evenimente` sau `cautari_fara_rezultat`;
- `cautari_fara_rezultat` e jurnal insert-only (fără unicitate pe `termen_norm`); agregarea e în `v_cautari_fara_rezultat`;
- indexuri pe toate cheile străine, `auth.uid()` evaluat o singură dată per interogare în politici, o singură politică permisivă per acțiune (politicile `_write` de tip ALL au devenit `_insert` / `_update` / `_delete`), indexurile duplicate eliminate.

Rămân intenționat: `import_raw` și `kv_store_adfeb91c` au RLS pornit fără politici (le scrie doar service_role). Setarea „Leaked password protection” se face din dashboard (Authentication → Settings), nu din SQL.

## Ce urmează pe date

1. ~~Re-import din registrul ANF~~ făcut (30.10.2026). Următorul pas: parsarea manuală/asistată a celor 291 doze neparsate și verificarea celor 211 ținte create automat; apoi restul de 2 118 produse din `import_raw`.
2. `substante` + `produs_substanta` pentru toate produsele (azi: 1 rând) — e stratul stabil pentru extinderea în UE.
3. `restrictii_produs` din etichete (albine, zonă tampon, temperatură) și `compatibilitate_produse` pentru tank mix.
4. Etichetele PDF (`eticheta_url`) și `nr_omologare` pe fiecare produs — cerute în registrul oficial.
