export type EntitateTip = 'tinta' | 'produs' | 'substanta' | 'cultura'

export interface Hit {
  entitate_tip: EntitateTip
  entitate_id: number
  eticheta: string
  sub_eticheta: string | null
  slug: string
  scor: number
  in_sezon: boolean
  extra: {
    tip?: 'daunator' | 'boala' | 'buruiana' | 'fiziologic' | 'altul' | string
    status?: string
    luni_sezon?: number[]
    culturi?: { id: number; nume: string; slug: string }[]
    nume_secundare?: string[]
    substante?: string
    nr_culturi?: number
    categorie?: string
    status_ue?: string
    nr_produse?: number
  }
}

export interface CulturaPentruTinta {
  cultura_id: number
  cultura: string
  cultura_slug: string
  nr_produse: number
  potrivire: 'exacta' | 'parinte'
}

export interface Recomandare {
  recomandare_id: number
  produs_id: number
  produs: string
  produs_slug: string
  tip_produs: string | null
  status_produs: string
  grupa_toxicitate: string | null
  formulare: string | null
  cod_mod_actiune: string | null
  toxic_albine: boolean | null
  data_expirare: string | null
  cultura: string
  cultura_slug: string
  potrivire_cultura: 'exacta' | 'parinte'
  tinta: string
  tinta_slug?: string      // prezent pe rândurile din v_recomandari
  tip_tinta?: string
  tinta_bruta: string
  doza_min: number | null
  doza_max: number | null
  unitate: string | null
  pauza_zile: number | null
  nr_tratamente_max: number | null
  mod_aplicare: string | null
  moment_aplicare: string | null
  apa_min_l_ha: number | null
  apa_max_l_ha: number | null
  confidence: number
  needs_review: boolean
  restrictii: { tip: string; severitate: 'info' | 'atentie' | 'pericol'; text: string }[]
}

export interface InSezon {
  tinta_id: number
  tinta: string
  tinta_slug: string
  tip: string
  culturi: { nume: string; slug: string }[]
}

export interface Cultura {
  id: number
  nume: string
  slug: string
  categorie: string | null
  ordine: number
}

export interface Selectie {
  tinta?: { slug: string; nume: string; tip?: string }
  cultura?: { slug: string; nume: string }
  produs?: { slug: string; nume: string }
}

export interface Parametri {
  ha: number
  apa: number
  rezervor: number
}

export interface ProdusCatalog {
  produs_id: number
  produs: string
  produs_slug: string
  tip: string | null
  status: string
  data_expirare: string | null
  grupa_toxicitate: string | null
  formulare: string | null
  nr_omologare: string | null
  substante: string | null
  nume_secundare: string[]
  nr_culturi: number
  culturi: string[]
  nr_tinte: number
  tinte: string[]
  doza_min: number | null
  doza_max: number | null
  unitate: string | null
  pauza_max: number | null
  nr_recomandari: number
  total: number
}

export interface Omologare {
  recomandare_id: number
  cultura_id: number
  cultura: string
  cultura_slug: string
  tinta_id: number | null
  tinta: string | null
  tinta_slug: string | null
  tip_tinta: string | null
  tinta_bruta: string
  doza_min: number | null
  doza_max: number | null
  unitate: string | null
  pauza_zile: number | null
  nr_tratamente_max: number | null
  mod_aplicare: string | null
  moment_aplicare: string | null
  confidence: number
}
