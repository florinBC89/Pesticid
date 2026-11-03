#!/usr/bin/env python3
"""
Parsează „Lista_pesticide-03.10.2026.xlsx” (export ANF) în fișiere SQL de staging.

Intrare : lista.xlsx (o foaie, 11 coloane: Denumire pesticid, Grupa toxicitate, Tip, Data expirare contract,
          Cultura, Agentdaun, NumeRO, Doza, Pauză, Nr.tratamente, data primei omologări)
Ieșire  : out/00_staging_schema.sql      — tabelele import_anf_*
          out/10_produse.sql             — produse (nume canonic, nume secundare, tip, tox, expirare)
          out/20_culturi.sql             — culturi canonice noi (slug, nume, categorie, părinte)
          out/30_tinte.sql               — ținte (slug, nume, tip, nume științific) + harta „șir brut → ținte”
          out/40_recomandari_XX.sql      — câte un rând per produs × cultură canonică × șir brut de ținte
          out/50_produse_fara_omologari.sql — produsele fără nicio omologare (doar în import_raw)
          out/raport.md                  — ce s-a mapat automat, ce rămâne de verificat

Rulare: python3 parse_lista.py lista.xlsx
Transformarea finală în produse/culturi/tinte/recomandari e în ../../migrations/20261030_09_import_anf.sql.
"""
import json, re, sys, unicodedata, zipfile, io
from collections import OrderedDict, Counter
from pathlib import Path
import pandas as pd

AZI = pd.Timestamp('2026-10-30')
SURSA = 'ANF lista 03.10.2026'
OUT = Path(__file__).parent / 'out'
OUT.mkdir(exist_ok=True)

# ---------------------------------------------------------------- utilitare
def repara_xlsx(src: Path) -> io.BytesIO:
    """Fișierul are valori invalide pentru <family> în styles.xml; openpyxl refuză să-l deschidă."""
    buf = io.BytesIO()
    with zipfile.ZipFile(src) as zi, zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zo:
        for it in zi.infolist():
            data = zi.read(it.filename)
            if it.filename == 'xl/styles.xml':
                data = re.sub(rb'<family val="(\d+)"/>', lambda m: b'<family val="2"/>' if int(m.group(1)) > 14 else m.group(0), data)
            zo.writestr(it, data)
    buf.seek(0)
    return buf

def norm(s) -> str:
    if s is None or (isinstance(s, float) and pd.isna(s)): return ''
    s = unicodedata.normalize('NFKD', str(s)).encode('ascii', 'ignore').decode()
    s = s.replace('`', '').replace('~', '').replace('^', '').replace('\xa0', ' ')
    s = re.sub(r'\s+', ' ', s).strip().lower()
    return s

def slugify(s) -> str:
    return re.sub(r'-+', '-', re.sub(r'[^a-z0-9]+', '-', norm(s))).strip('-')

def cap(s: str) -> str:
    s = s.strip()
    return s[:1].upper() + s[1:] if s else s

def q(v) -> str:
    """literal SQL"""
    if v is None or (isinstance(v, float) and pd.isna(v)): return 'null'
    if isinstance(v, bool): return 'true' if v else 'false'
    if isinstance(v, (int, float)): return repr(v)
    if isinstance(v, pd.Timestamp): return f"'{v.date().isoformat()}'"
    if isinstance(v, (list, tuple)):
        return 'array[' + ','.join(q(x) for x in v) + ']::text[]' if v else "'{}'::text[]"
    if isinstance(v, dict): return "'" + json.dumps(v, ensure_ascii=False).replace("'", "''") + "'::jsonb"
    return "'" + str(v).replace('\\', '\\\\').replace("'", "''") + "'"

def split_top(s: str, seps=(',', ';')) -> list:
    """împarte la virgulă/punct-virgulă, dar nu în interiorul parantezelor"""
    out, buf, depth = [], '', 0
    for ch in s:
        if ch == '(': depth += 1
        elif ch == ')': depth = max(0, depth - 1)
        if ch in seps and depth == 0:
            out.append(buf); buf = ''
        else:
            buf += ch
    out.append(buf)
    return [x.strip(' .') for x in out if x.strip(' .')]

# ---------------------------------------------------------------- produse
RE_MARKER = re.compile(r'-?\s*a\s*doua\s+d\w*(\s+\w*o?m?e?r?cial\w*)?\s*[)0eE]*\s*$', re.I)

def parse_produs(nume: str):
    """„X / (Y - A DOUA DENUMIRE COMERCIALA)” (cu toate typo-urile din registru) -> („X”, [„Y”])"""
    s = re.sub(r'\s+', ' ', str(nume)).strip()
    s_ascii = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()
    m = RE_MARKER.search(s_ascii)
    if not m or len(s_ascii) != len(s):
        m = RE_MARKER.search(s)
    if not m:
        return s.upper(), []
    head = s[:m.start()].rstrip(' -(')
    parts = [x.strip(' )(') for x in re.split(r'\s*[/(]\s*', head) if x.strip(' )(')]
    if not parts:
        return s.upper(), []
    canonic = parts[0].upper()
    sec = []
    for x in parts[1:]:
        for y in re.split(r',\s+(?=[A-Za-z])', x):
            y = y.strip().upper()
            if y and y != canonic and y not in sec: sec.append(y)
    return canonic, sec

TIP_MAP = [
    (r'fungicid', 'Fungicid'), (r'erbicid', 'Erbicid'), (r'insecticid', 'Insecticid'), (r'acar', 'Acaricid'),
    (r'regulator', 'Regulator de crestere'), (r'nematocid', 'Nematocid'), (r'rodenticid|moluscocid|repelent', 'Rodenticid/Moluscocid'),
]
def parse_tip(t) -> str | None:
    n = norm(t)
    if not n: return None
    for rx, v in TIP_MAP:
        if re.search(rx, n): return v
    return 'Altul'

