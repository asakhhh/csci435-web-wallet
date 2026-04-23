import { beforeAll, describe, expect, it } from 'vitest'
import { decryptSecret, decryptSeed, encryptSecret } from './storageUtils'

beforeAll(() => {
  if (!globalThis.btoa) {
    globalThis.btoa = (value: string) => Buffer.from(value, 'binary').toString('base64')
  }
  if (!globalThis.atob) {
    globalThis.atob = (value: string) => Buffer.from(value, 'base64').toString('binary')
  }
})

describe('storageUtils crypto helpers', () => {
  it('encrypts and decrypts secrets roundtrip', async () => {
    const payload = await encryptSecret('seed words', 'password123')
    const decrypted = await decryptSecret(payload, 'password123')
    expect(decrypted).toBe('seed words')
  })

  it('rejects decryptSeed when seed payload is missing', async () => {
    await expect(decryptSeed({ accountCount: 1 }, 'password123')).rejects.toThrow(
      'No seed phrase is available in storage.',
    )
  })
})
