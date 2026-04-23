import { HDNodeWallet, Mnemonic, Wallet, ethers } from 'ethers'

export const DERIVATION_BASE_PATH = "m/44'/60'/0'/0"

export type Account = {
  index: number
  address: string
}

export const SEPOLIA_RPC_URL = 'https://ethereum-sepolia-rpc.publicnode.com'

export function createMnemonic(): string {
  return Mnemonic.fromEntropy(ethers.randomBytes(16)).phrase
}

export function validateMnemonic(phrase: string): boolean {
  return Mnemonic.isValidMnemonic(phrase.trim())
}

export function deriveAccount(phrase: string, index = 0): Account {
  const normalized = phrase.trim().replace(/\s+/g, ' ')
  const wallet = HDNodeWallet.fromPhrase(normalized, undefined, `${DERIVATION_BASE_PATH}/${index}`)
  return { index, address: wallet.address }
}

export function deriveAccounts(phrase: string, count: number): Account[] {
  return Array.from({ length: count }, (_, i) => deriveAccount(phrase, i))
}

export async function getBalance(address: string): Promise<string> {
  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL)
  const balance = await provider.getBalance(address)
  return ethers.formatEther(balance)
}

export async function signAndSendTransaction(
  phrase: string,
  accountIndex: number,
  to: string,
  amountEth: string,
): Promise<string> {
  const path = `${DERIVATION_BASE_PATH}/${accountIndex}`
  const hdWallet = HDNodeWallet.fromPhrase(phrase.trim(), undefined, path)
  const signer = new Wallet(hdWallet.privateKey, new ethers.JsonRpcProvider(SEPOLIA_RPC_URL))

  const tx = await signer.sendTransaction({
    to,
    value: ethers.parseEther(amountEth),
  })

  return tx.hash
}
