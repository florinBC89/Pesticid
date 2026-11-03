import { useCallback, useEffect, useMemo, useState } from 'react'
import Omnibox from './components/Omnibox'
import ParamsBar from './components/ParamsBar'
import ResultCard from './components/ResultCard'
import AuthModal, { type TriggerCont } from './components/AuthModal'
import Catalog from './components/Catalog'
import * as api from './lib/api'
import { MOCK } from './lib/supabase'
import { track, trackVizita } from './lib/analytics'
import { asiguraSesiune, iesi, peSchimbare, type StareCont } from './lib/auth'
import { adaugaRecenta, citesteParametri, citesteRecente, salveazaParametri, type Recenta } from './lib/recents'
import { tipTintaLabel } from './lib/format'
import type { Cultura, CulturaPentruTinta, Hit, InSezon, Parametri, Recomandare, Selectie } from './lib/types'

export default function App() {
  const [sel, setSel] = useState<Selectie>({})
  const [p, setP] = useState<Parametri>(() => citesteParametri())
  const [recente, setRecente] = useState<Recenta[]>(() => citesteRecente())
  const [inSezon, setInSezon] = useState<InSezon[]>([])
  const [culturi, setCulturi] = useState<Cultura[]>([])
  const [culturiTinta, setCulturiTinta] = useState<CulturaPentruTinta[]>([])
  const [tinteCultura, setTinteCultura] = useState<{ tinta: string; tinta_slug: string; tip_tinta: string; nr: number }[]>([])
  const [recs, setRecs] = useState<Recomandare[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [cont, setCont] = useState<StareCont>({ user: null, anonim: true, email: null })
  const [modalCont, setModalCont] = useState<TriggerCont | null>(null)
  // două intrări: „Catalog” (tabel + calculator per produs) și „Caută după problemă” (omnibox)
  const [vedere, setVedere] = useState<'catalog' | 'cauta'>(() => (location.hash === '#cauta' ? 'cauta' : 'catalog'))
  useEffect(() => { history.replaceState(null, '', vedere === 'cauta' ? '#cauta' : '#catalog') }, [vedere])

  useEffect(() => {
    trackVizita()
    asiguraSesiune().then(setCont)
    const off = peSchimbare(s => { setCont(s); if (!s.anonim) setModalCont(null) })
    api.inSezon().then(setInSezon).catch(() => {}); api.culturi().then(setCulturi).catch(() => {})
    return off
  }, [])
  useEffect(() => { salveazaParametri(p) }, [p])

  // pasul 2: culturi pentru țintă / ținte pentru cultură / combinații pentru produs
  useEffect(() => {
    setErr(null)
    if (sel.produs && !sel.tinta) {
      api.recomandariProdus(sel.produs.slug).then(rs => { setRecs(rs) }).catch(e => setErr(String(e.message ?? e)))
      return
    }
    if (sel.tinta && !sel.cultura) { api.culturiPentruTinta(sel.tinta.slug).then(setCulturiTinta).catch(e => setErr(String(e.message ?? e))) } else setCulturiTinta([])
    if (sel.cultura && !sel.tinta) { api.tintePentruCultura(sel.cultura.slug).then(setTinteCultura).catch(e => setErr(String(e.message ?? e))) } else setTinteCultura([])
  }, [sel.tinta, sel.cultura, sel.produs])

  // pasul 3: recomandări
  useEffect(() => {
    if (!sel.tinta || !sel.cultura) { if (!sel.produs) setRecs(null); return }
    let viu = true
    setLoading(true); setErr(null)
    api.recomanda(sel.cultura.slug, sel.tinta.slug)
      .then(rs => {
        if (!viu) return
        setRecs(sel.produs ? [...rs].sort((a, b) => (a.produs_slug === sel.produs!.slug ? -1 : 0) - (b.produs_slug === sel.produs!.slug ? -1 : 0)) : rs)
        track('calcul', { cultura: sel.cultura!.slug, tinta: sel.tinta!.slug, ha: p.ha, apa: p.apa, rezervor: p.rezervor, nr_produse: rs.length, nr_omologate: rs.filter(r => r.status_produs === 'omologat').length })
      })
      .catch(e => viu && setErr(String(e.message ?? e)))
      .finally(() => viu && setLoading(false))
    const et = `${sel.tinta.nume} la ${sel.cultura.nume}`
    adaugaRecenta(et, { tinta: sel.tinta, cultura: sel.cultura }); setRecente(citesteRecente())
    return () => { viu = false }
  }, [sel.tinta, sel.cultura, sel.produs])

  const onAlege = useCallback((h: Hit, din: string = 'typeahead', pozitie = 0) => {
    track('alegere', { tip: h.entitate_tip, slug: h.slug, eticheta: h.eticheta, pozitie, din })
    if (h.entitate_tip === 'tinta') setSel(s => ({ ...s, tinta: { slug: h.slug, nume: h.eticheta, tip: h.extra.tip } }))
    else if (h.entitate_tip === 'cultura') setSel(s => ({ ...s, cultura: { slug: h.slug, nume: h.eticheta } }))
    else if (h.entitate_tip === 'produs') setSel({ produs: { slug: h.slug, nume: h.eticheta } })
    else setSel({})
  }, [])
  const onSterge = useCallback((ce: 'tinta' | 'cultura' | 'produs') => setSel(s => { const n = { ...s }; delete n[ce]; return n }), [])

  const omologate = useMemo(() => recs?.filter(r => r.status_produs === 'omologat') ?? [], [recs])
  const altele = useMemo(() => recs?.filter(r => r.status_produs !== 'omologat') ?? [], [recs])
  const gata = !!(sel.tinta && sel.cultura)

  // combinațiile unui produs (pagina produsului, varianta MVP)
  const combinatiiProdus = useMemo(() => {
    if (!sel.produs || sel.tinta || !recs) return []
    const m = new Map<string, Recomandare>()
    for (const r of recs) if (r.tinta_slug) m.set(`${r.cultura_slug}|${r.tinta_slug}`, r)
    return [...m.values()]
  }, [sel.produs, sel.tinta, recs])

  return (
    <div className="app">
      <header className="hdr">
        <div className="logo">Pestic<b>i</b>d</div>
        {cont.anonim
          ? <button className="btn ghost" onClick={() => setModalCont('header')}>Intră în cont</button>
          : <div className="cont"><span className="tag">cont</span><span>{cont.email}</span><button className="btn ghost" onClick={() => void iesi()}>Ieși</button></div>}
      </header>
      {modalCont && <AuthModal trigger={modalCont} onClose={() => setModalCont(null)} />}

      <section className="hero">
        <h1>{vedere === 'catalog' ? 'Ce pesticide cauți?' : 'Cât produs pui în rezervor?'}</h1>
        <p>{vedere === 'catalog' ? 'Alege produsul din lista omologată, apoi cultura și dăunătorul — îți calculăm doza și cantitatea per rezervor.' : 'Scrie ce ai pe câmp sau ce ai în magazie. Îți arătăm produsele omologate, doza corectă și câte rezervoare umpli.'}</p>
      </section>

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={vedere === 'catalog'} className={vedere === 'catalog' ? 'on' : ''} onClick={() => setVedere('catalog')}>Catalog produse</button>
        <button role="tab" aria-selected={vedere === 'cauta'} className={vedere === 'cauta' ? 'on' : ''} onClick={() => setVedere('cauta')}>Caută după problemă</button>
      </div>

      {MOCK && <div className="notice" style={{ marginBottom: 12 }}>Mod demo: date locale (fără conexiune la Supabase). Setează <code>VITE_SUPABASE_URL</code> și <code>VITE_SUPABASE_ANON_KEY</code> în <code>.env</code>.</div>}

      {vedere === 'catalog' && <Catalog onSalveaza={() => { track('salveaza_click', { din: 'catalog', cont: !cont.anonim }); if (cont.anonim) setModalCont('salveaza') }} />}

      {vedere === 'cauta' && <>
      <Omnibox selectie={sel} recente={recente} inSezon={inSezon} culturi={culturi} onAlege={onAlege} onSterge={onSterge}
        onRecenta={(r: Recenta) => setSel(r.selectie)} />

      {err && <div className="err">{err}</div>}

      {sel.tinta && !sel.cultura && (
        <section className="card">
          <h2>La ce cultură?</h2>
          <p className="sub">doar culturile pentru care există produse omologate contra: {sel.tinta.nume.toLowerCase()}</p>
          {culturiTinta.length === 0 ? <div className="skel" style={{ height: 48 }} /> : (
            <div className="chips">
              {culturiTinta.map(c => (
                <button key={c.cultura_slug} className="chip" onClick={() => { track('cultura_aleasa', { slug: c.cultura_slug, pentru_tinta: sel.tinta!.slug }); setSel(s => ({ ...s, cultura: { slug: c.cultura_slug, nume: c.cultura } })) }}>
                  {c.cultura} <small>{c.nr_produse} produse</small>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {sel.cultura && !sel.tinta && !sel.produs && (
        <section className="card">
          <h2>Ce problemă ai la {sel.cultura.nume.toLowerCase()}?</h2>
          <p className="sub">dăunători, boli și buruieni cu produse omologate</p>
          {tinteCultura.length === 0 ? <div className="skel" style={{ height: 48 }} /> : (
            <div className="chips">
              {tinteCultura.map(t => (
                <button key={t.tinta_slug} className={`chip`} onClick={() => setSel(s => ({ ...s, tinta: { slug: t.tinta_slug, nume: t.tinta, tip: t.tip_tinta } }))}>
                  {t.tinta} <small>{tipTintaLabel(t.tip_tinta)} · {t.nr}</small>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {sel.produs && !sel.tinta && (
        <section className="card">
          <h2>{sel.produs.nume} — pentru ce calculezi?</h2>
          <p className="sub">culturile și dăunătorii sau bolile pentru care produsul este omologat</p>
          {recs === null ? <div className="skel" style={{ height: 48 }} /> : combinatiiProdus.length === 0 ? <div className="sub">Nu avem omologări verificate pentru acest produs.</div> : (
            <div className="chips">
              {combinatiiProdus.map(r => (
                <button key={`${r.cultura_slug}|${r.tinta_slug}`} className="chip" onClick={() => setSel(s => ({ ...s, cultura: { slug: r.cultura_slug, nume: r.cultura }, tinta: { slug: r.tinta_slug!, nume: r.tinta, tip: r.tip_tinta } }))}>
                  {r.cultura} <small>· {r.tinta}</small>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {gata && (
        <section className="card">
          <h2>Suprafață, apă, rezervor</h2>
          <p className="sub">le ținem minte pe telefonul tău · calculul se actualizează instant</p>
          <ParamsBar p={p} onChange={setP} />
        </section>
      )}

      {gata && (
        <>
          <div className="res-head">
            <h2>{loading ? 'Caut produse…' : `${omologate.length} produse omologate`} <span>pentru {sel.cultura!.nume} · {sel.tinta!.nume} · {p.ha} ha</span></h2>
          </div>
          {loading && recs === null && <><div className="skel" /><div className="skel" /></>}
          {!loading && recs && omologate.length === 0 && <div className="notice">Nu avem încă produse omologate verificate pentru această combinație. Încearcă o cultură mai generală (ex. „Grâu” în loc de „Grâu de toamnă”) sau un dăunător ori o boală apropiată.</div>}
          {omologate.map((r, i) => <ResultCard key={r.recomandare_id} r={r} p={p} best={i === 0} onSalveaza={() => { track('salveaza_click', { produs: r.produs_slug, cont: !cont.anonim }); if (cont.anonim) setModalCont('salveaza') }} />)}
          {altele.length > 0 && (<>
            <div className="res-head"><h2>Expirate sau retrase <span>{altele.length} — nu le folosi fără verificare</span></h2></div>
            {altele.map(r => <ResultCard key={r.recomandare_id} r={r} p={p} />)}
          </>)}
        </>
      )}
      </>}

      <p className="foot">Date din registrul oficial al produselor de protecție a plantelor omologate în România (ANF). Dozele sunt cele de pe etichetă; calculele sunt orientative — verifică întotdeauna eticheta fizică a produsului înainte de aplicare.</p>
    </div>
  )
}
