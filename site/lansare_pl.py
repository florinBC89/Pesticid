"""Comutatoarele lansării versiunii poloneze (agrosphere.eu/pl/). Se schimbă doar cu aprobarea lui Florin.
PL_PUBLIC = True  → selectorul RO/PL apare pentru toți vizitatorii, iar paginile /pl/ pot fi indexate de Google.
AUTO_PL   = True  → la prima vizită, cine are browserul în poloneză ajunge automat pe /pl/ (o singură dată;
                    alegerea făcută în selector se ține minte și are prioritate). Cere și PL_PUBLIC = True.
Cu ambele False, paginile RO rămân exact ca înainte (nimic în plus în <head>)."""
PL_PUBLIC = False
AUTO_PL = False

REDIRECT = ("<script>(function(){try{var p=location.pathname;if(/^\\/pl(\\/|$)/.test(p))return;"
            "if(localStorage.getItem('agrosphere.limba'))return;if(/[?&]beta=/.test(location.search))return;"
            "var l=(navigator.languages&&navigator.languages[0])||navigator.language||'';if(!/^pl(-|$)/i.test(l))return;"
            "localStorage.setItem('agrosphere.limba','pl');"
            "location.replace('/pl'+(p.indexOf('/plan-fertilizare')===0?'/':p)+location.hash);}catch(e){}})();</script>")

def head_extra():
    out = ''
    if PL_PUBLIC: out += '<meta name="agrosphere-pl" content="public">'
    if PL_PUBLIC and AUTO_PL: out += REDIRECT
    return out
