// Date reale extrase din DB (29.10.2026) — folosite când VITE_MOCK=1 sau lipsesc cheile.
import type { Cultura, CulturaPentruTinta, Hit, InSezon, Recomandare } from '../lib/types'

const culturiAfide = [
  { id: 88, nume: 'Grâu', slug: 'grau' }, { id: 92, nume: 'Orz', slug: 'orz' }, { id: 93, nume: 'Ovăz', slug: 'ovaz' },
  { id: 1, nume: 'Porumb', slug: 'porumb' }, { id: 99, nume: 'Floarea-soarelui', slug: 'floarea-soarelui' }, { id: 100, nume: 'Rapiță', slug: 'rapita' },
]

export const HITS: Record<string, Hit[]> = {
  afi: [
    { entitate_tip: 'tinta', entitate_id: 1, eticheta: 'Afide (păduchi de frunze)', sub_eticheta: 'Aphididae', slug: 'afide', scor: 87.5, in_sezon: true, extra: { tip: 'daunator', culturi: culturiAfide, luni_sezon: [4, 5, 6, 9, 10] } },
  ],
  paduchi: [
    { entitate_tip: 'tinta', entitate_id: 1, eticheta: 'Afide (păduchi de frunze)', sub_eticheta: 'Aphididae', slug: 'afide', scor: 107.5, in_sezon: true, extra: { tip: 'daunator', culturi: culturiAfide, luni_sezon: [4, 5, 6, 9, 10] } },
  ],
  kar: [
    { entitate_tip: 'produs', entitate_id: 21, eticheta: 'KARATE ZEON', sub_eticheta: 'Insecticid', slug: 'karate-zeon', scor: 82.4, in_sezon: false, extra: { tip: 'Insecticid', status: 'omologat', nr_culturi: 6, nume_secundare: ['NINJA'] } },
  ],
  sept: [
    { entitate_tip: 'tinta', entitate_id: 21, eticheta: 'Septorioză', sub_eticheta: 'Zymoseptoria tritici', slug: 'septorioza', scor: 88, in_sezon: false, extra: { tip: 'boala', culturi: [{ id: 88, nume: 'Grâu', slug: 'grau' }], luni_sezon: [4, 5] } },
  ],
  rap: [
    { entitate_tip: 'cultura', entitate_id: 100, eticheta: 'Rapiță', sub_eticheta: 'oleaginoase', slug: 'rapita', scor: 99.9, in_sezon: false, extra: { categorie: 'oleaginoase' } },
  ],
}

export const IN_SEZON: InSezon[] = [
  { tinta_id: 1, tinta: 'Afide (păduchi de frunze)', tinta_slug: 'afide', tip: 'daunator', culturi: [{ nume: 'Grâu', slug: 'grau' }, { nume: 'Rapiță', slug: 'rapita' }] },
  { tinta_id: 37, tinta: 'Putregaiul negru al rapiței (fomoză)', tinta_slug: 'phoma', tip: 'boala', culturi: [{ nume: 'Rapiță', slug: 'rapita' }] },
  { tinta_id: 44, tinta: 'Buruieni dicotiledonate anuale', tinta_slug: 'buruieni-dicotiledonate', tip: 'buruiana', culturi: [{ nume: 'Grâu de toamnă', slug: 'grau-de-toamna' }, { nume: 'Rapiță', slug: 'rapita' }] },
  { tinta_id: 32, tinta: 'Tăciune zburător', tinta_slug: 'taciune', tip: 'boala', culturi: [{ nume: 'Grâu', slug: 'grau' }, { nume: 'Orz', slug: 'orz' }] },
]

