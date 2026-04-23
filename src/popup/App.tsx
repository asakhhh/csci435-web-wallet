import { ethers } from 'ethers'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { clearWallet, decryptSecret, decryptSeed, encryptSecret, encryptSeed, loadWallet, saveWallet, type StoredImportedAccount, type StoredWallet } from '../utils/storageUtils'
import { createMnemonic, deriveAccount, deriveAccounts, getBalance, privateKeyToAddress, signAndSendTransaction, signAndSendTransactionWithPrivateKey, validateMnemonic, validatePrivateKey } from '../utils/walletUtils'

type Mode = 'loading' | 'onboarding' | 'unlock' | 'dashboard'
type MessageType = 'error' | 'success' | 'info'
type FieldErrors = {
  seed?: string
  privateKey?: string
  importPrivateKey?: string
  importPrivateKeyLabel?: string
  password?: string
  unlockPassword?: string
  to?: string
  amount?: string
}

type DisplayAccount = {
  id: string
  address: string
  label: string
  source: 'hd' | 'privateKey'
  index?: number
  privateKey?: string
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
  const [onboardingMode, setOnboardingMode] = useState<'create' | 'import-seed' | 'import-private-key'>('create')
  const [privateKeyInput, setPrivateKeyInput] = useState('')
  const [importAccountKey, setImportAccountKey] = useState('')
  const [importAccountLabel, setImportAccountLabel] = useState('')
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isUnlocking, setIsUnlocking] = useState(false)
  const [isAddingAccount, setIsAddingAccount] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [isLoadingBalance, setIsLoadingBalance] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [importedUnlockedAccounts, setImportedUnlockedAccounts] = useState<Array<{ address: string; label?: string; privateKey: string }>>([])

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
    const hdAccounts =
      seed && stored && stored.accountCount > 0
        ? deriveAccounts(seed, Math.max(stored.accountCount, 1)).map((account) => ({
            id: `hd-${account.index}`,
            address: account.address,
            label: `HD #${account.index}`,
            source: 'hd' as const,
            index: account.index,
          }))
        : []

    const importedAccounts: DisplayAccount[] = importedUnlockedAccounts.map((account) => ({
      id: `pk-${account.address.toLowerCase()}`,
      address: account.address,
      label: account.label?.trim() || 'Imported Account',
      source: 'privateKey',
      privateKey: account.privateKey,
    }))

    return [...hdAccounts, ...importedAccounts]
  }, [seed, stored, importedUnlockedAccounts])

  const activeAccount = useMemo(
    () => accounts.find((account) => account.id === selectedAccountId) ?? accounts[0],
    [accounts, selectedAccountId],
  )

  useEffect(() => {
    if (!activeAccount) return
    void refreshBalance(activeAccount.address)
  }, [activeAccount])

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
    const normalizedPrivateKey = privateKeyInput.trim()
    if (password.length < 8) nextErrors.password = 'Password must be at least 8 characters.'

    if (onboardingMode === 'import-private-key') {
      if (!normalizedPrivateKey) nextErrors.privateKey = 'Private key is required.'
      else if (!validatePrivateKey(normalizedPrivateKey)) nextErrors.privateKey = 'Private key format is invalid.'
    } else if (!normalizedSeed) {
      nextErrors.seed = 'Seed phrase is required.'
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors((prev) => ({ ...prev, ...nextErrors }))
      setMessage({ type: 'error', text: 'Please fix the highlighted fields.' })
      return
    }

    setIsSaving(true)
    try {
      const encryptedPrivateKey =
        onboardingMode === 'import-private-key' ? await encryptSecret(normalizedPrivateKey, password) : null
      const next: StoredWallet = onboardingMode === 'import-private-key'
        ? {
            accountCount: 0,
            importedAccounts: [
              {
                address: privateKeyToAddress(normalizedPrivateKey),
                encryptedPrivateKey: encryptedPrivateKey!.cipherText,
                iv: encryptedPrivateKey!.iv,
                salt: encryptedPrivateKey!.salt,
                label: 'Imported Account',
              },
            ],
          }
        : {
            ...(await encryptSeed(normalizedSeed, password)),
            accountCount: 1,
            importedAccounts: stored?.importedAccounts ?? [],
          }
      await saveWallet(next)
      await chrome.storage.session.set({ sessionPassword: password })
      if (onboardingMode !== 'import-private-key') setSeed(normalizedSeed)
      else setSeed('')
      setStored(next)
      if (onboardingMode === 'import-private-key') {
        setImportedUnlockedAccounts([
          {
            address: privateKeyToAddress(normalizedPrivateKey),
            privateKey: normalizedPrivateKey.startsWith('0x') ? normalizedPrivateKey : `0x${normalizedPrivateKey}`,
            label: 'Imported Account',
          },
        ])
      }
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
    if (onboardingMode !== 'create') return
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
    if (onboardingMode !== 'import-seed') return
    if (!validateMnemonic(normalizeSeed(seed))) {
      setFieldErrors({ seed: 'Invalid seed phrase. Please enter a valid BIP39 phrase.' })
      setMessage({ type: 'error', text: 'Invalid seed phrase.' })
      return
    }
    await persistWallet()
  }

  async function handleImportPrivateKey(e: FormEvent) {
    e.preventDefault()
    setMessage(null)
    setFieldErrors({})
    if (onboardingMode !== 'import-private-key') return
    if (!privateKeyInput.trim()) {
      setFieldErrors({ privateKey: 'Private key is required.' })
      setMessage({ type: 'error', text: 'Private key is required.' })
      return
    }
    if (!validatePrivateKey(privateKeyInput)) {
      setFieldErrors({ privateKey: 'Private key format is invalid.' })
      setMessage({ type: 'error', text: 'Private key format is invalid.' })
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
      if (stored.importedAccounts?.length) {
        const imported = await Promise.all(
          stored.importedAccounts.map(async (account) => ({
            address: account.address,
            label: account.label,
            privateKey: await decryptSecret(
              { cipherText: account.encryptedPrivateKey, iv: account.iv, salt: account.salt },
              password,
            ),
          })),
        )
        setImportedUnlockedAccounts(imported)
      } else {
        setImportedUnlockedAccounts([])
      }
      setMode('dashboard')
      setMessage({ type: 'success', text: 'Wallet unlocked.' })
    } catch {
      try {
        const imported = await Promise.all(
          (stored.importedAccounts ?? []).map(async (account) => ({
            address: account.address,
            label: account.label,
            privateKey: await decryptSecret(
              { cipherText: account.encryptedPrivateKey, iv: account.iv, salt: account.salt },
              password,
            ),
          })),
        )
        if (imported.length) {
          await chrome.storage.session.set({ sessionPassword: password })
          setSeed('')
          setImportedUnlockedAccounts(imported)
          setMode('dashboard')
          setMessage({ type: 'success', text: 'Wallet unlocked.' })
          return
        }
      } catch {
        // no-op
      }
      setMessage({ type: 'error', text: 'Wrong password.' })
    } finally {
      setIsUnlocking(false)
    }
  }

  async function addAccount() {
    if (!stored || !seed) {
      setMessage({ type: 'error', text: 'HD account derivation requires a mnemonic-based wallet.' })
      return
    }
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

  async function importExternalAccount() {
    if (!stored) return
    setFieldErrors((prev) => ({ ...prev, importPrivateKey: undefined, importPrivateKeyLabel: undefined }))
    setMessage(null)
    if (!importAccountKey.trim()) {
      setFieldErrors((prev) => ({ ...prev, importPrivateKey: 'Private key is required.' }))
      setMessage({ type: 'error', text: 'Private key is required.' })
      return
    }
    if (!validatePrivateKey(importAccountKey)) {
      setFieldErrors((prev) => ({ ...prev, importPrivateKey: 'Private key format is invalid.' }))
      setMessage({ type: 'error', text: 'Private key format is invalid.' })
      return
    }
    if (importAccountLabel.length > 24) {
      setFieldErrors((prev) => ({ ...prev, importPrivateKeyLabel: 'Label cannot exceed 24 characters.' }))
      setMessage({ type: 'error', text: 'Label cannot exceed 24 characters.' })
      return
    }

    const session = await chrome.storage.session.get('sessionPassword')
    const sessionPassword = typeof session.sessionPassword === 'string' ? session.sessionPassword : null
    if (!sessionPassword) {
      setMessage({ type: 'error', text: 'Session expired. Please lock and unlock wallet again.' })
      return
    }

    const normalizedKey = importAccountKey.trim()
    const address = privateKeyToAddress(normalizedKey)
    const duplicate = accounts.some((account) => account.address.toLowerCase() === address.toLowerCase())
    if (duplicate) {
      setFieldErrors((prev) => ({ ...prev, importPrivateKey: 'This account already exists in wallet.' }))
      setMessage({ type: 'error', text: 'This account already exists in wallet.' })
      return
    }

    try {
      const encrypted = await encryptSecret(normalizedKey, sessionPassword)
      const nextImported: StoredImportedAccount[] = [
        ...(stored.importedAccounts ?? []),
        {
          address,
          label: importAccountLabel.trim() || 'Imported Account',
          encryptedPrivateKey: encrypted.cipherText,
          iv: encrypted.iv,
          salt: encrypted.salt,
        },
      ]
      const next = { ...stored, importedAccounts: nextImported }
      await saveWallet(next)
      setStored(next)
      setImportedUnlockedAccounts((prev) => [
        ...prev,
        {
          address,
          label: importAccountLabel.trim() || 'Imported Account',
          privateKey: normalizedKey.startsWith('0x') ? normalizedKey : `0x${normalizedKey}`,
        },
      ])
      setImportAccountKey('')
      setImportAccountLabel('')
      setMessage({ type: 'success', text: 'External account imported.' })
    } catch {
      setMessage({ type: 'error', text: 'Failed to import external account.' })
    }
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
      if (!activeAccount) {
        setMessage({ type: 'error', text: 'No active account selected.' })
        return
      }
      const hash =
        activeAccount.source === 'hd'
          ? await signAndSendTransaction(seed, activeAccount.index ?? 0, to.trim(), amount.trim())
          : await signAndSendTransactionWithPrivateKey(activeAccount.privateKey ?? '', to.trim(), amount.trim())
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
    setImportedUnlockedAccounts([])
    setSelectedAccountId('')
    setImportAccountKey('')
    setImportAccountLabel('')
    setPrivateKeyInput('')
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
    setImportedUnlockedAccounts([])
    setSelectedAccountId('')
    setPrivateKeyInput('')
    setImportAccountKey('')
    setImportAccountLabel('')
    setOnboardingMode('import-seed')
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

  const primary = activeAccount

  return (
    <main className="card">
      <h1>Wallet Dashboard</h1>
      <p className="muted">Network: Sepolia</p>
      {message && <p className={`message ${message.type}`}>{message.text}</p>}
      <section className="panel">
        <h2>Active Account</h2>
        {accounts.length > 1 && (
          <select
            value={activeAccount?.id ?? ''}
            onChange={(e) => setSelectedAccountId(e.target.value)}
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.label}
              </option>
            ))}
          </select>
        )}
        <p className="mono">{primary?.address ?? (seed ? deriveAccount(seed, 0).address : 'No account available')}</p>
        <p>Balance: {isLoadingBalance ? 'Loading...' : `${Number(balance).toFixed(5)} ETH`}</p>
        <button type="button" onClick={() => primary && void refreshBalance(primary.address)} disabled={isLoadingBalance || !primary}>
          Refresh Balance
        </button>
      </section>

      <section className="panel">
        <h2>Accounts</h2>
        {accounts.map((account) => (
          <p key={account.id} className="mono">{account.label} {account.address}</p>
        ))}
        <button type="button" onClick={() => void addAccount()} disabled={isAddingAccount || !seed}>
          {isAddingAccount ? 'Adding...' : 'Add Account'}
        </button>
      </section>

      <section className="panel">
        <h2>Import External Account</h2>
        <input
          type="password"
          placeholder="Private key (0x...)"
          value={importAccountKey}
          onChange={(e) => setImportAccountKey(e.target.value)}
        />
        {fieldErrors.importPrivateKey && <p className="field-error">{fieldErrors.importPrivateKey}</p>}
        <input
          type="text"
          placeholder="Label (optional)"
          value={importAccountLabel}
          onChange={(e) => setImportAccountLabel(e.target.value)}
        />
        {fieldErrors.importPrivateKeyLabel && <p className="field-error">{fieldErrors.importPrivateKeyLabel}</p>}
        <button type="button" onClick={() => void importExternalAccount()}>
          Import External Account
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
