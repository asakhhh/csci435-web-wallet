import { describe, expect, it } from 'vitest'
import { createMnemonic, deriveAccount, deriveAccounts, normalizePrivateKey, validateMnemonic, validatePrivateKey } from './walletUtils'

describe('walletUtils', () => {
  it('creates valid mnemonic phrases', () => {
    const phrase = createMnemonic()
    expect(validateMnemonic(phrase)).toBe(true)
  })

  it('normalizes and validates private keys', () => {
    const raw = '0x59c6995e998f97a5a0044966f0945382d4fce4ecfd7f2f6e6f7414f15f9f95f0'
    expect(normalizePrivateKey(raw.replace('0x', ''))).toBe(raw)
    expect(validatePrivateKey(raw)).toBe(true)
    expect(validatePrivateKey('0xabc')).toBe(false)
  })

  it('derives deterministic accounts', () => {
    const phrase = 'test test test test test test test test test test test junk'
    const first = deriveAccount(phrase, 0)
    const second = deriveAccount(phrase, 1)
    const list = deriveAccounts(phrase, 2)

    expect(first.address).not.toBe(second.address)
    expect(list[0].address).toBe(first.address)
    expect(list[1].address).toBe(second.address)
  })
})
