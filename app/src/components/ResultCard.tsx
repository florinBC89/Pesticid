import { useState } from 'react'
import { calculeaza, seCalculeaza } from '../lib/calc'
import { doza as fmtDoza, num, statusLabel } from '../lib/format'
import type { Parametri, Recomandare } from '../lib/types'

interface Props { r: Recomandare; p: Parametri; best?: boolean; onSalveaza?: () => void }

const TIP_CLS: Record<string, string> = { Insecticid: 'ins', Erbicid: 'erb', Fungicid: 'fun' }

export default function ResultCard({ r, p, best, onSalveaza }: Props) {
  const min = r.doza_min ?? 0, max = r.doza_max ?? min
  const [doza, setDoza] = useState(min)
  const c = calculeaza(doza, r.unitate, p.ha, p.apa, p.rezervor)
  const u = c?.unitateProdus ?? ''
  const dim = r.status_produs !== 'omologat'
  const perHa = seCalculeaza(r.unitate)
  const alerte: { t: string; k: 'warn' | 'info' | 'danger' }[] = []
  if (r.pauza_zile) alerte.push({ t: `Timp de pauză: ${r.pauza_zile} de zile până la recoltare`, k: 'warn' })
  if (r.nr_tratamente_max) alerte.push({ t: `Max. ${r.nr_tratamente_max} tratament${r.nr_tratamente_max > 1 ? 'e' : ''} / sezon`, k: 'info' })
  if (r.moment_aplicare) alerte.push({ t: r.moment_aplicare, k: 'info' })
  if (r.toxic_albine) alerte.push({ t: 'Toxic pentru albine — nu aplica la înflorit', k: 'danger' })
  for (const x of r.restrictii ?? []) alerte.push({ t: x.text, k: x.severitate === 'pericol' ? 'danger' : x.severitate === 'info' ? 'info' : 'warn' })
  if (dim) alerte.push({ t: statusLabel(r.status_produs, r.data_expirare) + ' — verifică în registrul ANF înainte de aplicare', k: 'danger' })

  return (
    <article className={`rcard ${best ? 'best' : ''} ${dim ? 'dim' : ''}`}>
      <div className="rc-top">
        <div>
          <div className="rc-name">{r.produs}</div>
          <div className="rc-as">
            {[r.tip_produs, r.formulare, r.cod_mod_actiune].filter(Boolean).join(' · ')}
            {r.potrivire_cultura === 'parinte' && <> · omologare la nivel de <b>{r.cultura}</b></>}
          </div>
          <div className="rc-tags">
            {r.tip_produs && <span className={`tag ${TIP_CLS[r.tip_produs] ?? ''}`}>{r.tip_produs}</span>}
            <span className={`tag ${dim ? 'bad' : 'ok'}`}>{statusLabel(r.status_produs, r.data_expirare)}</span>
            {r.grupa_toxicitate && <span className="tag">Grupă toxicitate {r.grupa_toxicitate}</span>}
            {r.needs_review && <span className="tag warn">neverificat pe etichetă</span>}
          </div>
        </div>
      </div>

      <div className="rc-body">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="stats">
            <div className="stat">
              <div className="k">Doză omologată</div>
              <div className="v">{num(doza)}<small>{r.unitate}</small></div>
              <div className="h">{max !== min ? `interval etichetă ${fmtDoza(min, max, r.unitate)}` : 'doză fixă pe etichetă'}</div>
            </div>
            <div className="stat">
              <div className="k">Produs total · {num(p.ha)} ha</div>
              <div className="v">{c && perHa ? num(c.cantitateTotala, 3) : '—'}<small>{u}</small></div>
              <div className="h">= {num(c?.dozaPerHa ?? doza, 3)} × {num(p.ha)}</div>
            </div>
            <div className="stat">
              <div className="k">Apă totală</div>
              <div className="v">{c ? num(c.apaTotala, 0) : '—'}<small>L</small></div>
              <div className="h">= {num(p.apa, 0)} L/ha × {num(p.ha)}</div>
            </div>
          </div>
          {max !== min && (
            <div className="doza-range">
              <span>{num(min)}</span>
              <input type="range" min={min} max={max} step={(max - min) / 20} value={doza} onChange={e => setDoza(parseFloat(e.target.value))} aria-label="Doza aleasă din interval" />
              <span>{num(max)} {r.unitate}</span>
            </div>
          )}
          {!perHa && <div className="notice">Doza e pe sămânță ({r.unitate}), nu pe hectar — calculul per rezervor nu se aplică la tratamentul semințelor.</div>}
          {c?.concentratie && <div className="notice">Doza e dată la volumul de apă ({r.unitate}): la {num(p.apa, 0)} L apă/ha înseamnă {num(c.dozaPerHa, 3)} {u}/ha.</div>}
        </div>

        <div className="tank">
          <div className="k">PER REZERVOR DE {num(p.rezervor, 0)} L</div>
          {c && perHa ? (<>
            <div className="v">{num(c.cantitatePerRezervor, 3)}<small>{u} produs</small></div>
            <div className="l"><b>{c.umpleriPline} umpler{c.umpleriPline === 1 ? 'e' : 'i'} pline</b> × {num(p.rezervor, 0)} L apă · {num(c.haPerRezervor, 1)} ha fiecare</div>
            <div className="l">concentrație {num(c.concentratiePct, 4)} %</div>
            {c.ultima && <div className="ultima">ultima umplere (parțială): {num(c.ultima.ha, 1)} ha → {num(c.ultima.apa, 0)} L apă + <b>{num(c.ultima.produs, 3)} {u}</b> produs</div>}
          </>) : <div className="l">Completează suprafața, apa și rezervorul.</div>}
        </div>
      </div>

      {alerte.length > 0 && <div className="alerts">{alerte.map((a, i) => <span key={i} className={`al ${a.k}`}>{a.t}</span>)}</div>}
      {r.tinta_bruta && r.tinta_bruta !== r.tinta && <div className="rc-as">Pe etichetă: {r.tinta_bruta}</div>}
      {onSalveaza && !dim && (
        <div className="rc-actions">
          <button className="btn" onClick={onSalveaza}>Salvează calculul</button>
          <a className="btn ghost" href={`https://wa.me/?text=${encodeURIComponent(`${r.produs} · ${r.tinta} la ${r.cultura}: ${num(doza)} ${r.unitate} × ${num(p.ha)} ha = ${c && perHa ? num(c.cantitateTotala, 3) : '—'} ${u}; per rezervor ${num(p.rezervor, 0)} L: ${c && perHa ? num(c.cantitatePerRezervor, 3) : '—'} ${u}. Calculat cu Pesticid — ${location.origin}`)}`} target="_blank" rel="noopener">Trimite pe WhatsApp</a>
        </div>
      )}
    </article>
  )
}
