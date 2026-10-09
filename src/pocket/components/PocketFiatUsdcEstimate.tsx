import PocketAmountShimmer from './PocketAmountShimmer'
import usePocketFxQuote from '../hooks/usePocketFxQuote'
import { formatPocketPaymentAmount } from '../lib/pocketMoney'
export default function PocketFiatUsdcEstimate({ amount, currency = 'NGN', asset = 'USDC' }: { amount: number; currency?: 'NGN' | 'UGX'; asset?: 'USDC' | 'USDT' }) {
 const fx = usePocketFxQuote(1, Number.isFinite(amount) && amount > 0, currency, false, asset)
 if (fx.loading) return <span className="mt-1 block text-xs"><PocketAmountShimmer label={'Loading ' + asset + ' estimate'} /></span>
 return fx.quote && amount > 0 ? <span className="mt-1 block text-xs font-medium tabular-nums text-gray-500 dark:text-gray-400">Est. {formatPocketPaymentAmount(amount / fx.quote.rate)} {asset} before fees</span> : null
}
