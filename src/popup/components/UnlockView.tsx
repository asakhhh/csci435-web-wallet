import type { FormEvent } from 'react'
import type { FieldErrors, MessageType } from '../types'

type Props = {
  message: { type: MessageType; text: string } | null
  password: string
  isUnlocking: boolean
  fieldErrors: FieldErrors
  setPassword: (value: string) => void
  handleUnlock: (e: FormEvent) => void
  switchWalletFromUnlock: () => void
}

export function UnlockView(props: Props) {
  const { message, password, isUnlocking, fieldErrors, setPassword, handleUnlock, switchWalletFromUnlock } = props

  return (
    <main className="card">
      <h1>Unlock Wallet</h1>
      {message && <p className={`message ${message.type}`}>{message.text}</p>}
      <form onSubmit={handleUnlock}>
        <input type="password" placeholder="Master password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {fieldErrors.unlockPassword && <p className="field-error">{fieldErrors.unlockPassword}</p>}
        <button type="submit" disabled={isUnlocking}>{isUnlocking ? 'Unlocking...' : 'Unlock'}</button>
        <button type="button" className="danger" onClick={switchWalletFromUnlock} disabled={isUnlocking}>
          Use Different Wallet
        </button>
      </form>
    </main>
  )
}
