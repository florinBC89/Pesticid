import re
NUM=r'(\d+(?:[.,]\d+)?)'
DOSE=re.compile(NUM+r'\s*(?:[-–]\s*'+NUM+r')?\s*(ml|l|i|kg|g)(?:\s+środka)?\s*/\s*(ha|\d[\d ]*\s*(?:m2|m²|kg|t|l|szt)|m2|t|kg|hl|m3|l)(?![a-z0-9])',re.I)
PCT=re.compile(NUM+r'\s*(?:[-–]\s*'+NUM+r'\s*)?%')
def f(x): return float(x.replace(',','.'))
LWA=re.compile(r'(?i)^[\s.,;:–-]*(powierzchn|ścian|lwa)')
HA_PAREN=re.compile(NUM+r'\s*(?:[-–]\s*'+NUM+r')?\s*(ml|l|kg|g)\s*(?:/\s*ha|\s+na\s+1\s+ha)',re.I)
def pd(line):
    if not line: return None
    t=line.split(':',1)[1] if ':' in line else line
    m=DOSE.search(t)
    if m and LWA.search(t[m.end():m.end()+45]):
        # doză pe hectarul de PERETE FOLIAR (LWA, livezi/vie): luăm echivalentul pe hectarul de teren, dacă e scris; altfel rândul nu intră
        h=HA_PAREN.search(t[m.end():])
        if not h: return None
        a=f(h.group(1)); b=f(h.group(2)) if h.group(2) else a
        u1=h.group(3).lower()
        return (min(a,b),max(a,b),u1+'/ha')
    if m:
        a=f(m.group(1)); b=f(m.group(2)) if m.group(2) else a
        u1=m.group(3).lower(); u1='l' if u1=='i' else u1
        return (min(a,b),max(a,b),u1+'/'+re.sub(r'\s+',' ',m.group(4).lower().replace('m²','m2')).strip())
    p=PCT.search(t)
    if p:
        a=f(p.group(1)); b=f(p.group(2)) if p.group(2) else a
        return (min(a,b),max(a,b),'%')
    return None
def parse(txt):
    L=[l.strip() for l in (txt or '').split('\n') if l.strip()]
    mx=[l for l in L if re.match(r'(?i)maksymaln',l)]
    rc=[l for l in L if re.search(r'(?i)zalecan',l) and not re.match(r'(?i)maksymaln',l)] or [l for l in L if re.search(r'(?i)zalecan',l)]
    dm=pd(mx[0]) if mx else None
    dr=pd(rc[0]) if rc else None
    if mx and re.search(r'(?i)zalecan',mx[0]) and dr is None: dr=dm
    if not mx and not rc and L:
        dm=dr=pd(L[0])
    multi=len(mx)>1 or len([l for l in rc if not re.match(r'(?i)maksymaln',l)])>1 or bool(re.search(r'(?i)\blub\b|zabieg',txt or ''))
    return dm,dr,multi
