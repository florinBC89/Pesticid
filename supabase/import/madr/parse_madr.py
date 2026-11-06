#!/usr/bin/env python3
"""Extrage îngrășămintele din lista MADR/ICPA (PDF, actualizată la 01.06.2024) într-un tabel structurat.

Rulare:  python3 -I supabase/import/madr/parse_madr.py
Ieșire:  supabase/import/madr/out/fertilizanti.json  (+ .csv pentru verificare manuală)

PDF-ul e un tabel Word cu 5 coloane: Nr. crt. | Tipul de îngrășământ și compoziția | Documentul de autorizare |
Beneficiarul autorizației | Data ședinței comisiei / Observații. Indicii chimici (P2O5, K2O, NH4…) sunt litere mai mici,
așa că textul se extrage cu text_y_tolerance=4 ca să rămână pe același rând („P2O5”, nu „P O” + „2 5”).
Compoziția e text liber: cifrele (N, P2O5, K2O, S, Ca, Mg, microelemente) se extrag cu reguli, iar ce e nesigur
primește `de_verificat` + motivul, pentru verificare manuală.
"""
import csv, glob, json, os, re, sys
import pdfplumber

AICI = os.path.dirname(os.path.abspath(__file__))
SURSA = 'MADR / ICPA — Lista îngrășămintelor chimice și biologice autorizate, actualizată la 01.06.2024'

CATEGORII = {
    1: 'Îngrășăminte cu azot', 2: 'Îngrășăminte cu fosfor', 3: 'Îngrășăminte cu potasiu',
    4: 'Îngrășăminte complexe (NP, NPK și alte elemente)', 5: 'Îngrășăminte organominerale pe suport de lignit',
    6: 'Îngrășăminte cu microelemente', 7: 'Îngrășăminte lichide cu azot', 8: 'Îngrășăminte lichide complexe',
    9: 'Îngrășăminte foliare', 10: 'Îngrășăminte biologice', 11: 'Îngrășăminte ureoformaldehidice',
    12: 'Amendamente', 13: 'Stimulatori de creștere și dezvoltare',
}

RE_NR = re.compile(r'^\s*(\d{1,2})\.(\d{1,4})\.?\s*$')
L = r'A-Za-zĂÂÎȘŞȚŢăâîșşțţ'


def randuri(pdf_path):
    """Toate rândurile tabelelor, cu celulele goale (None) din coloanele îmbinate scoase."""
    out = []
    with pdfplumber.open(pdf_path) as pdf:
        for i, p in enumerate(pdf.pages):
            for t in p.extract_tables({'text_y_tolerance': 4}):
                for r in t:
                    out.append((i + 1, [(x or '').strip() for x in r if x is not None]))
    return out


def adauga(rec, camp, text):
    if text:
        rec[camp] = (rec[camp] + '\n' + text).strip() if rec[camp] else text


def inregistrari(rows):
    recs, cur = [], None
    for pag, c in rows:
        if not any(c):
            continue
        nr = RE_NR.match(c[0]) if c else None
        if nr:
            rest = [x for x in c[1:] if x]
            if len(c) == 5:
                comp, aut, ben, obs = c[1], c[2], c[3], c[4]
            else:  # rânduri cu celule îmbinate diferit: compoziție … autorizație … beneficiar … observații
                comp = rest[0] if rest else ''
                obs = rest[-1] if len(rest) > 1 else ''
                aut = rest[1] if len(rest) > 2 else ''
                ben = '\n'.join(rest[2:-1]) if len(rest) > 3 else ''
            cur = {'nr_madr': f'{int(nr.group(1))}.{int(nr.group(2))}', 'categorie_nr': int(nr.group(1)),
                   'compozitie_text': comp, 'autorizatie': aut, 'beneficiar': ben, 'observatii': obs, 'pagina': pag}
            recs.append(cur)
        elif len(c) == 5 and c[0] == '' and cur:  # continuarea rândului de pe pagina anterioară
            for camp, txt in zip(('compozitie_text', 'autorizatie', 'beneficiar', 'observatii'), c[1:]):
                adauga(cur, camp, txt)
        elif len(c) == 3 and cur and re.search(r'Autoriza|Autorizare', c[0]):  # a doua autorizație pentru același produs
            for camp, txt in zip(('autorizatie', 'beneficiar', 'observatii'), c):
                adauga(cur, camp, txt)
        elif len(c) == 4 and cur and not RE_NR.match(c[0]) and re.search(r'Autoriza', c[1]):  # produs fără nr. crt.
            cur = {'nr_madr': None, 'categorie_nr': cur['categorie_nr'], 'compozitie_text': c[0], 'autorizatie': c[1],
                   'beneficiar': c[2], 'observatii': c[3], 'pagina': pag}
            recs.append(cur)
        # restul: capete de tabel, titluri de categorie, rânduri „0 1 2 3 4”
    return recs


