#!/usr/bin/env python3
"""Datele calculatorului pentru Polonia: site/assets/calc-data-pl.json (același format ca calc-data.json).

Surse (exporturi locale ale tabelelor din Supabase, nu sunt în repo):
  --registru  JSON cu {"prod": [...], "uz": [...]}  = import_registru_produse / import_registru_utilizari (registrul MRiRW)
  --culturi   director cu ro.json, pl1..pl4.json   = culturi_tari (legarea denumirilor la coduri EPPO)
  --etichete  director cu *.json                   = extragerile din etichete (import_utilizari) — pauza până la recoltare
Reguli:
  - doar produse încă utilizabile (TerminDoStosowania >= azi);
  - doza: maximă + recomandată din textul registrului (doze.py); rândurile cu mai multe variante de doză NU intră (prudență);
  - unități convertite la cele ale calculatorului (L/ha, kg/ha, ml/ha, g/ha, %, L|kg/1000 L apa); restul (tratament sămânță etc.) nu intră;
  - culturi: doar termenii de tip cultură / grupă de culturi; numele românesc legat prin EPPO devine sinonim (căutare);
  - agrofagi: lista din registru despărțită pe virgule; tipul din tipul produsului (+ cuvinte-cheie la produsele mixte);
  - pauza până la recoltare: din etichete, când produsul și cultura se potrivesc; altfel null (= vezi eticheta).
Tipurile de produs rămân cheile din calculatorul RO (Erbicid, Fungicid, …); afișarea poloneză o face build_pl.py."""
import argparse, datetime, json, pathlib, re, sys, unicodedata
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from doze import parse

ap = argparse.ArgumentParser()
ap.add_argument('--registru', required=True); ap.add_argument('--culturi', required=True); ap.add_argument('--etichete', required=True)
ap.add_argument('--azi', default=datetime.date.today().isoformat())
ap.add_argument('--trace', default=None, help='fișier JSON: pentru fiecare rând din registru, ce a produs (pentru verificare)')
ap.add_argument('--out', default=str(pathlib.Path(__file__).resolve().parents[3] / 'site' / 'assets' / 'calc-data-pl.json'))
a = ap.parse_args()

def norm(s): return re.sub(r'[^a-z0-9]+', ' ', unicodedata.normalize('NFD', str(s or '').lower()).encode('ascii', 'ignore').decode()).strip()
def split(s):
    out, depth, cur = [], 0, ''
    for ch in s or '':
        if ch in '([': depth += 1
        if ch in ')]': depth -= 1
        if ch in ',;' and depth == 0: out.append(cur); cur = ''
        else: cur += ch
    out.append(cur)
    return [re.sub(r'\s+', ' ', x).strip().lower() for x in out if x.strip()]
def cap(s): return s[:1].upper() + s[1:]

R = json.loads(pathlib.Path(a.registru).read_text(encoding='utf-8'))
# ---- tipul produsului (cheile calculatorului) ----
TIP = [('chwastob', 'Erbicid'), ('herbicyd', 'Erbicid'), ('fungicyd', 'Fungicid'), ('bakteriocyd', 'Fungicid'), ('insektycyd', 'Insecticid'),
       ('akarycyd', 'Insecticid'), ('moluskocyd', 'Moluscocid'), ('nematocyd', 'Nematocid'), ('rodentycyd', 'Rodenticid'), ('regulator', 'Regulator de crestere')]
def tip_produs(r):
    r = (r or '').lower()
    for k, v in TIP:
        if r.startswith(k): return v
    for k, v in TIP:
        if k in r: return v
    return 'Altul'