# ---------------------------------------------------------------- culturi
# (regex pe text normalizat) -> (slug, nume canonic, categorie, slug părinte)
REGULI_CULTURI = [
    (r'depozit|^seminte de cereale|^cereale depozitate|^produse depozitate|^produse obtinute|^spatii de stocare|^silozuri|^magazii|^moara|^mori|^malt|^seminte presate|^fumigare|^fructe uscate|^spatii (goale|de depozitare)', ('spatii-de-depozitare', 'Spații de depozitare (cereale și semințe depozitate)', 'altele', None)),
    (r'^alac', ('grau', 'Grâu', 'cereale', 'cereale-paioase')),
    (r'^amestec cereale', ('cereale-paioase', 'Cereale păioase', 'cereale', None)),
    (r'^amestec trifoi', ('trifoi', 'Trifoi', 'furajere', None)),
    (r'^grau (de )?toamna', ('grau-de-toamna', 'Grâu de toamnă', 'cereale', 'grau')),
    (r'^grau (de )?primavara', ('grau-de-primavara', 'Grâu de primăvară', 'cereale', 'grau')),
    (r'^grau (durum|dur\b)', ('grau-durum', 'Grâu durum', 'cereale', 'grau')),
    (r'^grau', ('grau', 'Grâu', 'cereale', 'cereale-paioase')),
    (r'^orzoaica|^orz (de )?primavara', ('orz-de-primavara', 'Orz de primăvară', 'cereale', 'orz')),
    (r'^orz (de )?toamna', ('orz-de-toamna', 'Orz de toamnă', 'cereale', 'orz')),
    (r'^orz', ('orz', 'Orz', 'cereale', 'cereale-paioase')),
    (r'^ovaz', ('ovaz', 'Ovăz', 'cereale', 'cereale-paioase')),
    (r'^secara', ('secara', 'Secară', 'cereale', 'cereale-paioase')),
    (r'^triticale', ('triticale', 'Triticale', 'cereale', 'cereale-paioase')),
    (r'^cereale|^paioase', ('cereale-paioase', 'Cereale păioase', 'cereale', None)),
    (r'^porumb (zaharat|dulce)', ('porumb-zaharat', 'Porumb zaharat', 'legume', 'porumb')),
    (r'^porumb', ('porumb', 'Porumb', 'cereale', None)),
    (r'^sorg', ('sorg', 'Sorg', 'cereale', None)),
    (r'^orez', ('orez', 'Orez', 'cereale', None)),
    (r'^mei\b', ('mei', 'Mei', 'cereale', None)),
    (r'^hrisca', ('hrisca', 'Hrișcă', 'cereale', None)),
    (r'^floarea', ('floarea-soarelui', 'Floarea-soarelui', 'oleaginoase', None)),
    (r'^rapita', ('rapita', 'Rapiță', 'oleaginoase', None)),
    (r'^soia', ('soia', 'Soia', 'leguminoase', None)),
    (r'^mustar', ('mustar', 'Muștar', 'oleaginoase', None)),
    (r'^in\b|^in (pentru|de) ', ('in', 'In', 'plante_tehnice', None)),
    (r'^canepa', ('canepa', 'Cânepă', 'plante_tehnice', None)),
    (r'^mac\b', ('mac', 'Mac', 'oleaginoase', None)),
    (r'^mazare', ('mazare', 'Mazăre', 'leguminoase', None)),
    (r'^fasole|^pastai', ('fasole', 'Fasole', 'leguminoase', None)),
    (r'^lupin', ('lupin', 'Lupin', 'leguminoase', None)),
    (r'^latir|^mazariche|^ghizdei|^sparceta', ('leguminoase-furajere', 'Leguminoase furajere (măzăriche, ghizdei, sparcetă)', 'furajere', None)),
    (r'^leguminoase', ('leguminoase', 'Leguminoase (generic)', 'leguminoase', None)),
    (r'^oleaginoase|^crucifere oleaginoase|^plante oleaginoase|^camelina|^sofranel|^susan|^ricin|^limba mielului', ('plante-oleaginoase', 'Plante oleaginoase (generic)', 'oleaginoase', None)),
    (r'^linte', ('linte', 'Linte', 'leguminoase', None)),
    (r'^naut', ('naut', 'Năut', 'leguminoase', None)),
    (r'^bob\b', ('bob', 'Bob', 'leguminoase', None)),
    (r'^lucerna', ('lucerna', 'Lucernă', 'furajere', None)),
    (r'^trifoi', ('trifoi', 'Trifoi', 'furajere', None)),
    (r'^pajist|^pasun|^fanet|^gazon|^iarba|^ierburi|^graminee|^peluze|^nutret|^fan\b', ('pajisti', 'Pajiști', 'furajere', None)),
    (r'^brocoli', ('broccoli', 'Broccoli', 'legume', None)),
    (r'^castarvet', ('castraveti', 'Castraveți', 'legume', None)),
    (r'^zucchini|^patison', ('dovlecel', 'Dovlecel / dovleac', 'legume', None)),
    (r'^pepeni|^pepene', ('pepene', 'Pepene', 'legume', None)),
    (r'^nap\b|^napi|^nap |^rutabaga', ('nap', 'Nap', 'legume', None)),
    (r'^hasma|^arpagic|^chives', ('ceapa', 'Ceapă', 'legume', None)),
    (r'^varzoase|^frunze de varzoase', ('varza', 'Varză', 'legume', None)),
    (r'^andive|^cicoare|^scarol|^rucola|^fetica|^macris|^grasita|^iceberg|^romana|^creson|^alte tipuri de salata|^alte semanatoare|^papadie|^patlagina|^nalba', ('salata', 'Salată', 'legume', None)),
    (r'^cucurbitacee', ('cucurbitacee', 'Cucurbitacee (generic)', 'legume', None)),
    (r'^solanacee', ('legume', 'Legume (generic)', 'legume', None)),
    (r'^radacinoase', ('radacinoase', 'Rădăcinoase (generic)', 'radacinoase', None)),
    (r'^topinambur|^barba caprei|^salsific|^scorz?t?onera|^cardon|^rubarba|^fenicul|^germeni', ('legume', 'Legume (generic)', 'legume', None)),
    (r'^kiwi|^citrice|^maslin|^dud\b|^soc\b|^maces|^merisor|^merisoare|^loganberry|^portocal|^lamai|^mandarin|^grepfrut|^lime|^banane|^cafea|^ceai|^mosmon|^fructe de padure|^fructe nucifere|^mar paduret|^pepino', ('fructe-diverse', 'Alte fructe (arbuști fructiferi, citrice, exotice)', 'pomi', None)),
    (r'^pere', ('par', 'Păr', 'pomi', None)),
    (r'^angelica|^asmatui|^chimen|^chimion|^dafin|^isop|^leustean|^maghiran|^melisa|^musetel|^oregano|^roinita|^rozmarin|^salvie|^sunatoare|^tarhon|^valeriana|^galbenele|^calendula|^hasmatuchi|^sofran|^condimente|^ghimbir|^gentiana|^nicotiana|^datura', ('plante-aromatice', 'Plante aromatice și medicinale', 'altele', None)),
    (r'^arbur?sti|^crini|^lalele|^narcise|^irisi|^zambile|^gerbera|^petuni|^chrysanthem|^crizantem|^strelitia|^violeta|^garoaf|^cale\b|^tuberculi de gerbera|^alte plante bulboase|^specii ornamentale', ('plante-ornamentale', 'Plante ornamentale', 'altele', None)),
    (r'^paduri|^foioase|^douglas|^pin\b|^plop|^salcie|^zada|^silvicultur|^rachitarii|^rahitarii|^culturi forestiere|^plantatii de arbor|^plante lemnoase|^desisuri|^zone cu plante lemnoase|^drumuri cu vegetatie|^locuri cu vegetatie|^culturi energetice|^conifere|^molid|^brad', ('silvicultura', 'Silvicultură și plantații lemnoase', 'altele', None)),
    (r'^campii|^campuri|^suprafete dezafectate|^terenuri|^zone\b|^poteci|^terasamente|^canale|^foste terenuri|^controlul populatiei|^cotrolul|^vegetatie de agrement|^teren\b', ('terenuri-necultivate', 'Terenuri necultivate', 'teren', None)),
    (r'^culturi (legumicole|minore|semincere|de camp|agricole)', ('toate-culturile-presemanat', 'Toate culturile (înainte de semănat / plantat)', 'teren', None)),
    (r'^sfecla (de )?zahar|^sfecla$|^sfecla de zahar', ('sfecla-de-zahar', 'Sfeclă de zahăr', 'radacinoase', None)),
    (r'^sfecla furaj', ('sfecla-furajera', 'Sfeclă furajeră', 'furajere', None)),
    (r'^sfecla rosie', ('sfecla-rosie', 'Sfeclă roșie', 'legume', None)),
    (r'^sfecla (pentru )?frunze|^sfecla elvetian|^mangold', ('sfecla-de-frunze', 'Sfeclă de frunze (mangold)', 'legume', None)),
    (r'^cartof dulce', ('cartof-dulce', 'Cartof dulce', 'radacinoase', None)),
    (r'^cartof', ('cartof', 'Cartof', 'radacinoase', None)),
    (r'^vita de vie|^vie\b|^vita-de-vie|^struguri', ('vita-de-vie', 'Viță de vie', 'vita_de_vie', None)),
    (r'^mar\b(?! paduret)|^mar$|^meri\b', ('mar', 'Măr', 'pomi', None)),
    (r'^par\b|^peri\b', ('par', 'Păr', 'pomi', None)),
    (r'^gutui', ('gutui', 'Gutui', 'pomi', None)),
    (r'^prun', ('prun', 'Prun', 'pomi', None)),
    (r'^cires', ('cires', 'Cireș', 'pomi', None)),
    (r'^visin', ('visin', 'Vișin', 'pomi', None)),
    (r'^piersic|^nectarin', ('piersic', 'Piersic', 'pomi', None)),
    (r'^cais|^zarzar', ('cais', 'Cais', 'pomi', None)),
    (r'^nuc\b', ('nuc', 'Nuc', 'pomi', None)),
    (r'^alun', ('alun', 'Alun', 'pomi', None)),
    (r'^migdal', ('migdal', 'Migdal', 'pomi', None)),
    (r'^castan', ('castan', 'Castan', 'pomi', None)),
    (r'^capsun|^fragi', ('capsun', 'Căpșun', 'pomi', None)),
    (r'^zmeur', ('zmeur', 'Zmeur', 'pomi', None)),
    (r'^mur\b', ('mur', 'Mur', 'pomi', None)),
    (r'^afin', ('afin', 'Afin', 'pomi', None)),
    (r'^coacaz', ('coacaz', 'Coacăz', 'pomi', None)),
    (r'^agris', ('agris', 'Agriș', 'pomi', None)),
    (r'^catina', ('catina', 'Cătină', 'pomi', None)),
    (r'^(pomi|livezi|semintoase|samburoase|pomi fructiferi)', ('pomi-fructiferi', 'Pomi fructiferi', 'pomi', None)),
    (r'^tomate|^rosii', ('tomate', 'Tomate', 'legume', None)),
    (r'^ardei', ('ardei', 'Ardei', 'legume', None)),
    (r'^vinete|^vanat', ('vinete', 'Vinete', 'legume', None)),
    (r'^castravet|^cornison', ('castraveti', 'Castraveți', 'legume', None)),
    (r'^dovlec|^dovleac|^bostan', ('dovlecel', 'Dovlecel / dovleac', 'legume', None)),
    (r'^pepene', ('pepene', 'Pepene', 'legume', None)),
    (r'^varza', ('varza', 'Varză', 'legume', None)),
    (r'^conopida', ('conopida', 'Conopidă', 'legume', None)),
    (r'^broccoli', ('broccoli', 'Broccoli', 'legume', None)),
    (r'^gulii|^gulie', ('gulii', 'Gulii', 'legume', None)),
    (r'^ridich', ('ridichi', 'Ridichi', 'legume', None)),
    (r'^ceapa', ('ceapa', 'Ceapă', 'legume', None)),
    (r'^usturoi', ('usturoi', 'Usturoi', 'legume', None)),
    (r'^praz', ('praz', 'Praz', 'legume', None)),
    (r'^morcov', ('morcov', 'Morcov', 'legume', None)),
    (r'^patrunjel', ('patrunjel', 'Pătrunjel', 'legume', None)),
    (r'^pastarnac', ('pastarnac', 'Păstârnac', 'legume', None)),
    (r'^telina', ('telina', 'Țelină', 'legume', None)),
    (r'^salata|^laptuc', ('salata', 'Salată', 'legume', None)),
    (r'^spanac', ('spanac', 'Spanac', 'legume', None)),
    (r'^hrean', ('hrean', 'Hrean', 'legume', None)),
    (r'^sparanghel', ('sparanghel', 'Sparanghel', 'legume', None)),
    (r'^anghinare', ('anghinare', 'Anghinare', 'legume', None)),
    (r'^ciuperci', ('ciuperci', 'Ciuperci', 'legume', None)),
    (r'^legume', ('legume', 'Legume (generic)', 'legume', None)),
    (r'^tutun', ('tutun', 'Tutun', 'plante_tehnice', None)),
    (r'^hamei', ('hamei', 'Hamei', 'plante_tehnice', None)),
    (r'^bumbac', ('bumbac', 'Bumbac', 'plante_tehnice', None)),
    (r'^plante (ornamentale|decorative)|^flori|^ornamental|^arbori|^arbusti|^trandafir|^brazi|^conifere|^garoaf|^crizantem', ('plante-ornamentale', 'Plante ornamentale', 'altele', None)),
    (r'^plante (aromatice|medicinale)|^busuioc|^menta|^cimbru|^coriandru|^marar|^lavanda', ('plante-aromatice', 'Plante aromatice și medicinale', 'altele', None)),
    (r'^pepinier|^rasad|^paturi germinative', ('pepiniere', 'Pepiniere și răsaduri', 'altele', None)),
    (r'depozit|^seminte de cereale|^cereale depozitate|^produse depozitate|^spatii de stocare|^silozuri|^magazii|^moara|^mori', ('spatii-de-depozitare', 'Spații de depozitare (cereale și semințe depozitate)', 'altele', None)),
    (r'^teren(uri)? (in absenta|necultiv|neagric|neutiliz|fara destinatie|industrial|cultivate si necultivate)|^mirist|^cai ferate|^margini|^terenuri necultivate|^zone necultivate|^limite', ('terenuri-necultivate', 'Terenuri necultivate', 'teren', None)),
    (r'^toate culturile|^culturi agricole|^terenuri cultivate|^inainte de|^preplantare|^pre-?semanat|^dupa recoltare|^intre randuri', ('toate-culturile-presemanat', 'Toate culturile (înainte de semănat / plantat)', 'teren', None)),
    (r'^sere\b|^solarii|^spatii protejate$', ('spatii-protejate', 'Spații protejate (sere, solarii) — generic', 'legume', None)),
    (r'^sol\b|^substrat', ('sol-substrat', 'Sol / substrat (dezinfecție)', 'teren', None)),
]
JUNK_CULTURA = re.compile(r'^(de |cu |la |si |pentru|prin |exceptia|definitie|mrl$|toamna$|primavara$|albe$|verde$|creata$|extensive$|tulpini$|orientale$|frunze$|etc|protejate|inflorescenta|ex\. |picurare|umectare|destinate|permanente|numai |dupa |pastai$|romana$|iceberg$|culturi de$|frunze de sfecla|salata, alte|cicoarei|cu exceptia|seminceri$|nespecificat)')
GRUP = re.compile(r'^(cereale|legume|culturi|plante|pomi|livezi|semintoase|samburoase|radacinoase|tratamente la sol|teren|diverse culturi|fructe|arbori|legume in camp|legume in spatii protejate|culturi semincere|plante oleaginoase|cereale depozitate|seminte de cereale|culturi care|salata)')

