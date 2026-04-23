const STORAGE_KEY = 'hd_wallet_v1'

export type EncryptedPayload = {
  cipherText: string
  iv: string
  salt: string
}

export type StoredImportedAccount = {
  address: string
  label?: string
  encryptedPrivateKey: string
  iv: string
  salt: string
}

export type StoredWallet = {
  encryptedSeed?: string
  iv?: string
  salt?: string
  accountCount: number
  importedAccounts?: StoredImportedAccount[]
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
  // Derive a per-wallet key so leaked ciphertext cannot be reused across passwords/salts.
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

export async function encryptSecret(secret: string, password: string): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await deriveAesKey(password, salt)

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: asBufferSource(iv) },
    key,
    asBufferSource(new TextEncoder().encode(secret)),
  )

  return {
    cipherText: bytesToBase64(new Uint8Array(encrypted)),
    iv: bytesToBase64(iv),
    salt: bytesToBase64(salt),
  }
}

export async function decryptSecret(payload: EncryptedPayload, password: string): Promise<string> {
  const key = await deriveAesKey(password, base64ToBytes(payload.salt))
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: asBufferSource(base64ToBytes(payload.iv)) },
    key,
    asBufferSource(base64ToBytes(payload.cipherText)),
  )
  return new TextDecoder().decode(decrypted)
}

export async function encryptSeed(seedPhrase: string, password: string): Promise<Omit<StoredWallet, 'accountCount'> & { accountCount?: number }> {
  const encrypted = await encryptSecret(seedPhrase, password)
  return {
    encryptedSeed: encrypted.cipherText,
    iv: encrypted.iv,
    salt: encrypted.salt,
  }
}

export async function decryptSeed(payload: StoredWallet, password: string): Promise<string> {
  if (!payload.encryptedSeed || !payload.iv || !payload.salt) {
    throw new Error('No seed phrase is available in storage.')
  }
  return decryptSecret({ cipherText: payload.encryptedSeed, iv: payload.iv, salt: payload.salt }, password)
}

export async function saveWallet(wallet: StoredWallet): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: wallet })
}

export async function loadWallet(): Promise<StoredWallet | null> {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  const candidate = result[STORAGE_KEY] as Record<string, unknown> | undefined
  const importedAccounts = Array.isArray(candidate?.importedAccounts) ? candidate.importedAccounts : []
  const importedAccountsValid = importedAccounts.every(
    (entry) =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as Record<string, unknown>).address === 'string' &&
      typeof (entry as Record<string, unknown>).encryptedPrivateKey === 'string' &&
      typeof (entry as Record<string, unknown>).iv === 'string' &&
      typeof (entry as Record<string, unknown>).salt === 'string',
  )

  const seedPresent =
    candidate &&
    typeof candidate.encryptedSeed === 'string' &&
    typeof candidate.iv === 'string' &&
    typeof candidate.salt === 'string'

  if (
    candidate &&
    typeof candidate.accountCount === 'number' &&
    importedAccountsValid &&
    (seedPresent || importedAccounts.length > 0)
  ) {
    return candidate as StoredWallet
  }
  return null
}

export async function clearWallet(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY)
}
