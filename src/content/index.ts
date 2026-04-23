const script = document.createElement('script')
script.src = chrome.runtime.getURL('src/injected/provider.ts')
script.type = 'module'
;(document.head || document.documentElement).appendChild(script)
script.onload = () => script.remove()

window.addEventListener('message', (event) => {
  if (event.source !== window) return
  if (event.data?.source !== 'hd-wallet-provider' || event.data?.type !== 'REQUEST') return

  chrome.runtime.sendMessage(
    { type: 'WALLET_PROVIDER_REQUEST', payload: event.data.payload },
    (response) => {
      window.postMessage({ source: 'hd-wallet-content', payload: response }, '*')
    },
  )
})
