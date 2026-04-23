import { ethers } from 'ethers'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { clearWallet, decryptSecret, decryptSeed, encryptSecret, encryptSeed, loadWallet, saveWallet, type StoredImportedAccount, type StoredWallet } from '../utils/storageUtils'
import { createMnemonic, deriveAccounts, getBalance, privateKeyToAddress, signAndSendTransaction, signAndSendTransactionWithPrivateKey, validateMnemonic, validatePrivateKey } from '../utils/walletUtils'
import type { DisplayAccount, FieldErrors, MessageType } from './types'
import { OnboardingView } from './components/OnboardingView'
import { UnlockView } from './components/UnlockView'
import { DashboardView } from './components/DashboardView'

type Mode = 'loading' | 'onboarding' | 'unlock' | 'dashboard'

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
    const value =
      activeAccount.source === 'hd'
        ? { source: 'hd', index: activeAccount.index ?? 0, address: activeAccount.address }
        : { source: 'privateKey', address: activeAccount.address }
    void chrome.storage.session.set({ activeAccount: value })
  }, [activeAccount])

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
    if (!activeAccount) return 'No active account selected.'
    if (activeAccount.source === 'hd' && !seed) return 'Wallet is locked. Unlock before sending.'
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
    await chrome.storage.session.remove('activeAccount')
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
    await chrome.storage.session.remove('activeAccount')
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

  if (mode === 'onboarding')
    return (
      <OnboardingView
        message={message}
        isSaving={isSaving}
        onboardingMode={onboardingMode}
        seed={seed}
        privateKeyInput={privateKeyInput}
        password={password}
        fieldErrors={fieldErrors}
        setOnboardingMode={setOnboardingMode}
        setSeed={setSeed}
        setPrivateKeyInput={setPrivateKeyInput}
        setMessage={setMessage}
        setPassword={setPassword}
        handleCreate={handleCreate}
        handleImport={handleImport}
        handleImportPrivateKey={handleImportPrivateKey}
        createMnemonic={createMnemonic}
      />
    )

  if (mode === 'unlock')
    return (
      <UnlockView
        message={message}
        password={password}
        isUnlocking={isUnlocking}
        fieldErrors={fieldErrors}
        setPassword={setPassword}
        handleUnlock={handleUnlock}
        switchWalletFromUnlock={() => void switchWalletFromUnlock()}
      />
    )

  return (
    <DashboardView
      message={message}
      accounts={accounts}
      activeAccount={activeAccount}
      balance={balance}
      isLoadingBalance={isLoadingBalance}
      isAddingAccount={isAddingAccount}
      canAddHdAccount={Boolean(seed)}
      isSending={isSending}
      to={to}
      amount={amount}
      txHash={txHash}
      importAccountKey={importAccountKey}
      importAccountLabel={importAccountLabel}
      fieldErrors={fieldErrors}
      setSelectedAccountId={setSelectedAccountId}
      refreshBalance={(address) => void refreshBalance(address)}
      addAccount={() => void addAccount()}
      setImportAccountKey={setImportAccountKey}
      setImportAccountLabel={setImportAccountLabel}
      importExternalAccount={() => void importExternalAccount()}
      handleSend={handleSend}
      setTo={setTo}
      setAmount={setAmount}
      lockWallet={() => void lockWallet()}
      switchWallet={() => void switchWallet()}
    />
  )
}

export default App