export const CULTURI_PENTRU_TINTA: Record<string, CulturaPentruTinta[]> = {
  afide: [
    { cultura_id: 86, cultura: 'Grâu de toamnă', cultura_slug: 'grau-de-toamna', nr_produse: 3, potrivire: 'parinte' },
    { cultura_id: 87, cultura: 'Grâu de primăvară', cultura_slug: 'grau-de-primavara', nr_produse: 3, potrivire: 'parinte' },
    { cultura_id: 88, cultura: 'Grâu', cultura_slug: 'grau', nr_produse: 3, potrivire: 'exacta' },
    { cultura_id: 100, cultura: 'Rapiță', cultura_slug: 'rapita', nr_produse: 3, potrivire: 'exacta' },
    { cultura_id: 92, cultura: 'Orz', cultura_slug: 'orz', nr_produse: 2, potrivire: 'exacta' },
    { cultura_id: 93, cultura: 'Ovăz', cultura_slug: 'ovaz', nr_produse: 2, potrivire: 'exacta' },
    { cultura_id: 99, cultura: 'Floarea-soarelui', cultura_slug: 'floarea-soarelui', nr_produse: 2, potrivire: 'exacta' },
    { cultura_id: 1, cultura: 'Porumb', cultura_slug: 'porumb', nr_produse: 1, potrivire: 'exacta' },
  ],
}

const base = { cod_mod_actiune: null, formulare: null, toxic_albine: null, apa_min_l_ha: null, apa_max_l_ha: null, nr_tratamente_max: null, confidence: 40, needs_review: true, restrictii: [] as Recomandare['restrictii'] }
export const RECOMANDARI: Record<string, Recomandare[]> = {
  'grau-de-toamna|afide': [
    { ...base, recomandare_id: 53, produs_id: 12, produs: 'DECIS EXPERT 100 EC', produs_slug: 'decis-expert-100-ec', tip_produs: 'Insecticid', status_produs: 'omologat', grupa_toxicitate: '3', data_expirare: '2027-08-15', cultura: 'Grâu', cultura_slug: 'grau', potrivire_cultura: 'parinte', tinta: 'Afide (păduchi de frunze)', tinta_bruta: 'Afide', doza_min: 0.0625, doza_max: 0.0625, unitate: 'L/ha', pauza_zile: 30, mod_aplicare: 'foliar', moment_aplicare: null },
    { ...base, recomandare_id: 112, produs_id: 21, produs: 'KARATE ZEON', produs_slug: 'karate-zeon', tip_produs: 'Insecticid', status_produs: 'omologat', grupa_toxicitate: '3', data_expirare: '2027-08-31', cultura: 'Grâu', cultura_slug: 'grau', potrivire_cultura: 'parinte', tinta: 'Afide (păduchi de frunze)', tinta_bruta: 'Afide, tripsul, viermele rosu al paiului, musca suedeza', doza_min: 0.15, doza_max: 0.15, unitate: 'L/ha', pauza_zile: 30, mod_aplicare: 'foliar', moment_aplicare: 'se aplica la avertizare' },
    { ...base, recomandare_id: 77, produs_id: 16, produs: 'DELTAGRI', produs_slug: 'deltagri', tip_produs: 'Insecticid', status_produs: 'omologat', grupa_toxicitate: '3', data_expirare: '2027-08-15', cultura: 'Cereale păioase', cultura_slug: 'cereale-paioase', potrivire_cultura: 'parinte', tinta: 'Afide (păduchi de frunze)', tinta_bruta: 'Afide ale spicului, plosnita cerealelor, gandacul balos, viermele rosu al paiului', doza_min: 0.3, doza_max: 0.3, unitate: 'L/ha', pauza_zile: 30, mod_aplicare: 'foliar', moment_aplicare: null },
    { ...base, recomandare_id: 83, produs_id: 17, produs: 'CYCLONE', produs_slug: 'cyclone', tip_produs: 'Insecticid', status_produs: 'expirat', grupa_toxicitate: '3', data_expirare: '2026-03-31', cultura: 'Grâu', cultura_slug: 'grau', potrivire_cultura: 'parinte', tinta: 'Afide (păduchi de frunze)', tinta_bruta: 'Afide-vectori ai virusului ingalbenirii si piticirii, musca cerealelor', doza_min: 0.1, doza_max: 0.1, unitate: 'L/ha', pauza_zile: 35, mod_aplicare: 'foliar', moment_aplicare: null },
    { ...base, recomandare_id: 121, produs_id: 23, produs: 'LAMDEX EXTRA', produs_slug: 'lamdex-extra', tip_produs: 'Insecticid', status_produs: 'expirat', grupa_toxicitate: '3', data_expirare: '2026-08-31', cultura: 'Cereale păioase', cultura_slug: 'cereale-paioase', potrivire_cultura: 'parinte', tinta: 'Afide (păduchi de frunze)', tinta_bruta: 'Afide, tripsi, viermele rosu al paiului, gandacul balos, musca cerealelor', doza_min: 0.3, doza_max: 0.3, unitate: 'kg/ha', pauza_zile: 28, mod_aplicare: 'foliar', moment_aplicare: null },
  ],
}

