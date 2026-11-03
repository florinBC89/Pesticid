/**
 * Evenimente de produs → public.evenimente (prin rpc inregistreaza_eveniment).
 * Răspund la: cât de repede își fac oamenii cont și cu ce metodă, ce caută prima dată,
 * când cumpără primul abonament. Vezi supabase/migrations/20261029_07_analytics.sql.
 */
import { MOCK, supabase } from './supabase'

export type Eveniment =
  | 'vizita' | 'cautare' | 'cautare_fara_rezultat' | 'alegere' | 'cultura_aleasa' | 'calcul'
  | 'salveaza_click' | 'cont_modal' | 'cont_metoda_click' | 'login' | 'cont_inchis'
  | 'paywall_afisat' | 'trial_start'

const K_DEVICE = 'pesticid.device'
const K_SESIUNE = 'pesticid.sesiune'

function uuid() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}
function stocat(storage: Storage, k: string): string {
  try {
    let v = storage.getItem(k)
    if (!v) { v = uuid(); storage.setItem(k, v) }
    return v
  } catch { return 'na' }
}

export const deviceId = () => stocat(localStorage, K_DEVICE)
export const sesiuneId = () => stocat(sessionStorage, K_SESIUNE)

const coada: { tip: Eveniment; payload: Record<string, unknown> }[] = []
let timer: number | undefined

async function trimite() {
  timer = undefined
  const lot = coada.splice(0, coada.length)
  if (!lot.length) return
  if (MOCK) { for (const e of lot) console.debug('[eveniment]', e.tip, e.payload); return }
  try {
    for (const e of lot) {
      await supabase!.rpc('inregistreaza_eveniment', {
        p_tip: e.tip, p_payload: e.payload, p_device_id: deviceId(), p_sesiune_id: sesiuneId(), p_url: location.pathname + location.search,
      })
    }
  } catch { /* analytics-ul nu blochează niciodată aplicația */ }
}

export function track(tip: Eveniment, payload: Record<string, unknown> = {}) {
  coada.push({ tip, payload })
  if (timer === undefined) timer = window.setTimeout(trimite, 400)
}

/** la închiderea paginii trimitem ce a rămas în coadă */
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { if (coada.length) void trimite() })
}

export function trackVizita() {
  // o singură „vizită” per sesiune (și robust la dubla rulare a efectelor în React StrictMode)
  try { if (sessionStorage.getItem('pesticid.vizita')) return; sessionStorage.setItem('pesticid.vizita', '1') } catch { /* ignorăm */ }
  let utm: Record<string, string> = {}
  try {
    const sp = new URLSearchParams(location.search)
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign']) if (sp.get(k)) utm[k] = sp.get(k)!
  } catch { utm = {} }
  track('vizita', { referrer: document.referrer?.slice(0, 200) || null, ...utm, standalone: matchMedia('(display-mode: standalone)').matches })
}
