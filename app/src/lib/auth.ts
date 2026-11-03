/**
 * Strategia de cont:
 *  - vizitatorul primește un cont ANONIM invizibil la prima deschidere (signInAnonymously) → are user_id,
 *    RLS-ul funcționează, recentele/parametrii se pot salva în DB;
 *  - când dă email / Google, aceeași identitate se leagă de contul anonim (linkIdentity) → istoricul rămâne;
 *  - evenimentul cont_creat vine din trigger-ul pe auth.identities (sursa de adevăr), nu din client.
 */
import type { Session, User } from '@supabase/supabase-js'
import { MOCK, supabase } from './supabase'
import { track } from './analytics'

export type Metoda = 'email' | 'google'

export interface StareCont {
  user: User | null
  anonim: boolean          // true = cont invizibil, fără email/Google
  email: string | null
}

export function stareDin(session: Session | null): StareCont {
  const u = session?.user ?? null
  return { user: u, anonim: !u || !!u.is_anonymous, email: u?.email ?? null }
}

export async function asiguraSesiune(): Promise<StareCont> {
  if (MOCK) return { user: null, anonim: true, email: null }
  const { data } = await supabase!.auth.getSession()
  if (data.session) return stareDin(data.session)
  const { data: anon, error } = await supabase!.auth.signInAnonymously()
  if (error) return { user: null, anonim: true, email: null }
  return stareDin(anon.session)
}

export function peSchimbare(cb: (s: StareCont) => void): () => void {
  if (MOCK) return () => {}
  const { data } = supabase!.auth.onAuthStateChange((ev, session) => {
    if (ev === 'SIGNED_IN' && session?.user && !session.user.is_anonymous) track('login', { metoda: session.user.app_metadata?.provider ?? 'necunoscut' })
    cb(stareDin(session))
  })
  return () => data.subscription.unsubscribe()
}

/** Email: link magic. Dacă userul e anonim, legăm identitatea de același cont. */
export async function contCuEmail(email: string): Promise<{ ok: boolean; mesaj: string }> {
  track('cont_metoda_click', { metoda: 'email' })
  if (MOCK) return { ok: true, mesaj: 'Mod demo: ți-am „trimis” linkul.' }
  const { data } = await supabase!.auth.getUser()
  const opts = { emailRedirectTo: location.origin }
  const { error } = data.user?.is_anonymous
    ? await supabase!.auth.updateUser({ email }, { emailRedirectTo: location.origin })
    : await supabase!.auth.signInWithOtp({ email, options: opts })
  if (error) return { ok: false, mesaj: error.message }
  return { ok: true, mesaj: `Ți-am trimis un link pe ${email}. Deschide-l de pe telefonul ăsta.` }
}

/** Google: OAuth. Pentru conturi anonime folosim linkIdentity ca să păstrăm istoricul. */
export async function contCuGoogle(): Promise<{ ok: boolean; mesaj: string }> {
  track('cont_metoda_click', { metoda: 'google' })
  if (MOCK) return { ok: true, mesaj: 'Mod demo: aici te-ar duce la Google.' }
  const { data } = await supabase!.auth.getUser()
  const { error } = data.user?.is_anonymous
    ? await supabase!.auth.linkIdentity({ provider: 'google', options: { redirectTo: location.origin } })
    : await supabase!.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin } })
  if (error) return { ok: false, mesaj: error.message }
  return { ok: true, mesaj: 'Te ducem la Google…' }
}

export async function iesi() {
  if (MOCK) return
  await supabase!.auth.signOut()
  await asiguraSesiune()   // revenim la un cont anonim nou
}