export const CULTURI: Cultura[] = [
  { id: 86, nume: 'Grâu de toamnă', slug: 'grau-de-toamna', categorie: 'cereale', ordine: 1 },
  { id: 87, nume: 'Grâu de primăvară', slug: 'grau-de-primavara', categorie: 'cereale', ordine: 2 },
  { id: 88, nume: 'Grâu', slug: 'grau', categorie: 'cereale', ordine: 3 },
  { id: 90, nume: 'Orz de toamnă', slug: 'orz-de-toamna', categorie: 'cereale', ordine: 4 },
  { id: 92, nume: 'Orz', slug: 'orz', categorie: 'cereale', ordine: 6 },
  { id: 93, nume: 'Ovăz', slug: 'ovaz', categorie: 'cereale', ordine: 7 },
  { id: 1, nume: 'Porumb', slug: 'porumb', categorie: 'cereale', ordine: 8 },
  { id: 99, nume: 'Floarea-soarelui', slug: 'floarea-soarelui', categorie: 'oleaginoase', ordine: 9 },
  { id: 100, nume: 'Rapiță', slug: 'rapita', categorie: 'oleaginoase', ordine: 10 },
  { id: 20, nume: 'Soia', slug: 'soia', categorie: 'leguminoase', ordine: 11 },
  { id: 102, nume: 'Mazăre', slug: 'mazare', categorie: 'leguminoase', ordine: 12 },
]

