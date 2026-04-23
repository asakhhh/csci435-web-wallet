import { ethers } from 'ethers'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { clearWallet, decryptSeed, encryptSeed, loadWallet, saveWallet, type StoredWallet } from '../utils/storageUtils'
import { createMnemonic, deriveAccount, deriveAccounts, getBalance, signAndSendTransaction, validateMnemonic } from '../utils/walletUtils'

type Mode = 'loading' | 'onboarding' | 'unlock' | 'dashboard'
type MessageType = 'error' | 'success' | 'info'
type FieldErrors = {
  seed?: string
  password?: string
  unlockPassword?: string
  to?: string
  amount?: string
}

function App() {
  const [mode, setMode] = useState<Mode>('loading')
  const [stored, setStored] = useState<StoredWallet | null>(null)
  const [seed, setSeed] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<{ type: MessageType; text: string } | null>(null)
  const [balance, setBalance] = useState('0')
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('0.001')
  const [txHash, setTxHash] = useState('')
  const [onboardingMode, setOnboardingMode] = useState<'create' | 'import'>('create')
  const [isSaving, setIsSaving] = useState(false)
  const [isUnlocking, setIsUnlocking] = useState(false)
  const [isAddingAccount, setIsAddingAccount] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [isLoadingBalance, setIsLoadingBalance] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  useEffect(() => {
    ;(async () => {
      const existing = await loadWallet()
      setStored(existing)
      if (!existing) {
        setSeed(createMnemonic())
        setMode('onboarding')
      } else {
        setMode('unlock')
      }
    })()
  }, [])

  const accounts = useMemo(() => {
    if (!seed || !stored) return []
    return deriveAccounts(seed, Math.max(stored.accountCount, 1))
  }, [seed, stored])

  useEffect(() => {
    const primary = accounts[0]
    if (!primary) return
    void refreshBalance(primary.address)
  }, [accounts])

  async function refreshBalance(address: string) {
    setIsLoadingBalance(true)
    try {
      const updatedBalance = await getBalance(address)
      setBalance(updatedBalance)
    } catch {
      setBalance('0')
      setMessage({ type: 'error', text: 'Failed to load balance from Sepolia RPC.' })
    } finally {
      setIsLoadingBalance(false)
    }
  }

  function normalizeSeed(value: string): string {
    return value.trim().replace(/\s+/g, ' ')
  }

  async function persistWallet() {
    const normalizedSeed = normalizeSeed(seed)
    const nextErrors: FieldErrors = {}
    if (password.length < 8) {
      nextErrors.password = 'Password must be at least 8 characters.'
    }
    if (!normalizedSeed) {
      nextErrors.seed = 'Seed phrase is required.'
    }
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors((prev) => ({ ...prev, ...nextErrors }))
      setMessage({ type: 'error', text: 'Please fix the highlighted fields.' })
      return
    }

    setIsSaving(true)
    try {
      const encrypted = await encryptSeed(normalizedSeed, password)
      const next = { ...encrypted, accountCount: 1 }
      await saveWallet(next)
      await chrome.storage.session.set({ sessionPassword: password })
      setSeed(normalizedSeed)
      setStored(next)
      setMode('dashboard')
      setMessage({ type: 'success', text: onboardingMode === 'create' ? 'Wallet created and unlocked.' : 'Wallet imported and unlocked.' })
    } catch {
      setMessage({ type: 'error', text: 'Failed to save wallet. Please try again.' })
    } finally {
      setIsSaving(false)
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setMessage(null)
    setFieldErrors({})
    if (!validateMnemonic(normalizeSeed(seed))) {
      setFieldErrors({ seed: 'Generated seed phrase is invalid. Generate a new one.' })
      setMessage({ type: 'error', text: 'Generated seed phrase is invalid. Generate a new one.' })
      return
    }
    await persistWallet()
  }

  async function handleImport(e: FormEvent) {
    e.preventDefault()
    setMessage(null)
    setFieldErrors({})
    if (!validateMnemonic(normalizeSeed(seed))) {
      setFieldErrors({ seed: 'Invalid seed phrase. Please enter a valid BIP39 phrase.' })
      setMessage({ type: 'error', text: 'Invalid seed phrase.' })
      return
    }
    await persistWallet()
  }

  async function handleUnlock(e: FormEvent) {
    e.preventDefault()
    if (!stored) return
    setFieldErrors({})
    if (!password) {
      setFieldErrors({ unlockPassword: 'Password is required.' })
      setMessage({ type: 'error', text: 'Enter your password to unlock.' })
      return
    }
    setIsUnlocking(true)
    setMessage(null)
    try {
      const unlocked = await decryptSeed(stored, password)
      await chrome.storage.session.set({ sessionPassword: password })
      setSeed(unlocked)
      setMode('dashboard')
      setMessage({ type: 'success', text: 'Wallet unlocked.' })
    } catch {
      setMessage({ type: 'error', text: 'Wrong password.' })
    } finally {
      setIsUnlocking(false)
    }
  }

  async function addAccount() {
    if (!stored) return
    setIsAddingAccount(true)
    setMessage(null)
    try {
      const updated = { ...stored, accountCount: stored.accountCount + 1 }
      await saveWallet(updated)
      setStored(updated)
      setMessage({ type: 'success', text: 'New account derived successfully.' })
    } catch {
      setMessage({ type: 'error', text: 'Failed to derive a new account.' })
    } finally {
      setIsAddingAccount(false)
    }
  }

  function validateSendInputs(): string | null {
    const nextErrors: FieldErrors = {}
    if (!seed) return 'Wallet is locked. Unlock before sending.'
    if (!to.trim()) nextErrors.to = 'Destination address is required.'
    else if (!ethers.isAddress(to.trim())) nextErrors.to = 'Destination address is invalid.'
    if (!amount.trim()) nextErrors.amount = 'Amount is required.'
    const parsedNumber = Number(amount)
    if (amount.trim() && (!Number.isFinite(parsedNumber) || parsedNumber <= 0)) {
      nextErrors.amount = 'Amount must be a positive number.'
    }
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors((prev) => ({ ...prev, ...nextErrors }))
      return 'Please fix the highlighted send fields.'
    }
    return null
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault()
    setMessage(null)
    setTxHash('')
    setFieldErrors((prev) => ({ ...prev, to: undefined, amount: undefined }))
    const sendInputError = validateSendInputs()
    if (sendInputError) {
      setMessage({ type: 'error', text: sendInputError })
      return
    }
    setIsSending(true)
    try {
      const hash = await signAndSendTransaction(seed, 0, to.trim(), amount.trim())
      setTxHash(hash)
      setMessage({ type: 'success', text: 'Transaction signed and broadcast successfully.' })
    } catch (err) {
      setMessage({ type: 'error', text: (err as Error).message })
    } finally {
      setIsSending(false)
    }
  }

  async function lockWallet() {
    await chrome.storage.session.remove('sessionPassword')
    setSeed('')
    setPassword('')
    setTo('')
    setAmount('0.001')
    setTxHash('')
    setMode('unlock')
    setMessage({ type: 'info', text: 'Wallet locked.' })
  }

  async function switchWallet(skipConfirmation = false) {
    if (!skipConfirmation && !window.confirm('This clears the current wallet from extension storage. Continue?')) return
    await chrome.storage.session.remove('sessionPassword')
    await clearWallet()
    setStored(null)
    setSeed('')
    setPassword('')
    setTo('')
    setAmount('0.001')
    setTxHash('')
    setOnboardingMode('import')
    setMode('onboarding')
    setMessage({ type: 'info', text: 'Current wallet removed. Import another existing wallet.' })
  }

  async function switchWalletFromUnlock() {
    if (!window.confirm('Switch to another wallet by removing the current local wallet?')) return
    await switchWallet(true)
  }

  if (mode === 'loading') return <main className="card">Loading wallet...</main>

  if (mode === 'onboarding') {
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
              setOnboardingMode('import')
              setSeed('')
              setMessage(null)
            }}
            disabled={isSaving}
          >
            Import Existing Wallet
          </button>
        </section>
        <textarea value={seed} onChange={(e) => setSeed(e.target.value)} rows={3} />
        {fieldErrors.seed && <p className="field-error">{fieldErrors.seed}</p>}
        <form onSubmit={onboardingMode === 'create' ? handleCreate : handleImport}>
          <input type="password" placeholder="Master password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {fieldErrors.password && <p className="field-error">{fieldErrors.password}</p>}
          <button type="submit" disabled={isSaving}>
            {isSaving ? 'Saving...' : onboardingMode === 'create' ? 'Create Wallet' : 'Import Wallet'}
          </button>
        </form>
      </main>
    )
  }

  if (mode === 'unlock') {
    return (
      <main className="card">
        <h1>Unlock Wallet</h1>
        {message && <p className={`message ${message.type}`}>{message.text}</p>}
        <form onSubmit={handleUnlock}>
          <input type="password" placeholder="Master password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {fieldErrors.unlockPassword && <p className="field-error">{fieldErrors.unlockPassword}</p>}
          <button type="submit" disabled={isUnlocking}>{isUnlocking ? 'Unlocking...' : 'Unlock'}</button>
          <button type="button" className="danger" onClick={() => void switchWalletFromUnlock()} disabled={isUnlocking}>
            Use Different Wallet
          </button>
        </form>
      </main>
    )
  }

  const primary = accounts[0]

  return (
    <main className="card">
      <h1>Wallet Dashboard</h1>
      <p className="muted">Network: Sepolia</p>
      {message && <p className={`message ${message.type}`}>{message.text}</p>}
      <section className="panel">
        <h2>Primary Account</h2>
        <p className="mono">{primary?.address ?? deriveAccount(seed, 0).address}</p>
        <p>Balance: {isLoadingBalance ? 'Loading...' : `${Number(balance).toFixed(5)} ETH`}</p>
        <button type="button" onClick={() => primary && void refreshBalance(primary.address)} disabled={isLoadingBalance || !primary}>
          Refresh Balance
        </button>
      </section>

      <section className="panel">
        <h2>Accounts</h2>
        {accounts.map((account) => (
          <p key={account.address} className="mono">#{account.index} {account.address}</p>
        ))}
        <button type="button" onClick={() => void addAccount()} disabled={isAddingAccount}>
          {isAddingAccount ? 'Adding...' : 'Add Account'}
        </button>
      </section>

      <section className="panel">
        <h2>Send Transaction</h2>
        <form onSubmit={handleSend}>
          <input type="text" placeholder="Recipient address" value={to} onChange={(e) => setTo(e.target.value)} />
          {fieldErrors.to && <p className="field-error">{fieldErrors.to}</p>}
          <input type="text" placeholder="Amount in ETH" value={amount} onChange={(e) => setAmount(e.target.value)} />
          {fieldErrors.amount && <p className="field-error">{fieldErrors.amount}</p>}
          <button type="submit" disabled={isSending}>{isSending ? 'Broadcasting...' : 'Sign and Broadcast'}</button>
        </form>
        {txHash && <p className="mono">Tx: {txHash}</p>}
      </section>
      <section className="panel">
        <h2>Wallet Controls</h2>
        <button type="button" className="secondary" onClick={() => void lockWallet()}>Lock Wallet</button>
        <button type="button" className="danger" onClick={() => void switchWallet()}>Switch to Another Wallet</button>
      </section>
    </main>
  )
}

export default App
