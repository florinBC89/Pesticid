import { useEffect, useMemo, useState } from 'react'
import Dropdown from './Dropdown'
import { omologariProdus } from '../lib/api'
import { track } from '../lib/analytics'
import { calculeaza, seCalculeaza } from '../lib/calc'
import { num, doza as fmtDoza, tipTintaLabel } from '../lib/format'
import { citesteParametri, salveazaParametri } from '../lib/recents'
import type { Omologare, ProdusCatalog } from '../lib/types'

interface Props { produs: ProdusCatalog; onClose: () => void; onSalveaza?: () => void }

const HA = [1, 2, 3, 4, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, 300, 500]
const APA = [100, 150, 200, 250, 300, 400, 500, 600, 800, 1000]
const REZ = [200, 400, 600, 800, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000]
const parseNum = (s: string) => { const v = parseFloat(s.replace(',', '.')); return Number.isFinite(v) && v > 0 ? v : null }

/** „Calculator pesticide” — cardul care apare după ce selectezi un produs (din Figma). */
export default function ProductCalc({ produs, onClose, onSalveaza }: Props) {
  const [om, setOm] = useState<Omologare[] | null>(null)
  const [cultura, setCultura] = useState<string | null>(null)
  const [tinta, setTinta] = useState<string | null>(null)
  const init = citesteParametri()
  const [ha, setHa] = useState<string | null>(init.ha ? String(init.ha) : null)
  const [apa, setApa] = useState<string | null>(init.apa ? String(init.apa) : null)
  const [rez, setRez] = useState<string | null>(init.rezervor ? String(init.rezervor) : null)
  const [calculat, setCalculat] = useState(false)
  const [pas, setPas] = useState(0)   // care dropdown se deschide automat

  useEffect(() => { omologariProdus(produs.produs_slug).then(setOm).catch(() => setOm([])) }, [produs.produs_slug])
  useEffect(() => { if (om && om.length === 1) { setCultura(om[0].cultura_slug); setTinta(om[0].tinta_slug) } }, [om])

  const culturi = useMemo(() => {
    const m = new Map<string, { label: string; n: number }>()
    for (const o of om ?? []) { const e = m.get(o.cultura_slug) ?? { label: o.cultura, n: 0 }; e.n++; m.set(o.cultura_slug, e) }
    return [...m.entries()].map(([value, e]) => ({ value, label: e.label, sub: `${e.n} dăunători / boli` }))
  }, [om])
  const tinte = useMemo(() => {
    const m = new Map<string, { label: string; sub: string }>()
    for (const o of (om ?? []).filter(o => o.cultura_slug === cultura && o.tinta_slug)) m.set(o.tinta_slug!, { label: o.tinta!, sub: `${tipTintaLabel(o.tip_tinta ?? '')} · ${fmtDoza(o.doza_min, o.doza_max, o.unitate)}` })
    return [...m.entries()].map(([value, e]) => ({ value, ...e }))
  }, [om, cultura])
  const rec = useMemo(() => (om ?? []).find(o => o.cultura_slug === cultura && o.tinta_slug === tinta) ?? null, [om, cultura, tinta])

  const gata = !!(rec && ha && apa && rez)
  const c = rec && gata ? calculeaza(rec.doza_min ?? 0, rec.unitate, Number(ha), Number(apa), Number(rez)) : null
  const perHa = seCalculeaza(rec?.unitate ?? null)

  const calculeazaClick = () => {
    if (!gata) return
    salveazaParametri({ ha: Number(ha), apa: Number(apa), rezervor: Number(rez) })
    track('calcul', { produs: produs.produs_slug, cultura, tinta, ha: Number(ha), apa: Number(apa), rezervor: Number(rez), din: 'catalog' })
    setCalculat(true)
  }

  return (
    <div className="pc" role="dialog" aria-label={`Calculator ${produs.produs}`}>
      <div className="pc-head">
        <div>
          <div className="pc-title">Calculator pesticide</div>
          <div className="pc-sub">{produs.produs}{produs.tip ? ` · ${produs.tip}` : ''}</div>
        </div>
        <button className="modal-x" aria-label="Închide" onClick={onClose}>×</button>
      </div>

      {om === null ? <div className="skel" style={{ height: 180, marginTop: 0 }} /> : om.length === 0 ? (
        <div className="notice">Nu avem omologări verificate pentru acest produs. Verifică eticheta.</div>
      ) : (
        <div className="pc-form">
          <Dropdown label="Cultură" value={cultura} options={culturi} placeholder="Alege cultura" autoOpen={pas === 0 && !cultura}
            onChange={v => { setCultura(v); setTinta(null); setCalculat(false); setPas(1) }} />
          <Dropdown label="Dăunător / boală / buruiană" value={tinta} options={tinte} placeholder={cultura ? 'Alege dăunătorul' : 'întâi cultura'} disabled={!cultura} autoOpen={pas === 1 && !tinta}
            onChange={v => { setTinta(v); setCalculat(false); setPas(2) }} />
          <div className="pc-row">
            <Dropdown label="Suprafață" value={ha} options={HA.map(v => ({ value: String(v), label: `${v} ha` }))} placeholder="număr de hectare" liber={{ unitate: 'ha', parse: parseNum }} autoOpen={pas === 2 && !ha}
              onChange={v => { setHa(v); setCalculat(false); setPas(3) }} />
            <Dropdown label="Volum de apă" value={apa} options={APA.map(v => ({ value: String(v), label: `${v} L/ha` }))} placeholder="L/ha" liber={{ unitate: 'L/ha', parse: parseNum }} autoOpen={pas === 3 && !apa}
              onChange={v => { setApa(v); setCalculat(false); setPas(4) }} />
          </div>
          <Dropdown label="Rezervor" value={rez} options={REZ.map(v => ({ value: String(v), label: `${num(v, 0)} L` }))} placeholder="capacitate rezervor" liber={{ unitate: 'L', parse: parseNum }} autoOpen={pas === 4 && !rez}
            onChange={v => { setRez(v); setCalculat(false) }} />

          {rec && (
            <div className="pc-doza">
              Doză omologată: <b>{fmtDoza(rec.doza_min, rec.doza_max, rec.unitate)}</b>
              {rec.pauza_zile ? <> · pauză {rec.pauza_zile} zile</> : null}
              {rec.moment_aplicare ? <> · {rec.moment_aplicare}</> : null}
            </div>
          )}

          {!calculat ? (
            <button className="btn full" disabled={!gata} onClick={calculeazaClick}>Calculează</button>
          ) : c && perHa ? (
            <div className="pc-res">
              <div className="tank">
                <div className="k">PER REZERVOR DE {num(Number(rez), 0)} L</div>
                <div className="v">{num(c.cantitatePerRezervor, 3)}<small>{c.unitateProdus} produs</small></div>
                <div className="l"><b>{c.umpleriPline} umpler{c.umpleriPline === 1 ? 'e' : 'i'} pline</b> · {num(c.haPerRezervor, 1)} ha fiecare · concentrație {num(c.concentratiePct, 4)} %</div>
                {c.ultima && <div className="ultima">ultima umplere: {num(c.ultima.ha, 1)} ha → {num(c.ultima.apa, 0)} L apă + <b>{num(c.ultima.produs, 3)} {c.unitateProdus}</b></div>}
              </div>
              <div className="stats">
                <div className="stat"><div className="k">Doză</div><div className="v">{num(rec!.doza_min ?? 0)}<small>{rec!.unitate}</small></div></div>
                <div className="stat"><div className="k">Produs total</div><div className="v">{num(c.cantitateTotala, 3)}<small>{c.unitateProdus}</small></div><div className="h">{num(c.dozaPerHa, 3)} × {ha} ha</div></div>
                <div className="stat"><div className="k">Apă totală</div><div className="v">{num(c.apaTotala, 0)}<small>L</small></div><div className="h">{apa} × {ha}</div></div>
              </div>
              {c.concentratie && <div className="pc-sub">Doza e dată la volumul de apă ({rec!.unitate}): la {apa} L apă/ha înseamnă {num(c.dozaPerHa, 3)} {c.unitateProdus}/ha. Dacă schimbi volumul de apă, se schimbă și cantitatea de produs.</div>}
              {rec!.doza_max !== rec!.doza_min && <div className="pc-sub">Calculat pe doza minimă din interval ({fmtDoza(rec!.doza_min, rec!.doza_max, rec!.unitate)}). Pentru presiune mare de atac, eticheta permite până la {num(rec!.doza_max ?? 0)} {rec!.unitate}.</div>}
              <div className="rc-actions">
                {onSalveaza && <button className="btn" onClick={onSalveaza}>Salvează calculul</button>}
                <button className="btn ghost" onClick={() => setCalculat(false)}>Modifică</button>
              </div>
            </div>
          ) : (
            <div className="notice">Doza e pe sămânță ({rec?.unitate}) — calculul per rezervor nu se aplică.</div>
          )}
        </div>
      )}
    </div>
  )
}
