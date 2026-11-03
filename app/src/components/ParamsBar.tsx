import type { Parametri } from '../lib/types'

interface Props { p: Parametri; onChange: (p: Parametri) => void }

export default function ParamsBar({ p, onChange }: Props) {
  const set = (k: keyof Parametri) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value.replace(',', '.'))
    onChange({ ...p, [k]: Number.isFinite(v) ? v : 0 })
  }
  return (
    <div className="params">
      <label className="field"><span>Suprafață</span><div className="in"><input inputMode="decimal" value={p.ha || ''} onChange={set('ha')} placeholder="25" aria-label="Suprafață în hectare" /><span className="unit">ha</span></div></label>
      <label className="field"><span>Volum apă</span><div className="in"><input inputMode="decimal" value={p.apa || ''} onChange={set('apa')} placeholder="200" aria-label="Volum apă pe hectar" /><span className="unit">L/ha</span></div></label>
      <label className="field"><span>Rezervor</span><div className="in"><input inputMode="decimal" value={p.rezervor || ''} onChange={set('rezervor')} placeholder="1000" aria-label="Capacitate rezervor" /><span className="unit">L</span></div></label>
    </div>
  )
}
