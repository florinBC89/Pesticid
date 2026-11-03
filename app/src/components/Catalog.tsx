import { Fragment, useEffect, useState } from 'react'
import ProductCalc from './ProductCalc'
import { catalogProduse } from '../lib/api'
import { track } from '../lib/analytics'
import { doza as fmtDoza, statusLabel } from '../lib/format'
import type { ProdusCatalog } from '../lib/types'

const TIPURI = ['Fungicid', 'Erbicid', 'Insecticid'] as const
const TIP_CLS: Record<string, string> = { Insecticid: 'ins', Erbicid: 'erb', Fungicid: 'fun' }
type Vedere = 'tabel' | 'carduri'

interface Props { onSalveaza?: () => void }

export default function Catalog({ onSalveaza }: Props) {
  const [tip, setTip] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [doarOmologate, setDoarOmologate] = useState(true)
  const [vedere, setVedere] = useState<Vedere>(() => (localStorage.getItem('pesticid.vedere') as Vedere) || 'tabel')
  const [pagina, setPagina] = useState(0)
  const [rows, setRows] = useState<ProdusCatalog[] | null>(null)
  const [sel, setSel] = useState<ProdusCatalog | null>(null)
  // sub 720px tabelul nu încape → carduri automat
  const [ingust, setIngust] = useState(() => matchMedia('(max-width: 719px)').matches)
  useEffect(() => { const m = matchMedia('(max-width: 719px)'); const h = () => setIngust(m.matches); m.addEventListener('change', h); return () => m.removeEventListener('change', h) }, [])
  const vedereEfectiva: Vedere = ingust ? 'carduri' : vedere
  const LIM = 12

  useEffect(() => { localStorage.setItem('pesticid.vedere', vedere) }, [vedere])
  useEffect(() => { setPagina(0) }, [tip, q, doarOmologate])
  useEffect(() => {
    let viu = true; setRows(null)
    const t = setTimeout(() => {
      catalogProduse({ tip, q, doarOmologate, lim: LIM, offset: pagina * LIM }).then(r => { if (viu) setRows(r) }).catch(() => viu && setRows([]))
    }, q ? 250 : 0)
    return () => { viu = false; clearTimeout(t) }
  }, [tip, q, doarOmologate, pagina])

  const total = rows?.[0]?.total ?? 0
  const nrPagini = Math.max(1, Math.ceil(total / LIM))
  const selecteaza = (p: ProdusCatalog) => { setSel(s => (s?.produs_id === p.produs_id ? null : p)); track('alegere', { tip: 'produs', slug: p.produs_slug, eticheta: p.produs, din: 'catalog' }) }

  return (
    <section className="cat">
      <div className="cat-tools">
        <div className="chips">
          <button className={`chip ${tip === null ? 'on' : ''}`} onClick={() => setTip(null)}>Toate</button>
          {TIPURI.map(t => <button key={t} className={`chip ${tip === t ? 'on' : ''}`} onClick={() => setTip(tip === t ? null : t)}>{t}e</button>)}
          <button className={`chip ${doarOmologate ? 'on' : ''}`} onClick={() => setDoarOmologate(v => !v)}>Doar omologate</button>
        </div>
        <div className="cat-search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Caută produs sau substanță activă…" aria-label="Caută în catalog" />
        </div>
        {!ingust && <div className="switch" role="group" aria-label="Mod de afișare">
          <button className={vedere === 'tabel' ? 'on' : ''} onClick={() => setVedere('tabel')} aria-label="Tabel" title="Tabel">☰</button>
          <button className={vedere === 'carduri' ? 'on' : ''} onClick={() => setVedere('carduri')} aria-label="Carduri" title="Carduri">▦</button>
        </div>}
      </div>

      {rows === null ? <><div className="skel" /><div className="skel" /></> : rows.length === 0 ? (
        <div className="notice">Niciun produs pentru filtrele alese.</div>
      ) : vedereEfectiva === 'tabel' ? (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Produs</th><th>Tip</th><th>Culturi</th><th>Ținte</th><th>Doză</th><th>Pauză</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.map(p => (
                <Fragment key={p.produs_id}>
                  <tr className={`${sel?.produs_id === p.produs_id ? 'sel' : ''} ${p.status !== 'omologat' ? 'dim' : ''}`} onClick={() => selecteaza(p)}>
                    <td className="n">{p.produs}{p.nume_secundare?.length ? <small>{p.nume_secundare.join(', ')}</small> : null}{p.substante ? <small>{p.substante}</small> : null}</td>
                    <td>{p.tip && <span className={`tag ${TIP_CLS[p.tip] ?? ''}`}>{p.tip}</span>}</td>
                    <td>{p.culturi.slice(0, 3).join(', ')}{p.nr_culturi > 3 ? <small> +{p.nr_culturi - 3}</small> : null}</td>
                    <td>{p.tinte.slice(0, 2).join(', ')}{p.nr_tinte > 2 ? <small> +{p.nr_tinte - 2}</small> : null}</td>
                    <td className="nowrap">{fmtDoza(p.doza_min, p.doza_max, p.unitate)}</td>
                    <td className="nowrap">{p.pauza_max ? `${p.pauza_max} zile` : '—'}</td>
                    <td><span className={`tag ${p.status === 'omologat' ? 'ok' : 'bad'}`}>{p.status === 'omologat' ? 'Omologat' : statusLabel(p.status, p.data_expirare)}</span></td>
                    <td className="nowrap"><span className={`radio ${sel?.produs_id === p.produs_id ? 'on' : ''}`} /> Selectează</td>
                  </tr>
                  {sel?.produs_id === p.produs_id && (
                    <tr className="calc-row"><td colSpan={8}><ProductCalc produs={p} onClose={() => setSel(null)} onSalveaza={onSalveaza} /></td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="cards">
          {rows.map(p => (
            <div key={p.produs_id} className={`pcard ${sel?.produs_id === p.produs_id ? 'sel' : ''} ${p.status !== 'omologat' ? 'dim' : ''}`}>
              <div className="pcard-top" onClick={() => selecteaza(p)}>
                <div>
                  <div className="rc-name">{p.produs}</div>
                  <div className="rc-as">{[p.substante, p.nume_secundare?.length ? `cunoscut și ca ${p.nume_secundare.join(', ')}` : null].filter(Boolean).join(' · ') || ' '}</div>
                </div>
                <span className={`radio ${sel?.produs_id === p.produs_id ? 'on' : ''}`} />
              </div>
              <div className="rc-tags">
                {p.tip && <span className={`tag ${TIP_CLS[p.tip] ?? ''}`}>{p.tip}</span>}
                <span className={`tag ${p.status === 'omologat' ? 'ok' : 'bad'}`}>{statusLabel(p.status, p.data_expirare)}</span>
                {p.grupa_toxicitate && <span className="tag">Tox. {p.grupa_toxicitate}</span>}
              </div>
              <div className="stats">
                <div className="stat"><div className="k">Doză</div><div className="v" style={{ fontSize: 16 }}>{fmtDoza(p.doza_min, p.doza_max, p.unitate)}</div></div>
                <div className="stat"><div className="k">Culturi</div><div className="v">{p.nr_culturi}</div><div className="h">{p.culturi.slice(0, 3).join(', ')}</div></div>
                <div className="stat"><div className="k">Dăunători / boli</div><div className="v">{p.nr_tinte}</div><div className="h">{p.tinte.slice(0, 2).join(', ')}</div></div>
              </div>
              {p.pauza_max ? <div className="alerts"><span className="al">Timp de pauză până la {p.pauza_max} zile</span></div> : null}
              {sel?.produs_id === p.produs_id
                ? <ProductCalc produs={p} onClose={() => setSel(null)} onSalveaza={onSalveaza} />
                : <button className="btn ghost full" onClick={() => selecteaza(p)}>Calculează doza</button>}
            </div>
          ))}
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="pager">
          <span>{rows.length} afișate · din {total}</span>
          <span className="pager-nav">
            <button className="chip" disabled={pagina === 0} onClick={() => setPagina(p => p - 1)}>‹</button>
            <span>{pagina + 1} / {nrPagini}</span>
            <button className="chip" disabled={pagina + 1 >= nrPagini} onClick={() => setPagina(p => p + 1)}>›</button>
          </span>
        </div>
      )}
    </section>
  )
}
