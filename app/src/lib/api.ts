import { MOCK, supabase } from './supabase'
import type { Cultura, CulturaPentruTinta, Hit, InSezon, Recomandare } from './types'
import * as F from '../mock/fixtures'

const luna = () => new Date().getMonth() + 1

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase!.rpc(fn, args)
  if (error) throw new Error(`${fn}: ${error.message}`)
  return data as T
}

export async function cauta(q: string, lim = 10): Promise<Hit[]> {
  const s = q.trim()
  if (s.length < 2) return []
  if (MOCK) {
    const k = Object.keys(F.HITS).find(k => s.toLowerCase().startsWith(k) || k.startsWith(s.toLowerCase()))
    return k ? F.HITS[k] : []
  }
  return rpc<Hit[]>('cauta', { q: s, lim, luna: luna() })
}

export async function inSezon(culturi?: string[], lim = 6): Promise<InSezon[]> {
  if (MOCK) return F.IN_SEZON
  return rpc<InSezon[]>('in_sezon', { luna: luna(), p_culturi_slug: culturi?.length ? culturi : null, lim })
}

export async function culturiPentruTinta(tintaSlug: string): Promise<CulturaPentruTinta[]> {
  if (MOCK) return F.CULTURI_PENTRU_TINTA[tintaSlug] ?? []
  return rpc<CulturaPentruTinta[]>('culturi_pentru_tinta', { p_tinta_slug: tintaSlug })
}

/** Produsele pentru cultură × țintă; calculul se face local (lib/calc.ts). */
export async function recomanda(culturaSlug: string, tintaSlug: string): Promise<Recomandare[]> {
  if (MOCK) return F.RECOMANDARI[`${culturaSlug}|${tintaSlug}`] ?? F.RECOMANDARI['grau-de-toamna|afide']
  return rpc<Recomandare[]>('recomanda', { p_cultura_slug: culturaSlug, p_tinta_slug: tintaSlug, p_lim: 30 })
}

/** Toate combinațiile cultură × țintă ale unui produs (pagina produsului). */
export async function recomandariProdus(produsSlug: string): Promise<Recomandare[]> {
  if (MOCK) return Object.values(F.RECOMANDARI).flat().filter(r => r.produs_slug === produsSlug)
  const { data, error } = await supabase!
    .from('v_recomandari')
    .select('*')
    .eq('produs_slug', produsSlug)
    .gte('confidence', 20)
    .order('cultura')
  if (error) throw new Error(error.message)
  return (data ?? []).map(r => ({ ...r, potrivire_cultura: 'exacta', restrictii: [] })) as Recomandare[]
}

/** Țintele cu produse pentru o cultură (când userul pornește de la cultură). */
export async function tintePentruCultura(culturaSlug: string): Promise<{ tinta: string; tinta_slug: string; tip_tinta: string; nr: number }[]> {
  if (MOCK) return [{ tinta: 'Afide (păduchi de frunze)', tinta_slug: 'afide', tip_tinta: 'daunator', nr: 3 }, { tinta: 'Septorioză', tinta_slug: 'septorioza', tip_tinta: 'boala', nr: 4 }]
  const { data, error } = await supabase!
    .from('v_recomandari')
    .select('tinta, tinta_slug, tip_tinta, produs_id')
    .eq('cultura_slug', culturaSlug)
    .gte('confidence', 20)
    .not('tinta_slug', 'is', null)
  if (error) throw new Error(error.message)
  const m = new Map<string, { tinta: string; tinta_slug: string; tip_tinta: string; p: Set<number> }>()
  for (const r of data ?? []) {
    const e = m.get(r.tinta_slug) ?? { tinta: r.tinta, tinta_slug: r.tinta_slug, tip_tinta: r.tip_tinta, p: new Set<number>() }
    e.p.add(r.produs_id); m.set(r.tinta_slug, e)
  }
  return [...m.values()].map(e => ({ tinta: e.tinta, tinta_slug: e.tinta_slug, tip_tinta: e.tip_tinta, nr: e.p.size })).sort((a, b) => b.nr - a.nr)
}

export async function culturi(): Promise<Cultura[]> {
  if (MOCK) return F.CULTURI
  const { data, error } = await supabase!
    .from('culturi')
    .select('id, nume, slug, categorie, ordine')
    .is('canonic_id', null)
    .not('slug', 'like', 'raw-%')
    .order('ordine')
  if (error) throw new Error(error.message)
  return data as Cultura[]
}

export async function raporteazaCautare(q: string): Promise<void> {
  if (MOCK) return
  await supabase!.rpc('raporteaza_cautare', { q })
}

// ---------- catalog + calculator per produs ----------
import type { Omologare, ProdusCatalog } from './types'

export interface FiltreCatalog { tip?: string | null; q?: string; doarOmologate?: boolean; lim?: number; offset?: number }

export async function catalogProduse(f: FiltreCatalog = {}): Promise<ProdusCatalog[]> {
  if (MOCK) {
    const q = (f.q ?? '').toLowerCase()
    return F.CATALOG.filter(p => (!f.tip || p.tip === f.tip) && (!f.doarOmologate || p.status === 'omologat') && (!q || p.produs.toLowerCase().includes(q)))
  }
  return rpc<ProdusCatalog[]>('catalog_produse', { p_tip: f.tip ?? null, p_q: f.q ?? null, p_doar_omologate: !!f.doarOmologate, p_lim: f.lim ?? 50, p_offset: f.offset ?? 0 })
}

export async function omologariProdus(slug: string): Promise<Omologare[]> {
  if (MOCK) return F.OMOLOGARI[slug] ?? F.OMOLOGARI['karate-zeon']
  return rpc<Omologare[]>('omologari_produs', { p_slug: slug })
}
