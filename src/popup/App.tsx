import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { decryptSeed, encryptSeed, loadWallet, saveWallet, type StoredWallet } from '../utils/storageUtils'
import { createMnemonic, deriveAccount, deriveAccounts, getBalance, signAndSendTransaction, validateMnemonic } from '../utils/walletUtils'

type Mode = 'loading' | 'onboarding' | 'unlock' | 'dashboard'

function App() {
  const [mode, setMode] = useState<Mode>('loading')
  const [stored, setStored] = useState<StoredWallet | null>(null)
  const [seed, setSeed] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [balance, setBalance] = useState('0')
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('0.001')
  const [txHash, setTxHash] = useState('')
  const [onboardingMode, setOnboardingMode] = useState<'create' | 'import'>('create')

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
    getBalance(primary.address).then(setBalance).catch(() => setBalance('0'))
  }, [accounts])

  async function persistWallet() {
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    const encrypted = await encryptSeed(seed, password)
    const next = { ...encrypted, accountCount: 1 }
    await saveWallet(next)
    await chrome.storage.session.set({ sessionPassword: password })
    setStored(next)
    setMode('dashboard')
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setError('')
    await persistWallet()
  }

  async function handleImport(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!validateMnemonic(seed)) {
      setError('Invalid seed phrase.')
      return
    }
    await persistWallet()
  }

  async function handleUnlock(e: FormEvent) {
    e.preventDefault()
    if (!stored) return
    setError('')
    try {
      const unlocked = await decryptSeed(stored, password)
      await chrome.storage.session.set({ sessionPassword: password })
      setSeed(unlocked)
      setMode('dashboard')
    } catch {
      setError('Wrong password.')
    }
  }

  async function addAccount() {
    if (!stored) return
    const updated = { ...stored, accountCount: stored.accountCount + 1 }
    await saveWallet(updated)
    setStored(updated)
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault()
    setError('')
    setTxHash('')
    try {
      const hash = await signAndSendTransaction(seed, 0, to, amount)
      setTxHash(hash)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  if (mode === 'loading') return <main className="card">Loading wallet...</main>

  if (mode === 'onboarding') {
    return (
      <main className="card">
        <h1>HD Wallet Setup</h1>
        <p className="muted">Save this 12-word seed phrase securely before continuing.</p>
        <section className="panel">
          <button type="button" onClick={() => { setOnboardingMode('create'); setSeed(createMnemonic()) }}>
            Create New Wallet
          </button>
          <button type="button" onClick={() => { setOnboardingMode('import'); setSeed('') }}>
            Import Existing Wallet
          </button>
        </section>
        <textarea value={seed} onChange={(e) => setSeed(e.target.value)} rows={3} />
        <form onSubmit={onboardingMode === 'create' ? handleCreate : handleImport}>
          <input type="password" placeholder="Master password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="submit">{onboardingMode === 'create' ? 'Create Wallet' : 'Import Wallet'}</button>
        </form>
        {error && <p className="error">{error}</p>}
      </main>
    )
  }

  if (mode === 'unlock') {
    return (
      <main className="card">
        <h1>Unlock Wallet</h1>
        <form onSubmit={handleUnlock}>
          <input type="password" placeholder="Master password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="submit">Unlock</button>
        </form>
        {error && <p className="error">{error}</p>}
      </main>
    )
  }

  const primary = accounts[0]

  return (
    <main className="card">
      <h1>Wallet Dashboard</h1>
      <p className="muted">Network: Sepolia</p>
      <section className="panel">
        <h2>Primary Account</h2>
        <p className="mono">{primary?.address ?? deriveAccount(seed, 0).address}</p>
        <p>Balance: {Number(balance).toFixed(5)} ETH</p>
      </section>

      <section className="panel">
        <h2>Accounts</h2>
        {accounts.map((account) => (
          <p key={account.address} className="mono">#{account.index} {account.address}</p>
        ))}
        <button type="button" onClick={() => void addAccount()}>Add Account</button>
      </section>

      <section className="panel">
        <h2>Send Transaction</h2>
        <form onSubmit={handleSend}>
          <input type="text" placeholder="Recipient address" value={to} onChange={(e) => setTo(e.target.value)} />
          <input type="text" placeholder="Amount in ETH" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <button type="submit">Sign and Broadcast</button>
        </form>
        {txHash && <p className="mono">Tx: {txHash}</p>}
      </section>

      {error && <p className="error">{error}</p>}
    </main>
  )
}

export default App