def cultura_simpla(piesa: str, nota: list):
    t = norm(piesa).replace('*', '')
    t = t.replace('(', ' (') if t.count('(') > t.count(')') else t
    if t.count('(') > t.count(')'): t += ')'
    if t.count(')') > t.count('('): t = t.replace(')', ' ')
    t = re.sub(r'\s+', ' ', t).strip(' -,.:')
    if len(t) < 3 or JUNK_CULTURA.match(t): return None
    t0 = t
    # elimină parantezele (câmp / seră / hibrizi / tratament sămânță), dar reține nota
    par = re.findall(r'\(([^)]*)\)', t)
    for p in par:
        if 'samanta' in p or 'seminte' in p: nota.append('tratament_samanta')
        elif 'sera' in p or 'solar' in p or 'protejat' in p: nota.append('spatii_protejate')
        elif 'camp' in p: nota.append('camp')
        elif 'clearfield' in p or 'hibrizi' in p or 'rezistent' in p or 'imazamox' in p or 'tribenuron' in p: nota.append('hibrizi:' + p)
        else: nota.append(p)
    t = re.sub(r'\([^)]*\)', ' ', t)
    t = re.sub(r'\b(pe rod|camp|sera|sere|solarii|solar|spatii protejate|in camp|in sere|si solarii|transplantat[ae]?|semanat[ae]?|de consum|pentru boabe|pentru siloz|furajer|pentru ulei|pentru samanta|pentru seminte|pentru producere de samanta|boabe|siloz|exceptie .*)\b', ' ', t)
    t = re.sub(r'\s+', ' ', t).strip(' -,')
    if 'tratament samanta' in t or 'tratament la samanta' in t:
        nota.append('tratament_samanta'); t = t.replace('tratament la samanta', '').replace('tratament samanta', '').strip()
    if not t or len(t) < 3 or JUNK_CULTURA.match(t): return None
    for rx, defn in REGULI_CULTURI:
        if re.search(rx, t): return defn
    # necunoscută: canonic nou după numele curățat
    base = re.sub(r'\b(de toamna|de primavara|toamna|primavara)\b', '', t).strip(' -,')
    if not base: base = t
    if len(base) > 45:  # text lung fără regulă → nu inventăm o cultură
        nota.append('cultura_lunga:' + base[:60])
        return ('cultura-nespecificata', 'Cultură nespecificată (vezi textul brut)', 'altele', None)
    return (slugify(base), cap(base), 'altele', None)

def parse_cultura(raw: str):
    """-> listă de (slug, nume, categorie, parinte_slug), note"""
    nota = []
    t = norm(raw).replace('*', '')
    if t.count('(') > t.count(')'): t += ')'
    out = []
    pieces = None
    inner = re.search(r'\(([^()]*)\)', t)
    if GRUP.match(t) and inner and (',' in inner.group(1) or ' si ' in inner.group(1)):
        pieces = [p for p in re.split(r',|\bsi\b', inner.group(1)) if p.strip()]
        nota.append('grup:' + t[:60])
    elif GRUP.match(t) and ':' in t:  # "Teren in absenta culturii ... : capsuni, legume, ..."
        head, tail = t.split(':', 1)
        pieces = [p for p in re.split(r',|\bsi\b', tail) if p.strip()]
        nota.append('grup:' + head[:60])
    elif (',' in t or re.search(r'\bsi\b', t)) and not GRUP.match(t) and len(t) < 120 and not re.search(r'de toamna si (de )?primavara|toamna si primavara|vin si de masa|vin/masa|mono', t):
        pieces = [p for p in re.split(r',|\bsi\b', re.sub(r'\([^)]*\)', '', t)) if p.strip()]
    if pieces is None:
        pieces = [t]
    for p in pieces:
        d = cultura_simpla(p, nota)
        if d and d not in out: out.append(d)
    if not out:
        out = [('cultura-nespecificata', 'Cultură nespecificată (vezi textul brut)', 'altele', None)]
    return out, nota

