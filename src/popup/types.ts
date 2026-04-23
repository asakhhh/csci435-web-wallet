export type MessageType = 'error' | 'success' | 'info'

export type FieldErrors = {
  seed?: string
  privateKey?: string
  importPrivateKey?: string
  importPrivateKeyLabel?: string
  password?: string
  unlockPassword?: string
  to?: string
  amount?: string
}

export type DisplayAccount = {
  id: string
  address: string
  label: string
  source: 'hd' | 'privateKey'
  index?: number
  privateKey?: string
}
