import type { Parametri, Selectie } from './types'

const K_RECENTE = 'pesticid.recente'
const K_PARAM = 'pesticid.parametri'

export interface Recenta {
  eticheta: string
  selectie: Selectie
  la: number
}

function safeGet<T>(k: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(k)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function safeSet(k: string, v: unknown) {
  try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* privat / blocat */ }
}

export function citesteRecente(): Recenta[] {
  const zile7 = Date.now() - 7 * 24 * 3600 * 1000
  return safeGet<Recenta[]>(K_RECENTE, []).filter(r => r.la > zile7)
}

export function adaugaRecenta(eticheta: string, selectie: Selectie) {
  const rest = citesteRecente().filter(r => r.eticheta !== eticheta)
  safeSet(K_RECENTE, [{ eticheta, selectie, la: Date.now() }, ...rest].slice(0, 6))
}

export const PARAM_IMPLICITI: Parametri = { ha: 10, apa: 200, rezervor: 1000 }

export function citesteParametri(): Parametri {
  return { ...PARAM_IMPLICITI, ...safeGet<Partial<Parametri>>(K_PARAM, {}) }
}
export function salveazaParametri(p: Parametri) {
  safeSet(K_PARAM, p)
}
