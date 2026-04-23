const STORAGE_KEY = 'hd_wallet_v1'

export type StoredWallet = {
  encryptedSeed: string
  iv: string
  salt: string
  accountCount: number
}

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

function base64ToBytes(input: string): Uint8Array {
  const str = atob(input)
  const out = new Uint8Array(str.length)
  for (let i = 0; i < str.length; i += 1) out[i] = str.charCodeAt(i)
  return out
}

function asBufferSource(bytes: Uint8Array): BufferSource {
  return bytes as unknown as BufferSource
}

async function deriveAesKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const passwordBytes = new TextEncoder().encode(password)
  const keyMaterial = await crypto.subtle.importKey('raw', asBufferSource(passwordBytes), 'PBKDF2', false, ['deriveKey'])

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: asBufferSource(salt),
      iterations: 150_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptSeed(seedPhrase: string, password: string): Promise<Omit<StoredWallet, 'accountCount'> & { accountCount?: number }> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await deriveAesKey(password, salt)

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: asBufferSource(iv) },
    key,
    asBufferSource(new TextEncoder().encode(seedPhrase)),
  )

  return {
    encryptedSeed: bytesToBase64(new Uint8Array(encrypted)),
    iv: bytesToBase64(iv),
    salt: bytesToBase64(salt),
  }
}

export async function decryptSeed(payload: StoredWallet, password: string): Promise<string> {
  const key = await deriveAesKey(password, base64ToBytes(payload.salt))
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: asBufferSource(base64ToBytes(payload.iv)) },
    key,
    asBufferSource(base64ToBytes(payload.encryptedSeed)),
  )
  return new TextDecoder().decode(decrypted)
}

export async function saveWallet(wallet: StoredWallet): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: wallet })
}

export async function loadWallet(): Promise<StoredWallet | null> {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  const candidate = result[STORAGE_KEY] as Record<string, unknown> | undefined
  if (
    candidate &&
    typeof candidate.encryptedSeed === 'string' &&
    typeof candidate.iv === 'string' &&
    typeof candidate.salt === 'string' &&
    typeof candidate.accountCount === 'number'
  ) {
    return candidate as StoredWallet
  }
  return null
}

export async function clearWallet(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY)
}
