/**
 * Formulele calculatorului — aceleași ca în DB (recomanda()), dar rulate
 * local ca schimbarea ha / apă / rezervor să fie instantanee și să meargă offline.
 *
 *   cantitate_totala       = doza × ha
 *   apa_totala             = apa_l_ha × ha
 *   nr_umpleri             = apa_totala / rezervor_l
 *   cantitate_per_rezervor = doza × (rezervor_l / apa_l_ha)
 *   ultima umplere         = restul de apă → produs proporțional (aici se supradozează cel mai des)
 */
export interface Calcul {
  doza: number
  unitateProdus: 'L' | 'kg' | string
  perHa: boolean
  /** doza a fost dată ca concentrație și convertită la hectar prin volumul de apă */
  concentratie: boolean
  dozaPerHa: number
  cantitateTotala: number
  apaTotala: number
  nrUmpleri: number
  umpleriPline: number
  haPerRezervor: number
  cantitatePerRezervor: number
  concentratiePct: number
  ultima: { apa: number; produs: number; ha: number } | null
}

export function unitateProdus(unitate: string | null): string {
  if (!unitate) return ''
  if (unitate.startsWith('L')) return 'L'
  if (unitate.startsWith('kg')) return 'kg'
  if (unitate.startsWith('ml')) return 'ml'
  if (unitate.startsWith('g')) return 'g'
  return unitate
}

export function estePerHa(unitate: string | null): boolean {
  return unitate === 'L/ha' || unitate === 'kg/ha'
}

/** Doze exprimate ca concentrație (registrul ANF la legume/pomi/viță): „L/1000 L apă”, „kg/1000 L apă”, „%”. */
export function esteConcentratie(unitate: string | null): boolean {
  return unitate === 'L/1000 L apa' || unitate === 'kg/1000 L apa' || unitate === '%'
}

/** Se poate calcula per rezervor (pe hectar sau concentrație × volum de apă); nu și la tratamentul semințelor. */
export function seCalculeaza(unitate: string | null): boolean {
  return estePerHa(unitate) || esteConcentratie(unitate)
}

/** Doza echivalentă pe hectar: la concentrație depinde de volumul de apă (L/ha) ales. */
export function dozaPerHa(doza: number, unitate: string | null, apa: number): number {
  if (unitate === 'L/1000 L apa' || unitate === 'kg/1000 L apa') return (doza / 1000) * apa
  if (unitate === '%') return (doza / 100) * apa
  return doza
}

export function calculeaza(doza: number, unitate: string | null, ha: number, apa: number, rezervor: number): Calcul | null {
  if (!doza || !ha || !apa || !rezervor) return null
  const concentratie = esteConcentratie(unitate)
  const perHa = seCalculeaza(unitate)
  const d = dozaPerHa(doza, unitate, apa)
  const cantitateTotala = d * ha
  const apaTotala = apa * ha
  const nrUmpleri = apaTotala / rezervor
  const umpleriPline = Math.floor(nrUmpleri + 1e-9)
  const haPerRezervor = rezervor / apa
  const cantitatePerRezervor = d * haPerRezervor
  const restApa = apaTotala - umpleriPline * rezervor
  const ultima = restApa > 0.5 ? { apa: restApa, produs: d * (restApa / apa), ha: restApa / apa } : null
  return {
    doza,
    unitateProdus: unitateProdus(unitate),
    perHa,
    concentratie,
    dozaPerHa: d,
    cantitateTotala,
    apaTotala,
    nrUmpleri,
    umpleriPline,
    haPerRezervor,
    cantitatePerRezervor,
    concentratiePct: (d / apa) * 100,
    ultima,
  }
}