# ---------------------------------------------------------------- ținte
REGULI_TINTE = [  # (regex pe text normalizat) -> slug existent / nou
    (r'paduch.*cenusiu|brevicoryne', ('paduchele-cenusiu', 'Păduchele cenușiu al verzei', 'daunator', 'Brevicoryne brassicae')),
    (r'paduch.*(san jose|san hose|testos|lanos|tepos)|quadraspidiotus|diaspidiotus|eriosoma|pseudaulacaspis|psedoaulacaspis', ('paduchele-din-san-jose', 'Păduchele din San José / păduchi țestoși', 'daunator', 'Diaspidiotus perniciosus')),
    (r'\bafid|paduch|aphis|myzus|sitobion|rhopalosiphum|dysaphis|aphidid', ('afide', 'Afide (păduchi de frunze)', 'daunator', 'Aphididae')),
    (r'plosnit.*cereal|eurygaster|aelia', ('plosnita-cerealelor', 'Ploșnița cerealelor', 'daunator', 'Eurygaster spp.')),
    (r'gandac.*balos|oulema|lema melanop', ('gandacul-balos', 'Gândacul bălos al ovăzului', 'daunator', 'Oulema melanopus')),
    (r'musc.*(cereal|suedez|neagra a graului)|oscinella|\bphorbia', ('musca-cerealelor', 'Musca cerealelor / musca suedeză', 'daunator', 'Oscinella frit')),
    (r'vierme.*rosu.*pai|haplodiplosis', ('viermele-rosu-al-paiului', 'Viermele roșu al paiului', 'daunator', 'Haplodiplosis marginata')),
    (r'trips|trps|thrips|thysanoptera|frankliniella', ('tripsi', 'Tripși', 'daunator', 'Thysanoptera')),
    (r'gandac.*lucios|meligethes|brassicogethes', ('gandacul-lucios', 'Gândacul lucios al rapiței', 'daunator', 'Brassicogethes aeneus')),
    (r'gargarit.*(tulpin|rapit|silicv)|ceutorhynchus', ('gargarita-tulpinilor', 'Gărgărița tulpinilor de rapiță', 'daunator', 'Ceutorhynchus napi')),
    (r'tantar.*silicv|dasineura brassicae', ('tantarul-silicvelor', 'Țânțarul silicvelor', 'daunator', 'Dasineura brassicae')),
    (r'puric|phyllotreta|psylliodes', ('puricii-de-pamant', 'Puricii de pământ / cruciferelor', 'daunator', 'Phyllotreta spp.')),
    (r'viesp.*rapit|athalia', ('viespea-rapitei', 'Viespea rapiței', 'daunator', 'Athalia rosae')),
    (r'sfredelitor.*porumb|ostrinia', ('sfredelitorul-porumbului', 'Sfredelitorul porumbului', 'daunator', 'Ostrinia nubilalis')),
    (r'diabrotica|vierme.*vestic', ('viermele-vestic', 'Viermele vestic al rădăcinilor', 'daunator', 'Diabrotica virgifera')),
    (r'carabus.* de mai|melolontha', ('carabusul-de-mai', 'Cărăbușul de mai', 'daunator', 'Melolontha melolontha')),
    (r'puricele melifer|cacopsylla|psylla\b', ('puricele-melifer', 'Puricele melifer al părului / mărului', 'daunator', 'Cacopsylla spp.')),
    (r'helicoverpa|heliothis|omida (fructific|capsul|fructelor)', ('omida-fructificatiilor', 'Omida fructificațiilor', 'daunator', 'Helicoverpa armigera')),
    (r'ratisoar|tanymecus', ('ratisoara', 'Rățișoara porumbului', 'daunator', 'Tanymecus dilaticollis')),
    (r'sitona|gargarit.*(mazar|frunz)', ('gargarita-mazarii', 'Gărgărița frunzelor de mazăre', 'daunator', 'Sitona lineatus')),
    (r'cydia nigricana|moli.*pastai', ('molia-pastailor', 'Molia păstăilor de mazăre', 'daunator', 'Cydia nigricana')),
    (r'pieris|mamestra|buha verzei|fluture.*alb.*verz|omida verzei', ('omizi-crucifere', 'Fluturele alb al verzei / buha verzei', 'daunator', 'Pieris brassicae, Mamestra brassicae')),
    (r'tantar.*(flor|mazar)|contarinia pisi', ('tantarul-florilor-de-mazare', 'Țânțarul florilor de mazăre (musculița galicolă)', 'daunator', 'Contarinia pisi')),
    (r'vierme.*(mer|marului|fructelor)|cydia pomonella|carpocapsa|laspeyresia pomonella', ('viermele-merelor', 'Viermele merelor', 'daunator', 'Cydia pomonella')),
    (r'vierme.*prun|cydia funebrana|grapholita funebrana', ('viermele-prunelor', 'Viermele prunelor', 'daunator', 'Grapholita funebrana')),
    (r'molia strugur|molia vitei|lobesia|eudemis|eupoecilia|cochilis', ('molia-strugurilor', 'Molia strugurilor', 'daunator', 'Lobesia botrana')),
    (r'gandac.*colorado|leptinotarsa', ('gandacul-din-colorado', 'Gândacul din Colorado', 'daunator', 'Leptinotarsa decemlineata')),
    (r'musca (alba|de sera)|aleurod|trialeurodes|bemisia', ('musculita-alba', 'Musculița albă de seră', 'daunator', 'Trialeurodes vaporariorum')),
    (r'acarien|paianjen|tetranychus|panonychus|eriophy|aculus|eotetranychus', ('acarieni', 'Acarieni (păianjeni)', 'daunator', 'Tetranychidae, Eriophyidae')),
    (r'nematod|meloidogyne|heterodera|globodera|ditylenchus', ('nematozi', 'Nematozi', 'daunator', 'Nematoda')),
    (r'limac|melc|limax|deroceras|arion', ('limacsi', 'Limacși și melci', 'daunator', 'Gastropoda')),
    (r'soarec|sobolan|rozator|harciog|popandau|cartita|microtus|mus musculus|rattus', ('rozatoare', 'Rozătoare (șoareci, șobolani)', 'daunator', 'Rodentia')),
    (r'viermi sarma|agriotes|viermi de sarma|viermele sarma', ('viermi-sarma', 'Viermi sârmă', 'daunator', 'Agriotes spp.')),
    (r'buha (semanatur|verzei)|agrotis|noctuid', ('buha-semanaturilor', 'Buha semănăturilor (omizi de sol)', 'daunator', 'Agrotis segetum')),
    (r'carabus(?!ul de mai)(?! de mai)|gandac.*ghebos|zabrus', ('gandacul-ghebos', 'Gândacul ghebos al cerealelor', 'daunator', 'Zabrus tenebrioides')),
    (r'molia (fainii|cerealelor|grau|hambar)|gargarit.*(grau|orez|hambar)|sitophilus|tribolium|plodia|ephestia|rhyzopertha|oryzaephilus|gandacel|daunatori de depozit|insecte de depozit|daunatorii produselor depozitate', ('daunatori-de-depozit', 'Dăunători de depozit (gărgărițe, molii, gândăcei)', 'daunator', 'Sitophilus, Tribolium, Plodia, Ephestia')),
    (r'septori|zymoseptoria|mycosphaerella graminicola|stagonospora|parastagonospora', ('septorioza', 'Septorioză', 'boala', 'Zymoseptoria tritici')),
    (r'rugina brun|puccinia (triticina|recondita|hordei)', ('rugina-bruna', 'Rugina brună', 'boala', 'Puccinia triticina')),
    (r'rugina galben|striiformis', ('rugina-galbena', 'Rugina galbenă', 'boala', 'Puccinia striiformis')),
    (r'\brugin|puccinia|uromyces|phragmidium|cronartium', ('rugina', 'Rugină (generic)', 'boala', 'Puccinia spp.')),
    (r'fainar|blumeria|erysiphe|oidium|uncinula|podosphaera|sphaerotheca|leveillula', ('fainare', 'Făinare', 'boala', 'Blumeria graminis / Erysiphales')),
    (r'fuzario|fusarium|gibberella', ('fuzarioza', 'Fuzarioză', 'boala', 'Fusarium spp.')),
    (r'helmint|bipolaris|drechslera|cochliobolus|exserohilum', ('helmintosporioza', 'Helmintosporioză', 'boala', 'Bipolaris sorokiniana')),
    (r'patarea reticular|pyrenophora teres', ('patarea-reticulara', 'Pătarea reticulară a orzului', 'boala', 'Pyrenophora teres')),
    (r'rhynchosporium|arsura frunzelor', ('arsura-frunzelor-orz', 'Arsura frunzelor de orz', 'boala', 'Rhynchosporium secalis')),
    (r'patarea in ochi|oculimacula|pseudocercosporella|tapesia|cercosporella', ('patarea-in-ochi', 'Pătarea în ochi a bazei tulpinii', 'boala', 'Oculimacula yallundae')),
    (r'taciune|ustilago|urocystis', ('taciune', 'Tăciune', 'boala', 'Ustilago spp.')),
    (r'malur|tilletia', ('malura', 'Mălură', 'boala', 'Tilletia spp.')),
    (r'mucegai.*zapad|nivale', ('mucegai-de-zapada', 'Mucegai de zăpadă', 'boala', 'Microdochium nivale')),
    (r'ramularia', ('ramularia', 'Ramularia', 'boala', 'Ramularia collo-cygni')),
    (r'sclerotinia|putregai.*alb|sclerotioz', ('putregaiul-alb', 'Putregaiul alb', 'boala', 'Sclerotinia sclerotiorum')),
    (r'phoma|fomoz|leptosphaeria|plenodomus|putregai.*negru.*rapit', ('phoma', 'Putregaiul negru al rapiței (fomoză)', 'boala', 'Plenodomus lingam')),
    (r'putregai.*negru|guignardia|black rot', ('putregaiul-negru', 'Putregaiul negru', 'boala', 'Guignardia / Phoma spp.')),
    (r'alternari', ('alternarioza', 'Alternarioză', 'boala', 'Alternaria spp.')),
    (r'mana.*(crucifer|rapit|varz)|peronospora (parasitica|brassicae)|hyaloperonospora', ('mana-cruciferelor', 'Mana cruciferelor', 'boala', 'Hyaloperonospora parasitica')),
    (r'\bmana\b|plasmopara|phytophthora infestans|peronospora|pseudoperonospora|bremia', ('mana', 'Mană', 'boala', 'Oomycetes (Plasmopara, Phytophthora, Peronospora)')),
    (r'botrytis|putregai.*cenus', ('putregaiul-cenusiu', 'Putregaiul cenușiu', 'boala', 'Botrytis cinerea')),
    (r'diaporthe helianthi|phomopsis.*(floar|helianth)|patarea bruna si frang', ('patarea-bruna-floarea-soarelui', 'Pătarea brună și frângerea tulpinilor', 'boala', 'Diaporthe helianthi')),
    (r'antracnoz|ascochyta|colletotrichum|elsinoe', ('antracnoza', 'Antracnoză', 'boala', 'Colletotrichum / Ascochyta spp.')),
    (r'rapan|venturia', ('rapan', 'Rapăn', 'boala', 'Venturia inaequalis')),
    (r'monilio|monilia|monilinia|putregai.*brun', ('monilioza', 'Monilioză (putregaiul brun)', 'boala', 'Monilinia spp.')),
    (r'focul bacterian|erwinia amylovora', ('focul-bacterian', 'Focul bacterian', 'boala', 'Erwinia amylovora')),
    (r'bacterioz|xanthomonas|pseudomonas|clavibacter|bacterian', ('bacterioze', 'Bacterioze', 'boala', 'Xanthomonas, Pseudomonas spp.')),
    (r'cercospor', ('cercosporioza', 'Cercosporioză', 'boala', 'Cercospora spp.')),
    (r'patarea (alba|cafenie|bruna|frunzelor)|cladosporium|stemphylium|didymella|mycosphaerella', ('patarea-frunzelor', 'Pătarea frunzelor', 'boala', 'Cladosporium, Didymella, Stemphylium spp.')),
    (r'rhizoctonia', ('rhizoctonia', 'Rhizoctonia', 'boala', 'Rhizoctonia solani')),
    (r'pythium|caderea plantutelor|inmuierea', ('caderea-plantutelor', 'Căderea plăntuțelor', 'boala', 'Pythium spp.')),
    (r'verticil|fusarium oxysporum|ofilire', ('ofiliri-vasculare', 'Ofiliri vasculare (Verticillium, Fusarium)', 'boala', 'Verticillium, Fusarium oxysporum')),
    (r'putregai', ('putregaiuri', 'Putregaiuri (generic)', 'boala', None)),
    (r'buruieni.*mono.*dicot|mono-? ?si dicot|monocotiledonate si (unele )?dicot|dicotiledonate si monocot|buruieni anuale si perene|buruieni anuale$|^buruieni$', ('buruieni-mono-dicotiledonate', 'Buruieni mono- și dicotiledonate', 'buruiana', None)),
    (r'buruieni dicot|dicotiledonate', ('buruieni-dicotiledonate', 'Buruieni dicotiledonate anuale', 'buruiana', None)),
    (r'buruieni monocot|monocotiledonate|graminee', ('buruieni-monocotiledonate', 'Buruieni monocotiledonate anuale', 'buruiana', None)),
    (r'buruieni peren|perene', ('buruieni-perene', 'Buruieni perene', 'buruiana', None)),
    (r'sorghum halepense|costrei', ('costrei', 'Costrei din rizomi', 'buruiana', 'Sorghum halepense')),
    (r'elymus|agropyron|\bpir(ul)?\b', ('pir', 'Pir târâtor', 'buruiana', 'Elymus repens')),
    (r'samulastr', ('samulastra', 'Samulastră de cereale', 'buruiana', None)),
    (r'cuscut', ('cuscuta', 'Cuscută', 'buruiana', 'Cuscuta spp.')),
    (r'palamid|cirsium', ('palamida', 'Pălămidă', 'buruiana', 'Cirsium arvense')),
    (r'combaterea totala|vegetatie (nedorita|spontana)|buruieni lemnoase|^arbusti|plante lemnoase|lastari (nedoriti|de la baza)', ('vegetatie-lemnoasa-si-totala', 'Combatere totală (buruieni și vegetație lemnoasă)', 'buruiana', None)),
    # --- buruieni: latin ↔ român
    (r'centaurea|albastr', ('albastrita', 'Albăstriță', 'buruiana', 'Centaurea cyanus')),
    (r'capsella|traista', ('traista-ciobanului', 'Traista ciobanului', 'buruiana', 'Capsella bursa-pastoris')),
    (r'matricaria|tripleurospermum|anthemis|romanit|musetel', ('musetel-salbatic', 'Mușețel sălbatic / romaniță', 'buruiana', 'Matricaria, Tripleurospermum, Anthemis spp.')),
    (r'lamium|sugel|urzica moarta', ('sugel', 'Sugel (urzică moartă)', 'buruiana', 'Lamium spp.')),
    (r'gal+ium|turita', ('turita', 'Turiță', 'buruiana', 'Galium aparine')),
    (r'veronica|ventril|soparlita', ('ventrilica', 'Ventrilică (șopârliță)', 'buruiana', 'Veronica spp.')),
    (r'chenopodium|loboda|spanac salbatic|atriplex', ('loboda', 'Lobodă / spanac sălbatic', 'buruiana', 'Chenopodium album, Atriplex spp.')),
    (r'fallopia|polygonum convolvulus|hrisca? urcatoare|hrisac|^hrisca$', ('hrisca-urcatoare', 'Hrișcă urcătoare', 'buruiana', 'Fallopia convolvulus')),
    (r'polygonum aviculare|troscot', ('troscot', 'Troscot', 'buruiana', 'Polygonum aviculare')),
    (r'persicaria|polygonum persicaria|iarba rosie', ('iarba-rosie', 'Iarbă roșie', 'buruiana', 'Persicaria maculosa')),
    (r'papaver|\bmac(ul)?\b', ('macul-rosu', 'Macul roșu de câmp', 'buruiana', 'Papaver rhoeas')),
    (r'stellaria|roco[iv]i?na', ('rocoina', 'Rocoină', 'buruiana', 'Stellaria media')),
    (r'viola|trei frati', ('trei-frati-patati', 'Trei frați pătați', 'buruiana', 'Viola arvensis')),
    (r'amaranth|\bstir\b', ('stir', 'Știr', 'buruiana', 'Amaranthus retroflexus')),
    (r'echinochloa|iarba barboasa', ('iarba-barboasa', 'Iarbă bărboasă', 'buruiana', 'Echinochloa crus-galli')),
    (r'setaria|mohor', ('mohor', 'Mohor', 'buruiana', 'Setaria spp.')),
    (r'digitaria|meisor', ('meisor', 'Meișor', 'buruiana', 'Digitaria sanguinalis')),
    (r'apera|iarba vantului', ('iarba-vantului', 'Iarba vântului', 'buruiana', 'Apera spica-venti')),
    (r'alopecurus|coada vulpii', ('coada-vulpii', 'Coada vulpii', 'buruiana', 'Alopecurus myosuroides')),
    (r'avena (fatua|ludoviciana)|odos|ovaz salbatic', ('odos', 'Odos (ovăz sălbatic)', 'buruiana', 'Avena fatua')),
    (r'lolium|raigras', ('raigras', 'Raigras', 'buruiana', 'Lolium spp.')),
    (r'bromus|obsiga', ('obsiga', 'Obsigă', 'buruiana', 'Bromus spp.')),
    (r'poa annua|firuta', ('firuta', 'Firuță', 'buruiana', 'Poa annua')),
    (r'cynodon|pir gros', ('pir-gros', 'Pir gros', 'buruiana', 'Cynodon dactylon')),
    (r'fumaria|fumarita', ('fumarita', 'Fumăriță', 'buruiana', 'Fumaria officinalis')),
    (r'convolvulus|volbura', ('volbura', 'Volbură', 'buruiana', 'Convolvulus arvensis')),
    (r'solanum nigrum|zarna', ('zarna', 'Zârnă', 'buruiana', 'Solanum nigrum')),
    (r'sinapis|mustar salbatic', ('mustar-salbatic', 'Muștar sălbatic', 'buruiana', 'Sinapis arvensis')),
    (r'raphanus|ridiche salbatica', ('ridiche-salbatica', 'Ridiche sălbatică', 'buruiana', 'Raphanus raphanistrum')),
    (r'sonchus|susai', ('susai', 'Susai', 'buruiana', 'Sonchus spp.')),
    (r'taraxacum|papadi', ('papadie', 'Păpădie', 'buruiana', 'Taraxacum officinale')),
    (r'galeopsis|lungurica|zabrea', ('lungurica', 'Lungurică', 'buruiana', 'Galeopsis tetrahit')),
    (r'thlaspi|pungulita', ('pungulita', 'Punguliță', 'buruiana', 'Thlaspi arvense')),
    (r'descurainia|voinicica', ('voinicica', 'Voinicică', 'buruiana', 'Descurainia sophia')),
    (r'abutilon|teisor', ('teisor', 'Teișor', 'buruiana', 'Abutilon theophrasti')),
    (r'datura|ciumafaie|laur', ('ciumafaie', 'Ciumăfaie (laur)', 'buruiana', 'Datura stramonium')),
    (r'xanthium|cornuti', ('cornuti', 'Cornuți', 'buruiana', 'Xanthium strumarium')),
    (r'myosotis|nu-ma-uita', ('nu-ma-uita', 'Nu-mă-uita', 'buruiana', 'Myosotis arvensis')),
    (r'portulaca|grasita|iarba grasa', ('iarba-grasa', 'Iarbă grasă', 'buruiana', 'Portulaca oleracea')),
    (r'senecio|cruciulita', ('cruciulita', 'Cruciuliță', 'buruiana', 'Senecio vulgaris')),
    (r'erigeron|conyza|batranis', ('batranis', 'Bătrâniș', 'buruiana', 'Erigeron canadensis')),
    (r'urtica (dioica|spp|urens)|\burzic', ('urzica', 'Urzică', 'buruiana', 'Urtica spp.')),
    (r'euphorbia|euforbia|laptele cucului', ('laptele-cucului', 'Laptele cucului', 'buruiana', 'Euphorbia spp.')),
    (r'vicia|mazariche', ('mazariche', 'Măzăriche', 'buruiana', 'Vicia spp.')),
    (r'geranium|pliscul cocorului|ciocul berzei', ('pliscul-cocorului', 'Pliscul cocorului', 'buruiana', 'Geranium spp.')),
    (r'consolida|nemtisor', ('nemtisor', 'Nemțișor de câmp', 'buruiana', 'Consolida regalis')),
    (r'anagall?is|scanteiuta', ('scanteiuta', 'Scânteiuță', 'buruiana', 'Anagallis arvensis')),
    (r'mercurialis|trepadatoare', ('trepadatoare', 'Trepădătoare', 'buruiana', 'Mercurialis annua')),
    (r'ambrosia', ('ambrozie', 'Ambrozie', 'buruiana', 'Ambrosia artemisiifolia')),
    (r'leonurus|talpa gastei', ('talpa-gastei', 'Talpa gâștei', 'buruiana', 'Leonurus cardiaca')),
    (r'hibiscus|zamosita', ('zamosita', 'Zămoșiță', 'buruiana', 'Hibiscus trionum')),
    (r'panicum', ('panicum', 'Mei sălbatic', 'buruiana', 'Panicum spp.')),
    (r'rumex|macris', ('macris-salbatic', 'Măcriș sălbatic (ștevie)', 'buruiana', 'Rumex spp.')),
    (r'muschi|briofite', ('muschi', 'Mușchi', 'buruiana', 'Bryophyta')),
    (r'samulastra|^rapita$|^floarea soarelui$|brassica napus|helianthus|cereale spontane', ('samulastra', 'Samulastră de cereale', 'buruiana', None)),
    # --- dăunători: completări
    (r'acarian|acaran|acarioz|eriofid|tetranych|tertranych|polyphagotarsonemus', ('acarieni', 'Acarieni (păianjeni)', 'daunator', 'Tetranychidae, Eriophyidae')),
    (r'musculita alba|aleurod|trialeurodes|bemisia', ('musculita-alba', 'Musculița albă de seră', 'daunator', 'Trialeurodes vaporariorum')),
    (r'buha|noctua|autographa|spodoptera|peridroma|omizi|omida|larve lepidoptere|microlepidoptere|fluture', ('omizi-defoliatoare', 'Omizi (buhe, noctuide, fluturi)', 'daunator', 'Noctuidae, Lepidoptera')),
    (r'hylemi?y?a|delia|musca (plantulelor|radacinilor|cepei|verzei|sfeclei|morcovului)|chamaepsila', ('muste-ale-radacinilor', 'Muște ale rădăcinilor și plăntuțelor', 'daunator', 'Delia spp., Chamaepsila rosae')),
    (r'minier|minator|liriomyza|phyllonorycter|leucoptera|musca miniera', ('minieri', 'Insecte miniere (molii și muște miniere)', 'daunator', 'Liriomyza, Phyllonorycter spp.')),
    (r'coropisnita|gryllotalpa', ('coropisnita', 'Coropișniță', 'daunator', 'Gryllotalpa gryllotalpa')),
    (r'centipede|scutigerella|blaniulus|miriapod', ('miriapode', 'Miriapode (Scutigerella, Blaniulus)', 'daunator', 'Myriapoda')),
    (r'cicad|scaphoideus|empoasca', ('cicade', 'Cicade', 'daunator', 'Cicadellidae')),
    (r'caprioar|iepur|mistret|vanat|pasari|repelent', ('vanat-si-pasari', 'Vânat și păsări (repelent)', 'daunator', None)),
    (r'cartit', ('rozatoare', 'Rozătoare (șoareci, șobolani)', 'daunator', 'Rodentia')),
    (r'viermi+ sarma|agriotes', ('viermi-sarma', 'Viermi sârmă', 'daunator', 'Agriotes spp.')),
    # --- boli: completări / typo-uri
    (r'fusario', ('fuzarioza', 'Fuzarioză', 'boala', 'Fusarium spp.')),
    (r'helmo?[ni]?[nt]?o?spor', ('helmintosporioza', 'Helmintosporioză', 'boala', 'Bipolaris sorokiniana')),
    (r'rhy[n]?c[h]?osporium', ('arsura-frunzelor-orz', 'Arsura frunzelor de orz', 'boala', 'Rhynchosporium secalis')),
    (r'cer[oc]+spor', ('cercosporioza', 'Cercosporioză', 'boala', 'Cercospora spp.')),
    (r'sphaerot', ('fainare', 'Făinare', 'boala', 'Blumeria graminis / Erysiphales')),
    (r'ri?h?zocton', ('rhizoctonia', 'Rhizoctonia', 'boala', 'Rhizoctonia solani')),
    (r'phytophth?ora|phytophtora', ('mana', 'Mană', 'boala', 'Oomycetes (Plasmopara, Phytophthora, Peronospora)')),
    (r'innegrirea bazei|innegrirea tulpin|phoma betae', ('innegrirea-bazei-tulpinii', 'Înnegrirea bazei tulpinii', 'boala', 'Phoma betae, Pythium spp.')),
    (r'mucegai|micoze', ('mucegaiuri', 'Mucegaiuri (generic)', 'boala', None)),
    (r'pyrenophora tritici', ('patarea-frunzelor', 'Pătarea frunzelor', 'boala', 'Cladosporium, Didymella, Stemphylium spp.')),
    # --- fiziologic
    (r'desicant|desicare|desican|uscarea|defoliere|defoliant', ('desicare', 'Desicare / defoliere', 'fiziologic', None)),
    (r'cader|regulator|frangere|talie|talia|inaltim|scurtarea|vigoar', ('caderea-plantelor', 'Căderea plantelor (regulator de creștere)', 'fiziologic', None)),
    (r'rarire|rarirea|fructific|legare|inradacin|incoltire|germinat|maturare|maturiz|coacer|lastar|subtiere|mugur|numarului de flori|stimular', ('reglare-crestere', 'Reglarea creșterii și fructificării', 'fiziologic', None)),
]
JUNK_TINTA = re.compile(r'^(\d|etc|inclusiv|se aplica|d$|r$|ur$|mer$|mazar$|buchet$|hrlupii$|mrl$|doritoare$|amania$|compositae$|stargrass$)')
TIP_AGENT = {'buruieni': 'buruiana', 'boli': 'boala', 'daunatori': 'daunator', 'produs vegetal': 'fiziologic'}
RE_LATIN = re.compile(r'^[A-Z][a-z]+(\s+[a-z]+|\s+spp?\.?)+$')