BOALA = re.compile(r'mączniak|pleśń|zgnilizn|rdza|septorioz|alternarioz|plamistoś|zaraza|fuzarioz|zgorzel|parch|antraknoz|brunatn|czerń|kędzierzawoś|rak |raki|osutk|głownia|śnieć|łamliwoś|choroba|chorob|fytoftoroz|rynchosporioz|ramularioz|cerkosporioz|askochytoz|sucha zgnilizna|bakteryjn|wirus|mozaik|werticilioz|botrytis|monilioz|drobna plamistość|biała rdza|kiła|zamieranie|gnicie|pleśnienie|mumifikacja|cylindrosporioz|sklerotin|rizoktonioz', re.I)
WEED = re.compile(r'chwast|samosiew|perz|miotła|owies głuchy|wiechlina|wyczyniec|życica|stokłos|chwastnica|włośnic|palusznik|komosa|szarłat|gwiazdnica|przytulia|fiołek|jasnot|mak polny|maruna|rumian|tasznik|tobołki|przetacznik|rdest|chaber|bodziszek|psianka|ostrożeń|mlecz|powój|rzodkiew świrzepa|gorczyca polna|żółtlica|niezapominajka|tasznik|bylica|skrzyp|pokrzywa|szczaw|babka|mniszek|koniczyna|krwawnik|jaskier|starzec|dymnica|tobołek|poziewnik|iglica|chwasty', re.I)
def tip_agent(nume, tp):
    if tp == 'Erbicid': return 'buruiana'
    if tp in ('Fungicid',): return 'boala'
    if tp == 'Regulator de crestere': return 'fiziologic'
    if tp in ('Insecticid', 'Moluscocid', 'Nematocid', 'Rodenticid'):
        return 'boala' if BOALA.search(nume) else 'daunator'
    if WEED.search(nume): return 'buruiana'
    if BOALA.search(nume): return 'boala'
    return 'fiziologic' if re.search(r'wzrost|plon|owoc|odpornoś|kwitnien|zawiązyw|wylegan|pęd|kiełk|dojrzew|stres', nume) else 'daunator'

# ---- unități ----
def unitate(dm, u):
    """(min, max, unitate) din registru -> (min, max, unitate calculator) sau None."""
    f = {'l/ha': (1, 'L/ha'), 'kg/ha': (1, 'kg/ha'), 'ml/ha': (1, 'ml/ha'), 'g/ha': (1, 'g/ha'),
         'l/10 000 m2': (1, 'L/ha'), 'l/10000 m2': (1, 'L/ha'), 'kg/10 000 m2': (1, 'kg/ha'), 'kg/10000 m2': (1, 'kg/ha'),
         'ml/10 000 m2': (1, 'ml/ha'), 'g/10 000 m2': (1, 'g/ha'), 'kg/1000 m2': (10, 'kg/ha'), 'l/1000 m2': (10, 'L/ha'),
         'ml/100 m2': (100, 'ml/ha'), 'ml/100m2': (100, 'ml/ha'), 'g/100 m2': (100, 'g/ha'), 'ml/m2': (10000, 'ml/ha'), 'g/m2': (10000, 'g/ha'),
         'ml/1 m2': (10000, 'ml/ha'), 'g/1 m2': (10000, 'g/ha'), 'ml/10 m2': (1000, 'ml/ha'), 'g/10 m2': (1000, 'g/ha'),
         '%': (1, '%'), 'kg/100 l': (10, 'kg/1000 L apa'), 'l/100 l': (10, 'L/1000 L apa'), 'ml/100 l': (0.01, 'L/1000 L apa'), 'g/100 l': (0.01, 'kg/1000 L apa')}.get(u)
    if not f: return None
    k, uu = f
    return (round(dm[0] * k, 6), round(dm[1] * k, 6), uu)

# ---- culturi (legarea EPPO) ----
C = {}
cdir = pathlib.Path(a.culturi)
ro = json.loads((cdir / 'ro.json').read_text(encoding='utf-8'))
ro_pe_cod = {}
for x in ro:
    if x.get('cod_eppo') and x['tip'] in ('cultura', 'grupa_culturi'): ro_pe_cod.setdefault(x['cod_eppo'], []).append(x['termen'])
for i in range(1, 5):
    for x in json.loads((cdir / f'pl{i}.json').read_text(encoding='utf-8')): C[x['termen']] = x

# ---- pauza din etichete: (produs, cultură) -> zile ----
KAR = {}
for f in pathlib.Path(a.etichete).glob('*.json'):
    d = json.loads(f.read_text(encoding='utf-8'))
    for u in d.get('utilizari', []):
        if u.get('timp_pauza_zile') is None: continue
        for c in u.get('culturi', []):
            for cc in split(c):
                k = (norm(d.get('produs')), norm(cc)); KAR[k] = max(KAR.get(k, 0), u['timp_pauza_zile'])

prod_ok = {}
for p in R['prod']:
    if (p.get('utilizare_pana') or '0') >= a.azi or (p.get('valabil_pana') or '0') >= a.azi:
        prod_ok[(p['nr_autorizatie'], p['produs'])] = p
