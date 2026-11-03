const nf = (max: number) => new Intl.NumberFormat('ro-RO', { maximumFractionDigits: max })

/** 1234.5 → "1.234,5"; dozele mici păstrează până la 4 zecimale (0,0625) */
export function num(v: number | null | undefined, max = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  if (Math.abs(v) < 1) return nf(4).format(v)
  return nf(max).format(v)
}

export function doza(min: number | null, max: number | null, unitate: string | null): string {
  if (min === null) return '—'
  const u = unitate ?? ''
  if (max !== null && max !== min) return `${num(min)} – ${num(max)} ${u}`
  return `${num(min)} ${u}`
}

export const LUNI = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie']

export function tipTintaLabel(tip?: string): string {
  switch (tip) {
    case 'daunator': return 'dăunător'
    case 'boala': return 'boală'
    case 'buruiana': return 'buruieni'
    case 'fiziologic': return 'fiziologic'
    default: return tip ?? ''
  }
}

export function statusLabel(status: string, dataExpirare: string | null): string {
  if (status === 'omologat' && dataExpirare) return `Omologat până la ${new Date(dataExpirare).toLocaleDateString('ro-RO')}`
  if (status === 'omologat') return 'Omologat'
  if (status === 'expirat') return `Omologare expirată${dataExpirare ? ' din ' + new Date(dataExpirare).toLocaleDateString('ro-RO') : ''}`
  if (status === 'retras') return 'Retras'
  if (status === 'interzis') return 'Interzis în UE'
  return status
}