def tinta_simpla(piesa: str, tip_agent: str):
    t = norm(piesa).strip(' .:;-')
    # „buruieni moderat sensibile: voinicica” → „voinicica”; „are control moderat asupra buruienilor: romanita”
    m = re.match(r'^(buruieni )?(foarte |mediu |moderat |putin )?(sensibile|rezistente|control[^:]*)\s*:\s*(.+)$', t)
    if m: t = m.group(4).strip()
    if t.count(')') > t.count('('): t = t.replace(')', ' ').strip()
    if t.count('(') > t.count(')'): t += ')'
    t = re.sub(r'\s+', ' ', t)
    if len(t) < 3 or JUNK_TINTA.match(t): return None
    for rx, defn in REGULI_TINTE:
        if re.search(rx, t): return defn
    # necunoscută: nume curat + eventualul nume latin din paranteze
    ns = None
    par = re.findall(r'\(([^)]*)\)', piesa)
    for p in par:
        p = p.strip()
        if RE_LATIN.match(p) or 'spp' in p: ns = p
    base = re.sub(r'\([^)]*\)', ' ', t)
    base = re.sub(r'\s+', ' ', base).strip(' -:')
    if not base and ns: base = norm(ns)
    if not base: return None
    tip = TIP_AGENT.get(norm(tip_agent), 'altul')
    return (slugify(base)[:80], cap(base)[:200], tip, ns)

