/** Shared USDC checkout pricing. Integer base units prevent quote/execution drift. */
export const PLATFORM_FEE_BPS = 25
export function paymentFeeBreakdown(amount: bigint, networkFee = 0n, mode: 'gross' | 'net' = 'gross', exempt = false) {
  if (amount <= 0n || networkFee < 0n) throw new Error('Invalid payment amount.')
  const platformFee = exempt ? 0n : amount * BigInt(PLATFORM_FEE_BPS) / 10_000n
  const treasury = platformFee + networkFee
  const recipient = mode === 'gross' ? amount : amount - treasury
  const total = mode === 'gross' ? amount + treasury : amount
  if (recipient <= 0n || total >= 2n ** 256n) throw new Error('Amount cannot cover payment fees.')
  return { platformFee, networkFee, treasury, recipient, total }
}
