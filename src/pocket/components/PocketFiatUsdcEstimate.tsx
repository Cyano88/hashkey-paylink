import usePocketFxQuote from '../hooks/usePocketFxQuote'
import { formatPocketPaymentAmount } from '../lib/pocketMoney'
export default function PocketFiatUsdcEstimate({ amount, currency = 'NGN' }: { amount: number; currency?: 'NGN' | 'UGX' }) {
 const fx = usePocketFxQuote(1, Number.isFinite(amount) && amount > 0, currency)
 return fx.quote && amount > 0 ? <span className="mt-1 block text-xs font-medium tabular-nums text-gray-500 dark:text-gray-400">Est. {formatPocketPaymentAmount(amount / fx.quote.rate)} USDC before fees</span> : null
}