produse, pid, culturi, cid, tinte, tid, recs, seen = [], {}, {}, {}, {}, {}, [], set()
TRACE = []
stat = {'utilizari': 0, 'fara_produs_valabil': 0, 'doze_multiple': 0, 'fara_doza': 0, 'unitate_necalculabila': 0, 'fara_cultura': 0, 'fara_agrofag': 0, 'cu_karencja': 0}
for u in R['uz']:
    stat['utilizari'] += 1
    p = prod_ok.get((u['nr_autorizatie'], u['produs']))
    if not p: stat['fara_produs_valabil'] += 1; continue
    dm, dr, multi = parse(u['doza_text'])
    if multi: stat['doze_multiple'] += 1; continue
    if not dm and not dr: stat['fara_doza'] += 1; continue
    mx = dm or dr; rc = dr or dm
    if mx[2] != rc[2]: rc = mx
    lo = min(rc[0], mx[1]); conv = unitate((lo, mx[1]), mx[2])
    if not conv: stat['unitate_necalculabila'] += 1; continue
    tp = tip_produs(p['tip'] or u['tip'])
    crops = [t for t in split(u['cultura']) if C.get(t, {}).get('tip') in ('cultura', 'grupa_culturi')]
    if not crops: stat['fara_cultura'] += 1; continue
    agents = split(u['agent']) or (['regulacja wzrostu'] if tp == 'Regulator de crestere' else [])
    if not agents: stat['fara_agrofag'] += 1; continue
    key = norm(p['produs'])   # același nume = același produs (autorizație proprie, import paralel, permis de urgență) → un singur rând
    if key not in pid:
        pid[key] = len(produse) + 1
        produse.append([pid[key], p['produs'], key.replace(' ', '-'), tp, p.get('valabil_pana'), []])
    else:
        e = produse[pid[key] - 1]
        if (p.get('valabil_pana') or '') > (e[4] or ''): e[4] = p.get('valabil_pana')
    tr = {'rand': u['rand_sursa'], 'produs': p['produs'], 'nr': p['nr_autorizatie'], 'rodzaj': p['tip'], 'cultura_text': u['cultura'], 'agent_text': u['agent'],
          'doza_text': u['doza_text'], 'tip_calculator': tp, 'doza': {'min': conv[0], 'max': conv[1], 'unitate': conv[2]}, 'culturi': [], 'agrofagi': []}
    for c in crops:
        if c not in cid: cid[c] = len(cid) + 1; culturi[cid[c]] = cap(c)
        kar = KAR.get((norm(p['produs']), norm(c)))
        if kar is not None: stat['cu_karencja'] += 1
        tr['culturi'].append({'cultura': cap(c), 'eppo': C[c].get('cod_eppo'), 'karencja_din_eticheta': kar})
        for g in agents:
            if g not in tid: tid[g] = len(tid) + 1; tinte[tid[g]] = [cap(g), tip_agent(g, tp)]
            r = (pid[key], cid[c], tid[g], conv[0], conv[1], conv[2], kar, None)
            if c == crops[0]: tr['agrofagi'].append({'agrofag': tinte[tid[g]][0], 'tip': tinte[tid[g]][1]})
            if r[:6] in seen: continue
            seen.add(r[:6]); recs.append(list(r))
    TRACE.append(tr)
# sinonime: numele românesc al culturii (aceeași cultură EPPO) — ca un fermier român să o găsească
sin_c = []
for c, i in cid.items():
    for n in ro_pe_cod.get(C[c].get('cod_eppo'), []): sin_c.append([i, n])
out = {'generat': a.azi, 'tara': 'PL', 'sursa': 'Rejestr środków ochrony roślin MRiRW + etykiety', 'produse': produse, 'culturi': culturi,
       'tinte': tinte, 'recs': recs, 'parinti': {}, 'sinonime': {'cultura': sin_c, 'tinta': []}}
pathlib.Path(a.out).write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
if a.trace: pathlib.Path(a.trace).write_text(json.dumps(TRACE, ensure_ascii=False), encoding='utf-8')
print(json.dumps(stat), '| produse', len(produse), 'culturi', len(culturi), 'agrofagi', len(tinte), 'recs', len(recs), '| fișier', pathlib.Path(a.out).stat().st_size // 1024, 'KB')
