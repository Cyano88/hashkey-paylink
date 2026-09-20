export type PocketWalletUpdateNotice = 'hidden' | 'available' | 'resume'
export function parsePocketWalletUpdateNotice(value: unknown): PocketWalletUpdateNotice {
  return value === 'available' || value === 'resume' ? value : 'hidden'
}