# ---------- compoziția ----------
ELEMENTE = [  # (cheie, regex simbol (sensibil la majuscule), regex cuvânt (fără majuscule))
    ('P2O5', r'P2O5|\bP\b', r'\bfosfor'),
    ('K2O', r'K2O|\bK\b', r'\bpotasiu'),
    ('N', r'\bNt\b|\bN\b', r'\bazot'),
    ('SO3', r'SO3', None),
    ('S', r'\bS\b', r'\bsulf\b|\bsulful\b'),
    ('CaO', r'CaO\b', None),
    ('Ca', r'\bCa\b', r'\bcalciu'),
    ('MgO', r'MgO\b', None),
    ('Mg', r'\bMg\b', r'\bmagneziu'),
    ('B', r'\bB\b', r'\bbor\b'),
    ('Cu', r'\bCu\b', r'\bcupru'),
    ('Fe', r'\bFe\b', r'\bfier\b'),
    ('Mn', r'\bMn\b', r'\bmangan'),
    ('Zn', r'\bZn\b|ZnO', r'\bzinc'),
    ('Mo', r'\bMo\b', r'\bmolibden'),
    ('Co', r'\bCo\b', r'\bcobalt'),
    ('aminoacizi', None, r'aminoaci'),
    ('substante_humice', None, r'humic|humice'),
    ('materie_organica', None, r'materie organic|substanță organic|substanţă organic|substan[tț]e organice'),
]
RE_VAL = re.compile(r'(\d+(?:[.,]\d+)?)\s*(?:[–-]\s*(\d+(?:[.,]\d+)?))?\s*(%|g/l|g/L|mg/l|mg/L|ppm|g/kg|mg/kg)')
RE_SUBFORMA = re.compile(r'N\s*[-–]?\s*(NH4|NO3)|\b(azot|N)\s+(amoniacal|nitric|amidic|ureic|organic)', re.I)
RE_TOTAL = re.compile(r'\bNt\b|total', re.I)
RE_DIN_DENUMIRE = re.compile(r'(?<![\d.,])(\d{1,3}(?:[.,]\d+)?)\s*-\s*(\d{1,3}(?:[.,]\d+)?)\s*-\s*(\d{1,3}(?:[.,]\d+)?)(?![\d.,])')


def nr(s):
    return float(s.replace(',', '.'))


def element(seg, a, b):
    """elementul valorii aflate la [a, b) în fragment:
    1) simbolul lipit imediat după valoare („12,0% N”, „180 g/l P2O5”);
    2) altfel cel mai apropiat element dinaintea valorii („Azot total (N) – 33%”, „Sulfat de potasiu (K2O – 27%)”);
    3) altfel cel mai apropiat de după ea."""
    dupa, inainte, departe = None, None, None
    for cheie, sim, cuv in ELEMENTE:
        for rx, fl in ((sim, 0), (cuv, re.I)):
            if not rx:
                continue
            for m in re.finditer(rx, seg, fl):
                if m.start() >= b:
                    d = m.start() - b
                    if d <= 3 and (dupa is None or d < dupa[1]):
                        dupa = (cheie, d, m.group(0))
                    if departe is None or d < departe[1]:
                        departe = (cheie, d, m.group(0))
                elif m.end() <= a:
                    d = a - m.end()
                    if inainte is None or d < inainte[1]:
                        inainte = (cheie, d, m.group(0))
    best = dupa or inainte or departe
    return (best[0], best[2]) if best else (None, None)


