import { useEffect, useRef, useState } from 'react'

export interface Optiune { value: string; label: string; sub?: string }

interface Props {
  label: string
  value: string | null
  options: Optiune[]
  placeholder: string
  onChange: (v: string) => void
  /** permite și valori tastate (ex. hectare): se validează cu `parse` */
  liber?: { unitate: string; parse: (s: string) => number | null }
  disabled?: boolean
  autoOpen?: boolean
}

/** Câmp în stilul din Figma: etichetă mică, valoare mare, chevron; lista se deschide sub câmp. */
export default function Dropdown({ label, value, options, placeholder, onChange, liber, disabled, autoOpen }: Props) {
  const [open, setOpen] = useState(!!autoOpen)
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  useEffect(() => { if (open) { setQ(''); setIdx(0); setTimeout(() => inputRef.current?.focus(), 0) } }, [open])
  useEffect(() => { if (autoOpen && !disabled) setOpen(true) }, [autoOpen, disabled])

  const qn = q.trim().toLowerCase()
  const vizibile = options.filter(o => !qn || o.label.toLowerCase().includes(qn) || (o.sub ?? '').toLowerCase().includes(qn))
  const liberVal = liber && qn ? liber.parse(q) : null
  const lista: Optiune[] = liberVal !== null && liberVal !== undefined && !vizibile.some(o => o.value === String(liberVal))
    ? [{ value: String(liberVal), label: `${liberVal} ${liber!.unitate}` }, ...vizibile] : vizibile
  const curent = options.find(o => o.value === value)
  const afisat = curent?.label ?? (value && liber ? `${value} ${liber.unitate}` : null)

  const alege = (o: Optiune) => { onChange(o.value); setOpen(false) }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i + 1, lista.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (lista[idx]) alege(lista[idx]) }
    else if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div className={`dd ${open ? 'open' : ''} ${disabled ? 'disabled' : ''}`} ref={ref}>
      <button type="button" className="dd-field" disabled={disabled} onClick={() => setOpen(o => !o)} aria-haspopup="listbox" aria-expanded={open}>
        <span className="dd-label">{label}</span>
        <span className={`dd-value ${afisat ? '' : 'ph'}`}>{afisat ?? placeholder}</span>
        <svg className="dd-chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="dd-list" role="listbox">
          <input ref={inputRef} className="dd-search" value={q} onChange={e => { setQ(e.target.value); setIdx(0) }} onKeyDown={onKey}
            placeholder={liber ? `scrie sau alege (${liber.unitate})` : 'caută…'} inputMode={liber ? 'decimal' : 'text'} aria-label={`Caută ${label}`} />
          {lista.length === 0 && <div className="dd-empty">Nimic pentru „{q}”.</div>}
          {lista.map((o, i) => (
            <button type="button" key={o.value} role="option" aria-selected={o.value === value} className={`dd-opt ${i === idx ? 'active' : ''} ${o.value === value ? 'sel' : ''}`} onMouseEnter={() => setIdx(i)} onClick={() => alege(o)}>
              <span className="dd-opt-main"><span>{o.label}</span>{o.sub && <small>{o.sub}</small>}</span>
              <span className="dd-radio" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
