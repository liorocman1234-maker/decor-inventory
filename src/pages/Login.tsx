import { useState, type FormEvent } from 'react'
import { APP_NAME } from '../components/Layout'
import { Field } from '../components/ui'
import { useStore } from '../lib/store'

export default function Login() {
  const { signIn } = useStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setFailed(false)
    try {
      await signIn(email.trim(), password)
    } catch {
      setFailed(true)
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-ink p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-surface p-7">
        <h1 className="text-4xl">{APP_NAME}</h1>
        <p className="mt-1 mb-6 text-sm text-muted">כניסה למלאי של הסטודיו</p>
        <div className="space-y-4">
          <Field label="אימייל">
            <input className="input" type="email" dir="ltr" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="סיסמה">
            <input className="input" type="password" dir="ltr" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {failed ? <p className="text-sm text-wine">האימייל או הסיסמה לא נכונים. אפשר לנסות שוב.</p> : null}
          <button className="btn btn-primary w-full" disabled={busy}>
            {busy ? 'נכנסים...' : 'כניסה'}
          </button>
        </div>
      </form>
    </div>
  )
}
