import { useState, type FormEvent } from 'react'

export function AccountScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const [creating, setCreating] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const panel = window.panel
    if (!panel || busy) return
    setBusy(true)
    setNotice(null)
    const result = creating
      ? await panel.signUp(email.trim(), password)
      : await panel.signIn(email.trim(), password)
    setBusy(false)
    if (!result.ok) {
      setNotice(result.message)
      return
    }
    onSignedIn()
  }

  return (
    <form className="account-card" onSubmit={(event) => void submit(event)}>
      <h1>GeM Tender Panel</h1>
      <p className="sub">{creating ? 'Create an account' : 'Sign in'}</p>
      <label>
        Email
        <input
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <label>
        Password
        <input
          type="password"
          autoComplete={creating ? 'new-password' : 'current-password'}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      {notice ? <p className="form-note">{notice}</p> : null}
      <div className="account-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {creating ? 'Create account' : 'Sign in'}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          onClick={() => {
            setCreating((current) => !current)
            setNotice(null)
          }}
        >
          {creating ? 'Have an account? Sign in' : 'Need an account? Create one'}
        </button>
      </div>
    </form>
  )
}