def compozitie(text):
    """→ (nutrienți {cheie: {v, u, max?}}, motive de verificare)
    Rândurile se lipesc între ele (valorile sunt des rupte pe două rânduri: „55⏎ppm Cu”), apoi textul se taie pe „;” și
    pe „, ” urmat de literă (virgula zecimală nu are spațiu). Fiecare valoare (% g/l ppm …) primește elementul cel mai
    apropiat din fragmentul ei."""
    nut, motive, sub = {}, [], {}
    corp = re.split(r'\n\s*Culturi\s*:', text, maxsplit=1)[0]
    corp = ' '.join(corp.split())
    for seg in re.split(rf';|,\s+(?=[{L}(])', corp):
        seg = seg.strip()
        if not seg:
            continue
        sterge = lambda m: ' ' * len(m.group(0))  # păstrează pozițiile, ca distanța element–valoare să fie corectă
        # formulele chimice (P2O5, NH4NO3, CaCO3, Fe2O3…) și temperaturile („20 0C”) au cifre care nu sunt valori
        curat = re.sub(r'\b(?:[A-Z][a-z]?\d*){2,}\b|\b[A-Z][a-z]?\d+\b', sterge, seg)
        curat = re.sub(r'\b\d+\s*0C\b|\b\d+\s*°C\b', sterge, curat)
        vals = list(RE_VAL.finditer(curat))
        for i, mv in enumerate(vals):
            # fereastra valorii: de la valoarea anterioară până la următoarea (elementul ei e între ele)
            w0 = vals[i - 1].end() if i else 0
            w1 = vals[i + 1].start() if i + 1 < len(vals) else len(seg)
            ctx = seg[w0:w1]
            el, gasit = element(ctx, mv.start() - w0, mv.end() - w0)
            if not el:
                continue
            u = mv.group(3).lower()
            d = {'v': nr(mv.group(1)), 'u': u}
            if mv.group(2):
                d['max'] = nr(mv.group(2))
                if d['max'] < d['v']:  # „2,5 x 10-5%” nu e un interval
                    motive.append(f'valoare neclară la {el}: {mv.group(0)}')
                    continue
            if gasit in ('P', 'K'):  # dat ca element (P, K), nu ca oxid: P2O5 = P × 2,2914; K2O = K × 1,2046
                d = {'v': round(d['v'] * (2.2914 if gasit == 'P' else 1.2046), 3), 'u': u, 'din': f'{d["v"]} {u} {gasit}'}
                motive.append(f'{gasit} dat ca element, convertit în {el}')
            if el == 'N' and RE_SUBFORMA.search(ctx) and not RE_TOTAL.search(ctx):
                # formele de azot (amoniacal, nitric, ureic, organic) fac parte din azotul total;
                # păstrăm prima doar ca rezervă, dacă produsul nu are deloc „azot total”
                sub.setdefault('N', d)
                continue
            if el in nut:
                continue  # prima apariție (de obicei totalul)
            nut[el] = d
    if 'N' not in nut and 'N' in sub:
        nut['N'] = sub['N']
        motive.append('N luat dintr-o formă de azot (fără azot total)')
    return nut, motive


def forma(text, cat):
    t = text.lower()
    for k, v in (('suspensie', 'suspensie'), ('lichid', 'lichid'), ('soluţie', 'lichid'), ('soluție', 'lichid'),
                 ('pulbere', 'pulbere'), ('granul', 'granule'), ('cristal', 'cristale'), ('gel', 'gel'),
                 ('pastă', 'pastă'), ('tablet', 'tablete'), ('solid', 'solid')):
        if k in t:
            return v
    return 'lichid' if cat in (7, 8) else None


def repara_indici(txt):
    """rândurile unde indicii au rămas separați: „30% P O 2 5 (…”, „(52,0 % P O ; 34,0% K O) 2 5 2”"""
    out = []
    for l in txt.split('\n'):
        if re.search(r'\bP O\b|\bK O\b', l):
            l = re.sub(r'\bP O\b', 'P2O5', l)
            l = re.sub(r'\bK O\b', 'K2O', l)
            l = re.sub(r'(?<=P2O5)\s+2\s+5\b', '', l)
            l = re.sub(r'(?<=K2O)\s+2\b', '', l)
            l = re.sub(r'\)\s+(?:\d\s+){0,3}\d\s*$', ')', l)
        out.append(l)
    return '\n'.join(out)


