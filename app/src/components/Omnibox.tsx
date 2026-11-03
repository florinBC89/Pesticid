import { useEffect, useMemo, useRef, useState } from 'react'
import { cauta, raporteazaCautare } from '../lib/api'
import { track } from '../lib/analytics'
import type { Cultura, EntitateTip, Hit, InSezon, Selectie } from '../lib/types'
import type { Recenta } from '../lib/recents'
import { LUNI, tipTintaLabel } from '../lib/format'

interface Props {
  selectie: Selectie
  recente: Recenta[]
  inSezon: InSezon[]
  culturi: Cultura[]
  onAlege: (hit: Hit, din?: string, pozitie?: number) => void
  onRecenta: (r: Recenta) => void
  onSterge: (ce: 'tinta' | 'cultura' | 'produs') => void
}

const ORDINE: EntitateTip[] = ['tinta', 'produs', 'substanta', 'cultura']
const TITLU: Record<EntitateTip, string> = { tinta: 'Dăunători, boli, buruieni', produs: 'Produse', substanta: 'Substanțe active', cultura: 'Culturi' }
const ICON: Record<EntitateTip, string> = { tinta: '🐛', produs: '🧴', substanta: '⚗️', cultura: '🌾' }

function hint(h: Hit): string {
  if (h.entitate_tip === 'tinta') return '→ alegi cultura'
  if (h.entitate_tip === 'produs') return h.extra.status === 'omologat' ? '→ culturi + calcul' : '→ alternativă'
  if (h.entitate_tip === 'cultura') return '→ probleme la cultură'
  return '→ produse cu substanța'
}
function meta(h: Hit): string {
  const e = h.extra
  if (h.entitate_tip === 'tinta') {
    const c = (e.culturi ?? []).slice(0, 5).map(c => c.nume).join(', ')
    return [tipTintaLabel(e.tip), c, (e.culturi?.length ?? 0) > 5 ? `+${e.culturi!.length - 5}` : ''].filter(Boolean).join(' · ')
  }
  if (h.entitate_tip === 'produs') return [e.tip, e.substante, e.nr_culturi ? `${e.nr_culturi} culturi` : '', e.nume_secundare?.length ? `cunoscut și ca ${e.nume_secundare.join(', ')}` : ''].filter(Boolean).join(' · ')
  if (h.entitate_tip === 'substanta') return [e.status_ue, e.nr_produse ? `${e.nr_produse} produse` : ''].filter(Boolean).join(' · ')
  return e.categorie ?? ''
}
function bold(label: string, q: string) {
  const i = label.toLocaleLowerCase('ro').indexOf(q.toLocaleLowerCase('ro'))
  if (i < 0 || !q) return <>{label}</>
  return <>{label.slice(0, i)}<b>{label.slice(i, i + q.length)}</b>{label.slice(i + q.length)}</>
}

