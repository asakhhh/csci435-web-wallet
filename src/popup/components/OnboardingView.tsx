import type { FormEvent } from 'react'
import type { FieldErrors, MessageType } from '../types'

type OnboardingMode = 'create' | 'import-seed' | 'import-private-key'

type Props = {
  message: { type: MessageType; text: string } | null
  isSaving: boolean
  onboardingMode: OnboardingMode
  seed: string
  privateKeyInput: string
  password: string
  fieldErrors: FieldErrors
  setOnboardingMode: (value: OnboardingMode) => void
  setSeed: (value: string) => void
  setPrivateKeyInput: (value: string) => void
  setMessage: (value: { type: MessageType; text: string } | null) => void
  setPassword: (value: string) => void
  handleCreate: (e: FormEvent) => void
  handleImport: (e: FormEvent) => void
  handleImportPrivateKey: (e: FormEvent) => void
  createMnemonic: () => string
}

export function OnboardingView(props: Props) {
  const {
    message,
    isSaving,
    onboardingMode,
    seed,
    privateKeyInput,
    password,
    fieldErrors,
    setOnboardingMode,
    setSeed,
    setPrivateKeyInput,
    setMessage,
    setPassword,
    handleCreate,
    handleImport,
    handleImportPrivateKey,
    createMnemonic,
  } = props

  return (
    <main className="card">
      <h1>HD Wallet Setup</h1>
      <p className="muted">Save this 12-word seed phrase securely before continuing.</p>
      {message && <p className={`message ${message.type}`}>{message.text}</p>}
      <section className="panel">
        <button
          type="button"
          onClick={() => {
            setOnboardingMode('create')
            setSeed(createMnemonic())
            setMessage(null)
          }}
          disabled={isSaving}
        >
          Create New Wallet
        </button>
        <button
          type="button"
          onClick={() => {
            setOnboardingMode('import-seed')
            setSeed('')
            setPrivateKeyInput('')
            setMessage(null)
          }}
          disabled={isSaving}
        >
          Import by Seed Phrase
        </button>
        <button
          type="button"
          onClick={() => {
            setOnboardingMode('import-private-key')
            setPrivateKeyInput('')
            setSeed('')
            setMessage(null)
          }}
          disabled={isSaving}
        >
          Import by Private Key
        </button>
      </section>
      {onboardingMode !== 'import-private-key' ? (
        <>
          <textarea value={seed} onChange={(e) => setSeed(e.target.value)} rows={3} />
          {fieldErrors.seed && <p className="field-error">{fieldErrors.seed}</p>}
        </>
      ) : (
        <>
          <input
            type="password"
            placeholder="Private key (0x...)"
            value={privateKeyInput}
            onChange={(e) => setPrivateKeyInput(e.target.value)}
          />
          {fieldErrors.privateKey && <p className="field-error">{fieldErrors.privateKey}</p>}
        </>
      )}
      <form
        onSubmit={
          onboardingMode === 'create'
            ? handleCreate
            : onboardingMode === 'import-seed'
              ? handleImport
              : handleImportPrivateKey
        }
      >
        <input type="password" placeholder="Master password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {fieldErrors.password && <p className="field-error">{fieldErrors.password}</p>}
        <button type="submit" disabled={isSaving}>
          {isSaving ? 'Saving...' : onboardingMode === 'create' ? 'Create Wallet' : 'Import Wallet'}
        </button>
      </form>
    </main>
  )
}