def proceseaza(r):
    txt = repara_indici(r['compozitie_text'])
    linii = [l.strip() for l in txt.split('\n') if l.strip()]
    den = linii[0] if linii else ''
    nut, motive = compozitie(txt)
    # NPK din denumire, ex. „NPK 15-15-15”, „Folplant-411 (180-35-40)” — doar dacă nu e în compoziție
    if not any(k in nut for k in ('N', 'P2O5', 'K2O')):
        tr = list(RE_DIN_DENUMIRE.finditer(den))
        # „Fertililly 3-2-1 (121,8-94-45,6 g/l)”: tripletul urmat de g/l e cel cu cantitățile reale
        cu_gl = [t for t in tr if re.match(r'\s*g/l', den[t.end():], re.I)]
        m = cu_gl[0] if cu_gl else (tr[0] if tr else None)
        if m and r['categorie_nr'] in (4, 7, 8, 9):
            u = 'g/l' if cu_gl or 'g/l' in den.lower() else '%'
            for k, g in zip(('N', 'P2O5', 'K2O'), m.groups()):
                if nr(g) > 0:
                    nut[k] = {'v': nr(g), 'u': u}
            motive.append('NPK luat din denumire')
    npk = {k: nut[k] for k in ('N', 'P2O5', 'K2O') if k in nut}
    unit = sorted({v['u'] for v in npk.values()})
    if len(unit) > 1:
        motive.append('unități diferite la N/P/K: ' + ', '.join(unit))
    if r['categorie_nr'] in (1, 2, 3, 4, 7, 8) and not npk:
        motive.append('fără N/P/K găsit în compoziție')
    if any('max' in v for v in nut.values()):
        motive.append('interval de valori (se păstrează minimul)')
    if not r['nr_madr']:
        motive.append('fără nr. crt. în listă')
    if len(den) > 90:
        motive.append('denumire lungă (posibil lipită de compoziție)')
    obs = r['observatii']
    allt = ' '.join([r['autorizatie'], r['beneficiar'], obs]).lower()
    date = re.findall(r'\b(\d{2})\.(\d{2})\.(20\d{2}|19\d{2})\b', obs)
    data = f'{date[-1][2]}-{date[-1][1]}-{date[-1][0]}' if date else None
    m = re.search(r'\b(19|20)?(\d{2})\b\s*$', r['autorizatie'] or '')
    tip = 'exceptat' if 'exceptat' in r['beneficiar'].lower() else ('provizoriu' if 'provizori' in allt and 'definitiv' not in obs.lower() else ('definitiv' if 'definitiv' in allt else None))
    cult = None
    mc = re.search(r'Culturi\s*:\s*(.+)', txt, re.S)
    if mc:
        cult = [c.strip(' .;') for c in re.split(r',|;', ' '.join(mc.group(1).split())) if c.strip(' .;')]
    return {
        'nr_madr': r['nr_madr'], 'categorie_nr': r['categorie_nr'], 'categorie': CATEGORII.get(r['categorie_nr']),
        'denumire': den, 'compozitie_text': txt,
        'n': npk.get('N', {}).get('v'), 'p2o5': npk.get('P2O5', {}).get('v'), 'k2o': npk.get('K2O', {}).get('v'),
        'unitate_npk': unit[0] if len(unit) == 1 else (None if not unit else 'mixt'),
        'nutrienti': nut, 'forma': forma(txt, r['categorie_nr']), 'culturi': cult,
        'autorizatie': r['autorizatie'] or None, 'beneficiar': r['beneficiar'] or None, 'observatii': obs or None,
        'tip_autorizare': tip, 'data_autorizare': data,
        'productie_oprita': bool(re.search(r'(^|[^*])\*(?!\*)', obs or '')),
        'anulata': 'anulat' in allt,
        'de_verificat': bool(motive), 'motive_verificare': motive, 'pagina': r['pagina'], 'sursa': SURSA,
    }


def main():
    pdf = glob.glob(os.path.join(AICI, '*.pdf'))
    if not pdf:
        sys.exit('PDF-ul MADR lipsește din ' + AICI)
    recs = [proceseaza(r) for r in inregistrari(randuri(pdf[0]))]
    os.makedirs(os.path.join(AICI, 'out'), exist_ok=True)
    with open(os.path.join(AICI, 'out', 'fertilizanti.json'), 'w', encoding='utf-8') as f:
        json.dump(recs, f, ensure_ascii=False, indent=1)
    cols = ['nr_madr', 'categorie', 'denumire', 'n', 'p2o5', 'k2o', 'unitate_npk', 'forma', 'tip_autorizare',
            'data_autorizare', 'productie_oprita', 'de_verificat', 'motive_verificare', 'beneficiar', 'pagina', 'compozitie_text']
    with open(os.path.join(AICI, 'out', 'fertilizanti.csv'), 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f)
        w.writerow(cols)
        for r in recs:
            w.writerow(['; '.join(r[c]) if isinstance(r[c], list) else r[c] for c in cols])
    print(len(recs), 'produse;', sum(r['de_verificat'] for r in recs), 'de verificat')


if __name__ == '__main__':
    main()