import type { Omologare, ProdusCatalog } from '../lib/types'
const pc = (o: Partial<ProdusCatalog> & Pick<ProdusCatalog, 'produs_id' | 'produs' | 'produs_slug' | 'tip'>): ProdusCatalog => ({
  status: 'omologat', data_expirare: '2027-08-31', grupa_toxicitate: '3', formulare: null, nr_omologare: null, substante: null, nume_secundare: [],
  nr_culturi: 3, culturi: ['Grâu', 'Rapiță', 'Porumb'], nr_tinte: 4, tinte: ['Afide', 'Ploșnița cerealelor'], doza_min: 0.075, doza_max: 0.15, unitate: 'L/ha', pauza_max: 30, nr_recomandari: 6, total: 8, ...o,
})
export const CATALOG: ProdusCatalog[] = [
  pc({ produs_id: 21, produs: 'KARATE ZEON', produs_slug: 'karate-zeon', tip: 'Insecticid', nume_secundare: ['NINJA'], nr_culturi: 6, culturi: ['Grâu', 'Rapiță', 'Porumb', 'Floarea-soarelui', 'Lucernă', 'Muștar'], nr_tinte: 7, nr_recomandari: 9 }),
  pc({ produs_id: 12, produs: 'DECIS EXPERT 100 EC', produs_slug: 'decis-expert-100-ec', tip: 'Insecticid', doza_min: 0.0625, doza_max: 0.0625, data_expirare: '2027-08-15' }),
  pc({ produs_id: 16, produs: 'DELTAGRI', produs_slug: 'deltagri', tip: 'Insecticid', doza_min: 0.3, doza_max: 0.3, culturi: ['Cereale păioase', 'Rapiță'], nr_culturi: 2 }),
  pc({ produs_id: 37, produs: 'VERBEN', produs_slug: 'verben', tip: 'Fungicid', doza_min: 1, doza_max: 1, tinte: ['Septorioză', 'Făinare', 'Rugina brună'], culturi: ['Grâu', 'Orz'], nr_culturi: 2, pauza_max: 35, status: 'expirat', data_expirare: '2026-08-15' }),
  pc({ produs_id: 7, produs: 'AVIATOR XPRO 225 EC', produs_slug: 'aviator-xpro-225-ec', tip: 'Fungicid', doza_min: 0.8, doza_max: 1, tinte: ['Septorioză', 'Pătarea în ochi'], culturi: ['Grâu', 'Orz'], nr_culturi: 2, pauza_max: 35 }),
  pc({ produs_id: 6, produs: 'ATLANTIS FLEX', produs_slug: 'atlantis-flex', tip: 'Erbicid', doza_min: 0.2, doza_max: 0.33, unitate: 'kg/ha', tinte: ['Buruieni mono- și dicotiledonate'], culturi: ['Grâu de toamnă'], nr_culturi: 1, pauza_max: null, data_expirare: '2033-06-30' }),
  pc({ produs_id: 32, produs: 'ROUNDUP CLASSIC PRO', produs_slug: 'roundup-classic-pro', tip: 'Erbicid', doza_min: 2, doza_max: 6, tinte: ['Buruieni perene', 'Pir'], culturi: ['Terenuri necultivate', 'Toate culturile (înainte de semănat / plantat)'], nr_culturi: 2, pauza_max: null }),
  pc({ produs_id: 28, produs: 'MOSPILAN 20 SG', produs_slug: 'mospilan-20-sg', tip: 'Insecticid', doza_min: 0.1, doza_max: 0.15, unitate: 'kg/ha', culturi: ['Rapiță', 'Cartof'], nr_culturi: 2, pauza_max: 14, status: 'expirat', data_expirare: '2026-03-01' }),
]
const om = (o: Partial<Omologare> & Pick<Omologare, 'recomandare_id' | 'cultura' | 'cultura_slug' | 'tinta' | 'tinta_slug'>): Omologare => ({
  cultura_id: 0, tinta_id: 0, tip_tinta: 'daunator', tinta_bruta: o.tinta ?? '', doza_min: 0.15, doza_max: 0.15, unitate: 'L/ha', pauza_zile: 30, nr_tratamente_max: null, mod_aplicare: 'foliar', moment_aplicare: null, confidence: 40, ...o,
})
export const OMOLOGARI: Record<string, Omologare[]> = {
  'karate-zeon': [
    om({ recomandare_id: 112, cultura: 'Grâu', cultura_slug: 'grau', tinta: 'Afide (păduchi de frunze)', tinta_slug: 'afide', tinta_bruta: 'Afide, tripsul, viermele rosu al paiului, musca suedeza', moment_aplicare: 'se aplica la avertizare' }),
    om({ recomandare_id: 113, cultura: 'Grâu', cultura_slug: 'grau', tinta: 'Tripși', tinta_slug: 'tripsi', tinta_bruta: 'Afide, tripsul, viermele rosu al paiului, musca suedeza' }),
    om({ recomandare_id: 114, cultura: 'Grâu', cultura_slug: 'grau', tinta: 'Ploșnița cerealelor', tinta_slug: 'plosnita-cerealelor', doza_min: 0.15, doza_max: 0.2 }),
    om({ recomandare_id: 117, cultura: 'Porumb', cultura_slug: 'porumb', tinta: 'Afide (păduchi de frunze)', tinta_slug: 'afide', pauza_zile: 7 }),
    om({ recomandare_id: 118, cultura: 'Rapiță', cultura_slug: 'rapita', tinta: 'Gândacul lucios al rapiței', tinta_slug: 'gandacul-lucios', doza_min: 0.075, doza_max: 0.075, pauza_zile: 35 }),
    om({ recomandare_id: 119, cultura: 'Rapiță', cultura_slug: 'rapita', tinta: 'Gărgărița tulpinilor de rapiță', tinta_slug: 'gargarita-tulpinilor', doza_min: 0.075, doza_max: 0.075, pauza_zile: 35 }),
    om({ recomandare_id: 111, cultura: 'Floarea-soarelui', cultura_slug: 'floarea-soarelui', tinta: 'Afide (păduchi de frunze)', tinta_slug: 'afide', pauza_zile: 21 }),
  ],
}