def parse_tinta(raw: str, tip_agent: str):
    out = []
    for p in split_top(str(raw)):
        inners = re.findall(r'\(([^()]*)\)', p)
        cands = [p]
        if any((',' in i or ';' in i) for i in inners):
            outer = re.sub(r'\([^()]*\)', ' ', p).strip(' :,.-')
            cands = ([outer] if outer else []) + [x for i in inners for x in re.split(r'[,;]', i) if x.strip()]
        for c in cands:
            d = tinta_simpla(c, tip_agent)
            if d and d not in out: out.append(d)
    return out

# ---------------------------------------------------------------- doze
UNIT = {
    'l/ha': ('L/ha', 1), 'kg/ha': ('kg/ha', 1), 'ml/ha': ('L/ha', 0.001), 'g/ha': ('kg/ha', 0.001),
    'l/t': ('L/t sem', 1), 'kg/t': ('kg/t sem', 1), 'ml/t': ('L/t sem', 0.001), 'g/t': ('kg/t sem', 0.001),
    'ml/100 kg': ('ml/100 kg sem', 1), 'g/100 kg': ('g/100 kg sem', 1), 'l/100 kg': ('ml/100 kg sem', 1000), 'kg/100 kg': ('g/100 kg sem', 1000),
    '%': ('%', 1), 'l/hl': ('L/1000 L apa', 10), 'ml/hl': ('L/1000 L apa', 0.01), 'g/hl': ('kg/1000 L apa', 0.01), 'kg/hl': ('kg/1000 L apa', 10),
}
NUM = r'(\d+(?:[.,]\d+)?)'
RE_DOZA = re.compile(r'(?:(\d+)\s*x\s*)?' + NUM + r'\s*(?:(?:-|pana la|la|\+)\s*' + NUM + r')?\s*(l/ ?ha|kg/ ?ha|ml/ ?ha|g/ ?ha|l/ ?t(?:ona)?|kg/ ?t(?:ona)?|ml/ ?t(?:ona)?|g/ ?t(?:ona)?|ml/ ?100 ?kg|g/ ?100 ?kg|l/ ?100 ?kg|kg/ ?100 ?kg|l/ ?hl|ml/ ?hl|g/ ?hl|kg/ ?hl|%)', re.I)
RE_APA = re.compile(NUM + r'\s*(ml|l|g|kg)\s*(?:/|in)\s*' + NUM + r'?\s*l\s*(?:de\s*)?apa', re.I)

