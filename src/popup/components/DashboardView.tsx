import type { FormEvent } from 'react'
import type { DisplayAccount, FieldErrors, MessageType } from '../types'

type Props = {
  message: { type: MessageType; text: string } | null
  accounts: DisplayAccount[]
  activeAccount: DisplayAccount | undefined
  balance: string
  isLoadingBalance: boolean
  isAddingAccount: boolean
  canAddHdAccount: boolean
  isSending: boolean
  to: string
  amount: string
  txHash: string
  importAccountKey: string
  importAccountLabel: string
  fieldErrors: FieldErrors
  setSelectedAccountId: (value: string) => void
  refreshBalance: (address: string) => void
  addAccount: () => void
  setImportAccountKey: (value: string) => void
  setImportAccountLabel: (value: string) => void
  importExternalAccount: () => void
  handleSend: (e: FormEvent) => void
  setTo: (value: string) => void
  setAmount: (value: string) => void
  lockWallet: () => void
  switchWallet: () => void
}

export function DashboardView(props: Props) {
  const {
    message,
    accounts,
    activeAccount,
    balance,
    isLoadingBalance,
    isAddingAccount,
    canAddHdAccount,
    isSending,
    to,
    amount,
    txHash,
    importAccountKey,
    importAccountLabel,
    fieldErrors,
    setSelectedAccountId,
    refreshBalance,
    addAccount,
    setImportAccountKey,
    setImportAccountLabel,
    importExternalAccount,
    handleSend,
    setTo,
    setAmount,
    lockWallet,
    switchWallet,
  } = props

  return (
    <main className="card">
      <h1>Wallet Dashboard</h1>
      <p className="muted">Network: Sepolia</p>
      {message && <p className={`message ${message.type}`}>{message.text}</p>}
      <section className="panel">
        <h2>Active Account</h2>
        {accounts.length > 1 && (
          <select value={activeAccount?.id ?? ''} onChange={(e) => setSelectedAccountId(e.target.value)}>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.label}
              </option>
            ))}
          </select>
        )}
        <p className="mono">{activeAccount?.address ?? 'No account available'}</p>
        <p>Balance: {isLoadingBalance ? 'Loading...' : `${Number(balance).toFixed(5)} ETH`}</p>
        <button type="button" onClick={() => activeAccount && refreshBalance(activeAccount.address)} disabled={isLoadingBalance || !activeAccount}>
          Refresh Balance
        </button>
      </section>

      <section className="panel">
        <h2>Accounts</h2>
        {accounts.map((account) => (
          <p key={account.id} className="mono">{account.label} {account.address}</p>
        ))}
        <button type="button" onClick={addAccount} disabled={isAddingAccount || !canAddHdAccount}>
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
        <button type="button" onClick={importExternalAccount}>
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
        <button type="button" className="secondary" onClick={lockWallet}>Lock Wallet</button>
        <button type="button" className="danger" onClick={switchWallet}>Switch to Another Wallet</button>
      </section>
    </main>
  )
}