export default function Omnibox({ selectie, recente, inSezon, culturi, onAlege, onRecenta, onSterge }: Props) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [idx, setIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const raportat = useRef<string>('')

  // typeahead cu debounce
  useEffect(() => {
    const s = q.trim()
    if (s.length < 2) { setHits([]); setLoading(false); return }
    setLoading(true)
    const t = setTimeout(async () => {
      const t0 = performance.now()
      try {
        const r = await cauta(s, 10)
        setHits(r); setIdx(0)
        track('cautare', { q: s, nr_rezultate: r.length, ms: Math.round(performance.now() - t0), tipuri: [...new Set(r.map(h => h.entitate_tip))] })
        if (r.length === 0 && raportat.current !== s) { raportat.current = s; track('cautare_fara_rezultat', { q: s }); void raporteazaCautare(s) }
      } catch { setHits([]) } finally { setLoading(false) }
    }, 350)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    const h = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const grupuri = useMemo(() => ORDINE.map(t => ({ tip: t, items: hits.filter(h => h.entitate_tip === t) })).filter(g => g.items.length), [hits])
  const plat = useMemo(() => grupuri.flatMap(g => g.items), [grupuri])

  const alege = (h: Hit, din = 'typeahead', pozitie = 0) => { onAlege(h, din, pozitie); setQ(''); setHits([]); setOpen(false) }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i + 1, plat.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter' && plat[idx]) { e.preventDefault(); alege(plat[idx], 'typeahead', idx) }
    else if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur() }
    else if (e.key === 'Backspace' && q === '') { if (selectie.cultura) onSterge('cultura'); else if (selectie.tinta) onSterge('tinta'); else if (selectie.produs) onSterge('produs') }
  }

  const placeholder = selectie.tinta ? 'adaugă cultura sau al doilea dăunător / boală…' : selectie.cultura ? 'ce problemă ai la cultură?' : 'Caută dăunător, boală, buruiană, produs sau cultură…'
  const luna = LUNI[new Date().getMonth()]
  const zeroQuery = q.trim().length < 2

  return (
    <div className="omni" ref={wrapRef}>
      <div className="omni-bar" onClick={() => inputRef.current?.focus()}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
        {selectie.produs && <Token cls="t-produs" text={selectie.produs.nume} onX={() => onSterge('produs')} />}
        {selectie.tinta && <Token cls={`t-${selectie.tinta.tip ?? 'altul'}`} text={selectie.tinta.nume} onX={() => onSterge('tinta')} />}
        {selectie.cultura && <Token cls="t-cultura" text={selectie.cultura.nume} onX={() => onSterge('cultura')} />}
        <input
          ref={inputRef} value={q} placeholder={placeholder} aria-label="Caută"
          onChange={e => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} onKeyDown={onKey}
          autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="search"
        />
        {q && <button aria-label="Șterge" onClick={() => { setQ(''); inputRef.current?.focus() }} style={{ fontSize: 18, color: 'var(--placeholder)', padding: '0 6px' }}>×</button>}
      </div>

      {open && (
        <div className="dropdown" role="listbox">
          {zeroQuery ? (
            <>
              {recente.length > 0 && (<>
                <div className="group-h">Căutările tale recente</div>
                <div className="chips" style={{ padding: '0 12px 8px' }}>
                  {recente.map(r => <button key={r.eticheta} className="chip" onClick={() => { onRecenta(r); setOpen(false) }}>🕓 {r.eticheta}</button>)}
                </div>
              </>)}
              {inSezon.length > 0 && (<>
                <div className="group-h">În sezon acum · {luna}</div>
                {inSezon.map(s => (
                  <button key={s.tinta_slug} className="row" onClick={() => alege({ entitate_tip: 'tinta', entitate_id: s.tinta_id, eticheta: s.tinta, sub_eticheta: null, slug: s.tinta_slug, scor: 0, in_sezon: true, extra: { tip: s.tip, culturi: s.culturi.map((c, i) => ({ id: i, ...c })) } }, 'in_sezon')}>
                    <span className={`ic t-${s.tip}`}>{ICON.tinta}</span>
                    <span className="main"><div className="lbl">{s.tinta}</div><div className="meta">{tipTintaLabel(s.tip)} · {s.culturi.map(c => c.nume).join(', ')}</div></span>
                    <span className="tag ok">în sezon</span>
                    <span className="hint">→ alegi cultura</span>
                  </button>
                ))}
              </>)}
              <div className="group-h">Sau pornește de la cultură</div>
              <div className="chips" style={{ padding: '0 12px 8px' }}>
                {culturi.slice(0, 12).map(c => <button key={c.slug} className="chip" onClick={() => alege({ entitate_tip: 'cultura', entitate_id: c.id, eticheta: c.nume, sub_eticheta: c.categorie, slug: c.slug, scor: 0, in_sezon: false, extra: {} }, 'chip')}>🌾 {c.nume}</button>)}
              </div>
              <div className="kbd"><span>fără diacritice e ok</span><span>↑ ↓ navighează</span><span>Enter alege</span></div>
            </>
          ) : loading && hits.length === 0 ? (
            <div className="empty"><div className="meta">Caut…</div></div>
          ) : hits.length === 0 ? (
            <div className="empty">
              <h3>Nu am găsit nimic pentru „{q.trim()}”.</h3>
              <div className="meta" style={{ marginBottom: 10 }}>Am notat termenul — îl adăugăm ca sinonim dacă e un nume local. Între timp, pornește de la cultură:</div>
              <div className="chips">
                {culturi.slice(0, 10).map(c => <button key={c.slug} className="chip" onClick={() => alege({ entitate_tip: 'cultura', entitate_id: c.id, eticheta: c.nume, sub_eticheta: c.categorie, slug: c.slug, scor: 0, in_sezon: false, extra: {} }, 'fara_rezultat')}>🌾 {c.nume}</button>)}
              </div>
            </div>
          ) : (
            <>
              {grupuri.map(g => (
                <div key={g.tip}>
                  <div className="group-h">{TITLU[g.tip]} <span style={{ fontWeight: 400 }}>{g.items.length}</span></div>
                  {g.items.map(h => {
                    const i = plat.indexOf(h)
                    const bad = h.entitate_tip === 'produs' && h.extra.status && h.extra.status !== 'omologat'
                    return (
                      <button key={`${h.entitate_tip}-${h.entitate_id}`} role="option" aria-selected={i === idx} className={`row ${i === idx ? 'active' : ''}`} onMouseEnter={() => setIdx(i)} onClick={() => alege(h, 'typeahead', i)}>
                        <span className={`ic t-${h.entitate_tip === 'tinta' ? (h.extra.tip ?? 'altul') : h.entitate_tip}`}>{ICON[h.entitate_tip]}</span>
                        <span className="main"><div className="lbl">{bold(h.eticheta, q.trim())}</div><div className="meta">{meta(h)}</div></span>
                        {h.in_sezon && <span className="tag ok">în sezon</span>}
                        {bad && <span className="tag bad">{h.extra.status}</span>}
                        <span className="hint">{hint(h)}</span>
                      </button>
                    )
                  })}
                </div>
              ))}
              <div className="kbd"><span>↑ ↓ navighează</span><span>Enter alege</span><span>Esc închide</span></div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Token({ cls, text, onX }: { cls: string; text: string; onX: () => void }) {
  return <span className={`token ${cls}`}><span>{text}</span><button aria-label={`Șterge ${text}`} onClick={e => { e.stopPropagation(); onX() }}>×</button></span>
}