def parse_doza(raw):
    """-> (doza_min, doza_max, unitate, text_rest, scor) ; scor 60 = la începutul celulei, 45 = găsit în interior"""
    if raw is None or (isinstance(raw, float) and pd.isna(raw)): return None, None, None, None, 0
    s0 = str(raw).replace('–', '-').replace('—', '-').replace('−', '-')
    s = norm(s0)
    if not s: return None, None, None, None, 0
    m = RE_DOZA.search(s)
    if m:
        a = float(m.group(2).replace(',', '.')); b = float((m.group(3) or m.group(2)).replace(',', '.'))
        if '+' in s[m.start():m.end()]: a = b = a + b   # „70+80 g/ha” = două produse/aplicări însumate
        u = re.sub(r'\s+', '', m.group(4)).replace('tona', 't').replace('100kg', '100 kg')
        unit, k = UNIT[u]
        rest = (s0[:m.start()].strip() + ' ' + re.sub(r'^[\s,.;:\-)]+', '', s0[m.end():])).strip()
        if m.group(1): rest = f'doză divizată {m.group(1)} × · ' + rest
        rest = re.sub(r'\s+', ' ', rest)[:300] or None
        return round(min(a, b) * k, 5), round(max(a, b) * k, 5), unit, rest, (60 if m.start() == 0 else 45)
    m = RE_APA.search(s)   # „1000 ml/100 L apa”, „150 ml in 100 l apa”, „200 ml/l apa”
    if m:
        v = float(m.group(1).replace(',', '.')); u = m.group(2); apa = float(m.group(3).replace(',', '.')) if m.group(3) else 1.0
        per1000 = v * 1000 / apa
        if u in ('ml', 'g'): per1000 /= 1000
        unit = 'L/1000 L apa' if u in ('ml', 'l') else 'kg/1000 L apa'
        rest = re.sub(r'\s+', ' ', (s0[:m.start()] + ' ' + s0[m.end():]).strip(' ,.;:-'))[:300] or None
        return round(per1000, 5), round(per1000, 5), unit, rest, 45
    return None, None, None, s0[:300], 0

def parse_pauza(raw):
    s = norm(raw)
    m = re.search(r'(\d+)\s*(de\s*)?(zi|zile)', s) or re.fullmatch(r'(\d+)', s)
    return int(m.group(1)) if m else None

def parse_nr_trat(raw):
    s = norm(raw)
    m = re.search(r'(\d+)', s)
    return int(m.group(1)) if m else None

