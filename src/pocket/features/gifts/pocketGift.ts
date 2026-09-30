export const GIFT_NETWORKS = ['base', 'arbitrum', 'arc', 'polygon', 'ethereum', 'solana'] as const
export type GiftNetwork = typeof GIFT_NETWORKS[number]
export type GiftDraft = { amount: string; network: GiftNetwork; message: string; claims: number }
export type GiftStatus = 'funding' | 'available' | 'claiming' | 'claimed' | 'expired' | 'refunding' | 'refunded'
export type GiftView = { sender: string; amount: string; network: GiftNetwork; message: string; status: GiftStatus }

// Six-decimal integer accounting. No float rounding or implicit amount correction.
export function giftUnits(amount: string): bigint {
  if (!/^(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,6})?$/.test(amount)) throw Error('Enter a valid USDC amount, up to 6 decimal places.')
  const [whole, fraction = ''] = amount.split('.')
  const units = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'))
  if (units <= 0n) throw Error('Enter an amount greater than zero.')
  return units
}
export function validateGiftDraft(draft: GiftDraft) {
  const total = giftUnits(draft.amount)
  if (!GIFT_NETWORKS.includes(draft.network)) throw Error('Choose a supported network.')
  if (draft.message.length > 160) throw Error('Keep your message within 160 characters.')
  if (!Number.isSafeInteger(draft.claims) || draft.claims < 1 || draft.claims > 1000) throw Error('Choose between 1 and 1,000 recipients.')
  if (total % BigInt(draft.claims) !== 0n) throw Error('Choose an amount that divides equally between recipients.')
  if (total / BigInt(draft.claims) < 1n) throw Error('Increase the amount per recipient.')
  return { totalUnits: total, perClaimUnits: total / BigInt(draft.claims) }
}

// A public gift ID is not authority to claim. Keep the capability in the fragment,
// never query params; the redemption service must bind it to the authenticated wallet.
export function parseGiftLink(raw: string): { id: string; secret: string } | null {
  try {
    const url = new URL(raw)
    const id = /^\/gift\/(g_[A-Za-z0-9_-]{22})$/.exec(url.pathname)?.[1]
    if (url.origin !== 'https://pocket.hashpaylink.com' || url.username || url.password || url.search || !id) return null
    const secret = /^#claim=([A-Za-z0-9_-]{43})$/.exec(url.hash)?.[1]
    return secret ? { id, secret } : null
  } catch { return null }
}
export function giftLink(id: string, secret: string): string {
  const url = `https://pocket.hashpaylink.com/gift/${id}#claim=${secret}`
  if (!parseGiftLink(url)) throw Error('Invalid gift link.')
  return url
}
export function giftStateCopy(status: GiftStatus) {
  return {
    funding: 'Your gift is being funded.', available: '', claiming: 'Your claim is being confirmed.',
    claimed: 'This gift has already been claimed.', expired: 'This gift has expired.',
    refunding: 'This gift is being returned to its sender.', refunded: 'This gift was returned to its sender.',
  }[status]
}
