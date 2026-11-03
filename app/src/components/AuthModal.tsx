import { useEffect, useState } from 'react'
import { track } from '../lib/analytics'
import { contCuEmail, contCuGoogle } from '../lib/auth'

export type TriggerCont = 'salveaza' | 'header' | 'recente_expirate' | 'parcela' | 'retras'

const TITLU: Record<TriggerCont, { h: string; p: string }> = {
  salveaza: { h: 'Salvează calculul pe orice telefon', p: 'Îți ținem minte calculele, parcelele și rezervorul. Fără parolă.' },
  header: { h: 'Intră în cont', p: 'Calculele tale, parcelele și istoricul — pe orice telefon.' },
  recente_expirate: { h: 'Calculele de săptămâna trecută?', p: 'Cu un cont le ai peste tot, nu doar pe telefonul ăsta.' },
  parcela: { h: 'Salvezi parcela ca să nu mai scrii hectarele?', p: 'Data viitoare: alegi parcela, apeși Calculează.' },
  retras: { h: 'Te anunțăm când un produs e retras', p: 'Spune-ne ce ai în magazie și primești alertă înainte de control.' },
}

interface Props { trigger: TriggerCont; onClose: () => void }

export default function AuthModal({ trigger, onClose }: Props) {
  const [email, setEmail] = useState('')
  const [stare, setStare] = useState<{ tip: 'idle' | 'trimis' | 'eroare'; mesaj?: string }>({ tip: 'idle' })
  const [busy, setBusy] = useState(false)
  const t = TITLU[trigger]
  const deschisLa = useState(() => Date.now())[0]

  const inregistrat = useState(() => ({ v: '' }))[0]
  useEffect(() => { if (inregistrat.v !== trigger) { inregistrat.v = trigger; track('cont_modal', { trigger }) } }, [trigger, inregistrat])
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') inchide() }
    document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const inchide = () => { track('cont_inchis', { trigger, dupa_ms: Date.now() - deschisLa, stare: stare.tip }); onClose() }

  const peEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(email)) { setStare({ tip: 'eroare', mesaj: 'Scrie o adresă de email validă.' }); return }
    setBusy(true)
    const r = await contCuEmail(email.trim())
    setBusy(false); setStare({ tip: r.ok ? 'trimis' : 'eroare', mesaj: r.mesaj })
  }
  const peGoogle = async () => { setBusy(true); const r = await contCuGoogle(); setBusy(false); if (!r.ok) setStare({ tip: 'eroare', mesaj: r.mesaj }) }

  return (
    <div className="modal-bg" onMouseDown={e => { if (e.target === e.currentTarget) inchide() }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="auth-h">
        <button className="modal-x" aria-label="Închide" onClick={inchide}>×</button>
        <h2 id="auth-h">{t.h}</h2>
        <p className="sub">{t.p}</p>

        <button className="btn full social" onClick={peGoogle} disabled={busy}>
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.8 6C12.3 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17.5z"/><path fill="#FBBC05" d="M10.4 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.8-6z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.7-4.1-13.6-9.9l-7.8 6C6.5 42.6 14.6 48 24 48z"/></svg>
          Continuă cu Google
        </button>
        <div className="or">sau pe email</div>
        {stare.tip === 'trimis' ? (
          <div className="notice">{stare.mesaj}</div>
        ) : (
          <form onSubmit={peEmail} className="auth-form">
            <input type="email" inputMode="email" autoComplete="email" placeholder="adresa@email.ro" value={email} onChange={e => setEmail(e.target.value)} aria-label="Email" />
            <button className="btn" type="submit" disabled={busy}>Trimite-mi linkul</button>
          </form>
        )}
        {stare.tip === 'eroare' && <div className="err">{stare.mesaj}</div>}
        <p className="fine">Fără parolă. Primești un link, îl deschizi, gata. Prin continuare accepți <a href="#">Termenii</a> și <a href="#">Politica de confidențialitate</a>.</p>
      </div>
    </div>
  )
}
