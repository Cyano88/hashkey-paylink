import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { paymentFeeBreakdown, PLATFORM_FEE_BPS } from '../src/lib/platformFees.js'
export type PaymentFeeQuote = {
  version: 1; id: string; chain: string; walletId: string; walletAddress: string; recipient: string
  amountUnits: string; platformFeeUnits: string; networkFeeUnits: string; treasuryUnits: string
  recipientUnits: string; totalUnits: string; feeBps: number; mode: 'gross' | 'net'
  issuedAt: number; expiresAt: number; exemption: 'none' | 'verified-payout'
}
export type PaymentFeeBinding = Pick<PaymentFeeQuote, 'chain' | 'walletId' | 'walletAddress' | 'recipient' | 'amountUnits' | 'mode'>
function secret() { const key = process.env.POCKET_SWAP_QUOTE_SECRET || ''; if (key.length < 32) throw new Error('Payment quote signing is not configured.'); return key }
function signature(payload: string, key: string) { return createHmac('sha256', key).update('hashpaylink:payment-fee:v1:').update(payload).digest() }
export function createPaymentFeeQuote(binding: PaymentFeeBinding, networkFeeUnits: bigint, exempt = false, now = Date.now(), key = secret()) {
  if (!/^\d{1,78}$/.test(binding.amountUnits)) throw new Error('Invalid payment amount.')
  const amounts = paymentFeeBreakdown(BigInt(binding.amountUnits), networkFeeUnits, binding.mode, exempt)
  const quote: PaymentFeeQuote = { ...binding, walletAddress: (binding.chain === 'solana' ? binding.walletAddress : binding.walletAddress.toLowerCase()), recipient: (binding.chain === 'solana' ? binding.recipient : binding.recipient.toLowerCase()), version: 1, id: randomUUID(), platformFeeUnits: amounts.platformFee.toString(), networkFeeUnits: amounts.networkFee.toString(), treasuryUnits: amounts.treasury.toString(), recipientUnits: amounts.recipient.toString(), totalUnits: amounts.total.toString(), feeBps: exempt ? 0 : PLATFORM_FEE_BPS, issuedAt: now, expiresAt: now + 120_000, exemption: exempt ? 'verified-payout' : 'none' }
  const payload = Buffer.from(JSON.stringify(quote)).toString('base64url')
  return { quote, token: payload + '.' + signature(payload, key).toString('base64url') }
}
export function verifyPaymentFeeQuote(token: string, binding: PaymentFeeBinding, now = Date.now(), key = secret()): PaymentFeeQuote {
  if (typeof token !== 'string' || token.length > 5000) throw new Error('Refresh the payment quote.')
  const [payload, mac, extra] = token.split('.')
  if (!payload || !mac || extra) throw new Error('Refresh the payment quote.')
  const actual = Buffer.from(mac, 'base64url'), expected = signature(payload, key)
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('Invalid payment quote.')
  const quote = JSON.parse(Buffer.from(payload, 'base64url').toString()) as PaymentFeeQuote
  if (quote.version !== 1 || !Number.isSafeInteger(quote.issuedAt) || quote.expiresAt <= quote.issuedAt || !Number.isSafeInteger(quote.expiresAt) || quote.expiresAt <= now || quote.issuedAt > now + 5000 || quote.expiresAt - quote.issuedAt > 120_000) throw new Error('Payment quote expired. Review the refreshed fees.')
  for (const k of ['chain','walletId','amountUnits','mode'] as const) if (quote[k] !== binding[k]) throw new Error('Payment details changed. Refresh the quote.')
  if (quote.walletAddress !== (binding.chain === 'solana' ? binding.walletAddress : binding.walletAddress.toLowerCase()) || quote.recipient !== (binding.chain === 'solana' ? binding.recipient : binding.recipient.toLowerCase())) throw new Error('Payment details changed. Refresh the quote.')
  if (!['none', 'verified-payout'].includes(quote.exemption) || !['gross', 'net'].includes(quote.mode)) throw new Error('Invalid payment quote.')
  const amounts = paymentFeeBreakdown(BigInt(quote.amountUnits), BigInt(quote.networkFeeUnits), quote.mode, quote.exemption === 'verified-payout')
  if (quote.feeBps !== (quote.exemption === 'verified-payout' ? 0 : PLATFORM_FEE_BPS)) throw new Error('Invalid payment quote.')
  for (const field of ['platformFee', 'networkFee', 'treasury', 'recipient', 'total'] as const) if (quote[(field + 'Units') as keyof PaymentFeeQuote] !== amounts[field].toString()) throw new Error('Invalid payment quote.')
  return quote
}
