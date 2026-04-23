import { HDNodeWallet, ethers } from 'ethers'
import { DERIVATION_BASE_PATH, SEPOLIA_RPC_URL } from '../utils/walletUtils'
import { decryptSecret, decryptSeed, loadWallet } from '../utils/storageUtils'

type WalletRequest = {
  id: string | number
  method: string
  params?: unknown[]
}

type ActiveAccountSelection =
  | { source: 'hd'; index: number; address: string }
  | { source: 'privateKey'; address: string }

type ApprovalPayload = {
  method: string
  summary: string
}

const APPROVAL_TIMEOUT_MS = 30_000

function parseValue(value: string | undefined): bigint {
  if (!value) return 0n
  if (value.startsWith('0x')) return BigInt(value)
  return ethers.parseEther(value)
}

function parseSwitchChainParams(request: WalletRequest): string | null {
  const payload = request.params?.[0]
  if (!payload || typeof payload !== 'object') return null
  const chainId = (payload as Record<string, unknown>).chainId
  return typeof chainId === 'string' ? chainId.toLowerCase() : null
}

async function requestUserApproval(payload: ApprovalPayload): Promise<boolean> {
  if (!chrome.notifications) return false

  const notificationId = `approval-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const title =
    payload.method === 'eth_sendTransaction' ? 'Approve transaction request' : 'Approve signature request'

  await chrome.notifications.create(notificationId, {
    type: 'basic',
    iconUrl: 'favicon.ico',
    title,
    message: payload.summary,
    buttons: [{ title: 'Approve' }, { title: 'Reject' }],
    priority: 2,
  })

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      cleanup()
      resolve(false)
    }, APPROVAL_TIMEOUT_MS)

    const onButtonClicked = (id: string, buttonIndex: number) => {
      if (id !== notificationId) return
      cleanup()
      resolve(buttonIndex === 0)
    }

    const onClosed = (id: string) => {
      if (id !== notificationId) return
      cleanup()
      resolve(false)
    }

    const cleanup = () => {
      clearTimeout(timeout)
      chrome.notifications.onButtonClicked.removeListener(onButtonClicked)
      chrome.notifications.onClosed.removeListener(onClosed)
      void chrome.notifications.clear(notificationId)
    }

    chrome.notifications.onButtonClicked.addListener(onButtonClicked)
    chrome.notifications.onClosed.addListener(onClosed)
  })
}

async function unlockSigner(): Promise<ethers.Wallet | null> {
  const wallet = await loadWallet()
  if (!wallet) return null

  const session = await chrome.storage.session.get('sessionPassword')
  const sessionPassword = typeof session.sessionPassword === 'string' ? session.sessionPassword : null
  const activeAccount = session.activeAccount as ActiveAccountSelection | undefined
  if (!sessionPassword) return null

  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL)

  try {
    if (wallet.encryptedSeed && wallet.iv && wallet.salt) {
      const seed = await decryptSeed(wallet, sessionPassword)
      const accountIndex = activeAccount?.source === 'hd' ? activeAccount.index : 0
      return new ethers.Wallet(
        HDNodeWallet.fromPhrase(seed, undefined, `${DERIVATION_BASE_PATH}/${accountIndex}`).privateKey,
        provider,
      )
    }
    if (wallet.importedAccounts?.length) {
      const selectedImported =
        activeAccount?.source === 'privateKey'
          ? wallet.importedAccounts.find(
              (account) => account.address.toLowerCase() === activeAccount.address.toLowerCase(),
            ) ?? wallet.importedAccounts[0]
          : wallet.importedAccounts[0]
      const privateKey = await decryptSecret(
        {
          cipherText: selectedImported.encryptedPrivateKey,
          iv: selectedImported.iv,
          salt: selectedImported.salt,
        },
        sessionPassword,
      )
      return new ethers.Wallet(privateKey, provider)
    }
    return null
  } catch {
    return null
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'WALLET_PROVIDER_REQUEST') {
    return false
  }

  const request = message.payload as WalletRequest

  ;(async () => {
    const signer = await unlockSigner()
    if (!signer) {
      sendResponse({ id: request.id, error: 'Wallet locked. Unlock via extension popup.' })
      return
    }

    const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL)

    try {
      switch (request.method) {
        case 'eth_chainId':
          sendResponse({ id: request.id, result: '0xaa36a7' })
          break
        case 'net_version':
          sendResponse({ id: request.id, result: '11155111' })
          break
        case 'eth_accounts':
        case 'eth_requestAccounts':
          sendResponse({ id: request.id, result: [signer.address] })
          break
        case 'wallet_switchEthereumChain': {
          const chainId = parseSwitchChainParams(request)
          if (chainId === '0xaa36a7') sendResponse({ id: request.id, result: null })
          else sendResponse({ id: request.id, error: 'Unsupported chain. This wallet currently supports Sepolia only.' })
          break
        }
        case 'wallet_addEthereumChain': {
          const chainId = parseSwitchChainParams(request)
          if (chainId === '0xaa36a7') sendResponse({ id: request.id, result: null })
          else sendResponse({ id: request.id, error: 'Adding new chains is not supported in this version.' })
          break
        }
        case 'eth_getBalance': {
          const address = typeof request.params?.[0] === 'string' ? request.params[0] : signer.address
          const balance = await provider.getBalance(address)
          sendResponse({ id: request.id, result: ethers.toBeHex(balance) })
          break
        }
        case 'personal_sign': {
          const msg = String(request.params?.[0] ?? '')
          const approved = await requestUserApproval({
            method: request.method,
            summary: `Message preview: ${msg.slice(0, 100)}${msg.length > 100 ? '...' : ''}`,
          })
          if (!approved) {
            sendResponse({ id: request.id, error: 'Request rejected by user.' })
            break
          }
          const sig = await signer.signMessage(msg)
          sendResponse({ id: request.id, result: sig })
          break
        }
        case 'eth_sendTransaction': {
          const tx = (request.params?.[0] ?? {}) as { to: string; value?: string }
          const approved = await requestUserApproval({
            method: request.method,
            summary: `To: ${tx.to}\nValue: ${tx.value ?? '0x0'}`,
          })
          if (!approved) {
            sendResponse({ id: request.id, error: 'Request rejected by user.' })
            break
          }
          const response = await signer.sendTransaction({
            to: tx.to,
            value: parseValue(tx.value),
          })
          sendResponse({ id: request.id, result: response.hash })
          break
        }
        default:
          sendResponse({ id: request.id, error: `Unsupported method: ${request.method}` })
      }
    } catch (error) {
      sendResponse({ id: request.id, error: (error as Error).message })
    }
  })()

  return true
})
