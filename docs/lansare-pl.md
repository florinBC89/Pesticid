# Lansarea versiunii poloneze (agrosphere.eu/pl/)

Totul e pregătit pe ramura `previzualizare`. Pașii de mai jos se fac doar după ce Florin scrie „publică”, în ordinea asta.

## 1. Baza de date și funcțiile (înainte de site)
1. Migrația `supabase/migrations/20261112_19_lista_asteptare_tara_limba.sql` (coloanele `tara`, `limba`; `rezerva_loc_srv` cu `p_tara`, `p_limba`).
   Compatibilă cu site-ul RO: parametrii noi au valori implicite.
2. Deploy, în ordinea asta (au nevoie de coloanele noi): `rezerva`, `bun-venit` (+ `template-pl.ts`, `variants-pl.json`), `dezabonare`, `raport-problema`.
3. Test: o înscriere RO și una PL (fermă + partener cu NIP de test) → emailul de bun venit în limba corectă (`bun-venit` cu `dry: true` întâi), apoi rândurile de test se șterg.

## 2. Site-ul
- `python3 build.py && python3 build_fert.py && python3 build_abonamente.py && python3 build_pl.py` (din `site/`).
- Datele calculatorului PL: `supabase/import/pl_2026_11/build_calc_pl.py` → `site/assets/calc-data-pl.json`.
- Fast-forward `previzualizare` → `main`; verificare live: `/`, `/pl/`, `/pl/abonamente/`, `/pl/termeni/`, `/pl/confidentialitate/`.

## 3. Comutatoarele (`site/lansare_pl.py`)
- La prima publicare ambele rămân `False`: /pl/ e live, dar fără legătură din paginile RO și cu `noindex`; se vede cu `agrosphere.eu/pl/` sau `?beta=pl`.
- `PL_PUBLIC = True`: selectorul RO/PL apare pentru toți, /pl/ poate fi indexat.
- `AUTO_PL = True` (cu `PL_PUBLIC`): browserele în poloneză ajung automat pe /pl/ la prima vizită; alegerea din selector are prioritate.

## Înainte de `PL_PUBLIC`
- Corectura unui vorbitor nativ (fișa de corectură, Artifact cu colecția `poprawki`).
- Regulamin + Polityka prywatności verificate de un jurist (acum fac trimitere la legislația și autoritățile din România).
- Etichetele poloneze din lunile anterioare (okres karencji pentru toate produsele; acum doar 80 de etichete).