# ---------------------------------------------------------------- main
def main(src):
    df = pd.read_excel(repara_xlsx(Path(src)), header=0)
    df.columns = ['produs', 'tox', 'tip', 'expira', 'cultura', 'agent', 'tinta', 'doza', 'pauza', 'nr_trat', 'data_omol']
    df['expira'] = pd.to_datetime(df.expira, errors='coerce'); df['data_omol'] = pd.to_datetime(df.data_omol, errors='coerce')
    rec = df[df.cultura.notna()].copy()
    fara = df[df.cultura.isna()].copy()

    # --- produse
    produse = OrderedDict()
    for _, r in rec.iterrows():
        nume, sec = parse_produs(r.produs)
        key = norm(nume)
        p = produse.setdefault(key, {'nume': nume, 'sec': [], 'tip': Counter(), 'tox': None, 'expira': None, 'omol': None, 'tinte': []})
        for s in sec:
            if s not in p['sec']: p['sec'].append(s)
        if parse_tip(r.tip): p['tip'][parse_tip(r.tip)] += 1
        if pd.notna(r.tox): p['tox'] = str(int(r.tox))
        if pd.notna(r.expira) and (p['expira'] is None or r.expira > p['expira']): p['expira'] = r.expira
        if pd.notna(r.data_omol) and (p['omol'] is None or r.data_omol < p['omol']): p['omol'] = r.data_omol
        p['tinte'].append(norm(r.tinta))
    slugs_folosite = set()
    for key, p in produse.items():
        tip = p['tip'].most_common(1)[0][0] if p['tip'] else None
        if tip == 'Rodenticid/Moluscocid':
            tt = ' '.join(p['tinte'])
            tip = 'Moluscocid' if re.search(r'limac|melc', tt) else 'Rodenticid' if re.search(r'soarec|sobolan|rozator|harciog|popandau|cartit', tt) else 'Altul'
        p['tip'] = tip
        p['status'] = 'omologat' if p['expira'] is not None and p['expira'] >= AZI else 'expirat'
        slug = slugify(p['nume']) or 'produs'
        while slug in slugs_folosite: slug += '-x'
        slugs_folosite.add(slug); p['slug'] = slug

    # --- recomandări (un rând per produs × cultură canonică × șir brut de ținte)
    culturi = OrderedDict(); tinte = OrderedDict(); harta_tinte = OrderedDict()
    rows = []; note_culturi = Counter(); neparsate = []
    for i, r in rec.iterrows():
        nume, _ = parse_produs(r.produs); pk = norm(nume)
        cl, nota = parse_cultura(r.cultura)
        for n in nota: note_culturi[n.split(':')[0]] += 1
        traw = str(r.tinta).strip() if pd.notna(r.tinta) else ''
        if traw and traw not in harta_tinte:
            harta_tinte[traw] = {'agent': str(r.agent) if pd.notna(r.agent) else None, 'tinte': parse_tinta(traw, r.agent)}
            for t in harta_tinte[traw]['tinte']:
                tinte.setdefault(t[0], t)
        dmin, dmax, unit, rest, scor = parse_doza(r.doza)
        if dmin is None and pd.notna(r.doza): neparsate.append((nume, r.cultura, r.doza))
        pauza = parse_pauza(r.pauza); nrt = parse_nr_trat(r.nr_trat)
        tip_prod = produse[pk]['tip']; agent = norm(r.agent)
        conf = scor if dmin is not None else 35
        nepotrivit = (tip_prod == 'Erbicid' and agent and agent != 'buruieni') or (tip_prod == 'Fungicid' and agent and agent != 'boli') or (tip_prod == 'Insecticid' and agent and agent not in ('daunatori',))
        if nepotrivit: conf = 10
        for (slug, cnume, cat, par) in cl:
            culturi.setdefault(slug, (slug, cnume, cat, par))
            rows.append({
                'rand_nr': int(i) + 2, 'produs_key': pk, 'cultura_slug': slug, 'cultura_raw': str(r.cultura).strip(),
                'agent': str(r.agent).strip() if pd.notna(r.agent) else None, 'tinta_raw': traw or None,
                'doza_raw': str(r.doza).strip() if pd.notna(r.doza) else None, 'doza_min': dmin, 'doza_max': dmax, 'unitate': unit, 'moment': rest,
                'pauza_raw': str(r.pauza).strip() if pd.notna(r.pauza) else None, 'pauza_zile': pauza,
                'nr_trat_raw': str(r.nr_trat).strip() if pd.notna(r.nr_trat) else None, 'nr_trat_max': nrt,
                'tratament_samanta': 'tratament_samanta' in nota, 'nota': ';'.join(sorted(set(nota)))[:300] or None,
                'confidence': conf, 'expira': r.expira,
            })

    # ---------------------------------------------------------------- SQL (staging compact: dicționare + chei întregi)
    def scrie_chunks(prefix, head, lines, tail=';\n', cap_bytes=42_000):
        buf, n, k = [], 0, 0
        for ln in lines:
            if buf and n + len(ln) > cap_bytes:
                (OUT / f'{prefix}_{k:02d}.sql').write_text(head + ",\n".join(buf) + tail); k += 1; buf, n = [], 0
            buf.append(ln); n += len(ln) + 2
        if buf: (OUT / f'{prefix}_{k:02d}.sql').write_text(head + ",\n".join(buf) + tail)

    prod_id = {k: i + 1 for i, k in enumerate(produse)}
    craw = OrderedDict(); doze = OrderedDict(); traw_id = {raw: i + 1 for i, raw in enumerate(harta_tinte)}
    for r in rows:
        r['cultura_raw_id'] = craw.setdefault(r['cultura_raw'], len(craw) + 1)
        dk = (r['doza_raw'], r['doza_min'], r['doza_max'], r['unitate'], r['moment'])
        r['doza_id'] = doze.setdefault(dk, len(doze) + 1) if r['doza_raw'] is not None else None
        r['tinta_id'] = traw_id.get(r['tinta_raw'])
        r['produs_id'] = prod_id[r['produs_key']]

    (OUT / '00_staging_schema.sql').write_text(f"""-- staging pentru importul {SURSA} (generat de parse_lista.py)
drop table if exists public.import_anf_recomandari, public.import_anf_doze, public.import_anf_tinte, public.import_anf_tinte_canon,
  public.import_anf_culturi_raw, public.import_anf_culturi, public.import_anf_produse, public.import_anf_fara;
create table public.import_anf_produse (id int primary key, nume text not null, slug text not null, nume_secundare text[] not null default '{{}}', tip text, grupa_toxicitate text, data_expirare date, data_omologare date, status text not null);
create table public.import_anf_culturi (slug text primary key, nume text not null, categorie text, parinte_slug text);
create table public.import_anf_culturi_raw (id int primary key, text text not null);
create table public.import_anf_tinte_canon (slug text primary key, nume text not null, tip text not null, ns text);
create table public.import_anf_tinte (id int primary key, tinta_raw text not null, agent text, slugs text[] not null);
create table public.import_anf_doze (id int primary key, doza_raw text, doza_min numeric, doza_max numeric, unitate text, moment text);
create table public.import_anf_recomandari (id int primary key, rand_nr int, produs_id int not null, cultura_slug text not null, cultura_raw_id int, tinta_id int, doza_id int,
  pauza_raw text, pauza_zile int, nr_trat_raw text, nr_trat_max int, tratament_samanta boolean default false, nota text, confidence smallint, data_expirare date, recomandare_id bigint);
create table public.import_anf_fara (rand_nr int primary key, nume text not null, nume_secundare text[] not null default '{{}}', data_expirare date, data_omologare date);
""")
    lines = [f"({prod_id[k]},{q(p['nume'])},{q(p['slug'])},{q(p['sec'])},{q(p['tip'])},{q(p['tox'])},{q(p['expira'])},{q(p['omol'])},{q(p['status'])})" for k, p in produse.items()]
    scrie_chunks('10_produse', "insert into public.import_anf_produse (id,nume,slug,nume_secundare,tip,grupa_toxicitate,data_expirare,data_omologare,status) values\n", lines)
    lines = [f"({q(s)},{q(n)},{q(c)},{q(p)})" for s, n, c, p in culturi.values()]
    scrie_chunks('20_culturi', "insert into public.import_anf_culturi (slug,nume,categorie,parinte_slug) values\n", lines)
    lines = [f"({i},{q(t)})" for t, i in craw.items()]
    scrie_chunks('21_culturi_raw', "insert into public.import_anf_culturi_raw (id,text) values\n", lines)
    lines = [f"({q(t[0])},{q(t[1])},{q(t[2])},{q(t[3])})" for t in tinte.values()]
    scrie_chunks('30_tinte_canon', "insert into public.import_anf_tinte_canon (slug,nume,tip,ns) values\n", lines)
    lines = [f"({traw_id[raw]},{q(raw)},{q(v['agent'])},{q([t[0] for t in v['tinte']])})" for raw, v in harta_tinte.items()]
    scrie_chunks('31_tinte', "insert into public.import_anf_tinte (id,tinta_raw,agent,slugs) values\n", lines)
    lines = [f"({i},{q(d[0])},{q(d[1])},{q(d[2])},{q(d[3])},{q(d[4])})" for d, i in doze.items()]
    scrie_chunks('35_doze', "insert into public.import_anf_doze (id,doza_raw,doza_min,doza_max,unitate,moment) values\n", lines)
    cols = ['rand_nr', 'produs_id', 'cultura_slug', 'cultura_raw_id', 'tinta_id', 'doza_id', 'pauza_raw', 'pauza_zile', 'nr_trat_raw', 'nr_trat_max', 'tratament_samanta', 'nota', 'confidence', 'expira']
    lines = [f"({i + 1}," + ','.join(q(r[c]) for c in cols) + ')' for i, r in enumerate(rows)]
    scrie_chunks('40_recomandari', "insert into public.import_anf_recomandari (id," + ','.join(c if c != 'expira' else 'data_expirare' for c in cols) + ") values\n", lines)
    lines = []
    for _, r in fara.iterrows():
        nume, sec = parse_produs(r.produs)
        lines.append(f"({int(r.name) + 2},{q(nume)},{q(sec)},{q(r.expira if pd.notna(r.expira) else None)},{q(r.data_omol if pd.notna(r.data_omol) else None)})")
    scrie_chunks('50_produse_fara_omologari', "insert into public.import_anf_fara (rand_nr,nume,nume_secundare,data_expirare,data_omologare) values\n", lines)

    # ---------------------------------------------------------------- raport
    noi_c = [c for c in culturi.values() if c[2] == 'altele']
    tinte_noi = [t for t in tinte.values() if not any(t[0] == d[0] for _, d in REGULI_TINTE)]
    rap = [f"# Raport parsare {SURSA}", '',
           f"- rânduri în fișier: {len(df)} · omologări: {len(rec)} · produse fără omologări (doar import_raw): {len(fara)}",
           f"- produse cu omologări: {len(produse)} · valabile: {sum(1 for p in produse.values() if p['status']=='omologat')} · cu a doua denumire: {sum(1 for p in produse.values() if p['sec'])}",
           f"- rânduri de recomandări după despărțirea culturilor compuse: {len(rows)}",
           f"- doze parsate: {sum(1 for r in rows if r['doza_min'] is not None)} · neparsate: {sum(1 for r in rows if r['doza_min'] is None)}",
           f"- recomandări cu tip produs ≠ tip țintă (confidence 10): {sum(1 for r in rows if r['confidence']==10)}",
           f"- culturi canonice folosite: {len(culturi)} · din care create automat (categorie „altele”): {len(noi_c)}",
           f"- note culturi: {dict(note_culturi)}",
           f"- șiruri brute de ținte: {len(harta_tinte)} · ținte canonice: {len(tinte)} · din care create automat (fără regulă): {len(tinte_noi)}",
           '', '## Culturi create automat (de verificat / unit cu altele)', '',
           *[f"- `{s}` — {n}" for s, n, c, p in sorted(noi_c)],
           '', '## Ținte create automat (de verificat / unit cu altele)', '',
           *[f"- `{t[0]}` — {t[1]} [{t[2]}]" + (f" ({t[3]})" if t[3] else '') for t in sorted(tinte_noi)],
           '', '## Doze neparsate (rămân text, confidence 35)', '',
           *[f"- {a} · {b} · `{c}`" for a, b, c in neparsate[:200]]]
    (OUT / 'raport.md').write_text('\n'.join(rap) + '\n')
    print('\n'.join(rap[2:10]))

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'lista.xlsx')
