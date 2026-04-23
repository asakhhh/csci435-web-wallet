let currentId = 0
const listeners = new Map<string, Set<(...args: unknown[]) => void>>()

function request(method: string, params?: unknown[]) {
  const id = ++currentId
  window.postMessage({ source: 'hd-wallet-provider', type: 'REQUEST', payload: { id, method, params } }, '*')

  return new Promise((resolve, reject) => {
    const listener = (event: MessageEvent) => {
      const data = event.data
      if (data?.source !== 'hd-wallet-content' || data?.payload?.id !== id) return
      window.removeEventListener('message', listener)
      if (data.payload.error) reject(new Error(data.payload.error))
      else resolve(data.payload.result)
    }
    window.addEventListener('message', listener)
  })
}

const provider = {
  isMetaMask: false,
  isHdWallet: true,
  selectedAddress: null as string | null,
  request: ({ method, params }: { method: string; params?: unknown[] }) => request(method, params),
  on: (event: string, handler: (...args: unknown[]) => void) => {
    if (!listeners.has(event)) listeners.set(event, new Set())
    listeners.get(event)?.add(handler)
    return provider
  },
  removeListener: (event: string, handler: (...args: unknown[]) => void) => {
    listeners.get(event)?.delete(handler)
    return provider
  },
  emit: (event: string, ...args: unknown[]) => {
    listeners.get(event)?.forEach((handler) => handler(...args))
  },
}

void provider.request({ method: 'eth_chainId' }).then((chainId) => {
  if (typeof chainId === 'string') provider.emit('chainChanged', chainId)
})

void provider.request({ method: 'eth_accounts' }).then((accounts) => {
  const first = Array.isArray(accounts) && typeof accounts[0] === 'string' ? accounts[0] : null
  provider.selectedAddress = first
  provider.emit('accountsChanged', first ? [first] : [])
})

Object.defineProperty(window, 'ethereum', {
  value: provider,
  writable: false,
})
