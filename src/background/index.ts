import { HDNodeWallet, ethers } from 'ethers'
import { DERIVATION_BASE_PATH, SEPOLIA_RPC_URL } from '../utils/walletUtils'
import { decryptSecret, decryptSeed, loadWallet } from '../utils/storageUtils'

type WalletRequest = {
  id: string | number
  method: string
  params?: unknown[]
}

function parseValue(value: string | undefined): bigint {
  if (!value) return 0n
  if (value.startsWith('0x')) return BigInt(value)
  return ethers.parseEther(value)
}

async function unlockSigner(): Promise<ethers.Wallet | null> {
  const wallet = await loadWallet()
  if (!wallet) return null

  const session = await chrome.storage.session.get('sessionPassword')
  const sessionPassword = typeof session.sessionPassword === 'string' ? session.sessionPassword : null
  if (!sessionPassword) return null

  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL)

  try {
    if (wallet.encryptedSeed && wallet.iv && wallet.salt) {
      const seed = await decryptSeed(wallet, sessionPassword)
      return new ethers.Wallet(
        HDNodeWallet.fromPhrase(seed, undefined, `${DERIVATION_BASE_PATH}/0`).privateKey,
        provider,
      )
    }
    if (wallet.importedAccounts?.length) {
      const first = wallet.importedAccounts[0]
      const privateKey = await decryptSecret(
        { cipherText: first.encryptedPrivateKey, iv: first.iv, salt: first.salt },
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
        case 'eth_getBalance': {
          const address = typeof request.params?.[0] === 'string' ? request.params[0] : signer.address
          const balance = await provider.getBalance(address)
          sendResponse({ id: request.id, result: ethers.toBeHex(balance) })
          break
        }
        case 'personal_sign': {
          const msg = String(request.params?.[0] ?? '')
          const sig = await signer.signMessage(msg)
          sendResponse({ id: request.id, result: sig })
          break
        }
        case 'eth_sendTransaction': {
          const tx = (request.params?.[0] ?? {}) as { to: string; value?: string }
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
