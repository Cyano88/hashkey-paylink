import bs58 from 'bs58'

export function isValidSolanaAddress(value: string) {
  try {
    const bytes = bs58.decode(value.trim())
    return bytes.length === 32
  } catch {
    return false
  }
}
