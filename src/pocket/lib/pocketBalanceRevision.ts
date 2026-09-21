import type { CirclePocketWallet } from '../models/pocketWallet'

/** Opaque revision binds a balance to the exact linked wallet, without returning its address. */
export async function pocketBalanceRevision(network: string, wallet?: CirclePocketWallet) {
  const address = wallet?.address ?? ''
  const material = JSON.stringify([network, network === 'solana' ? address : address.toLowerCase(), wallet?.walletId ?? '', wallet?.updatedAt ?? 0])
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(material))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}
