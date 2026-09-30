import PocketAmountShimmer from './PocketAmountShimmer'
import usePocketDisplayCurrency from '../hooks/usePocketDisplayCurrency'
import usePocketFxQuote from '../hooks/usePocketFxQuote'
import { localCurrencyAmount } from '../lib/pocketDisplayCurrency'
export default function PocketLocalEquivalent({ amount, className = 'mt-1 text-xs font-medium tabular-nums text-gray-500 dark:text-gray-400' }: { amount: number; className?: string }) {
 const currency = usePocketDisplayCurrency()
 const fx = usePocketFxQuote(1, currency !== 'USDC' && Number.isFinite(amount), currency === 'UGX' ? 'UGX' : 'NGN')
 if (currency === 'USDC') return null
 return <span className={'block min-h-4 leading-4 ' + className}>
   {fx.quote ? <>~ {localCurrencyAmount(amount * fx.quote.rate, currency)}</> : fx.loading ? <PocketAmountShimmer label="Loading local equivalent" /> : <span aria-label="Local equivalent temporarily unavailable">{currency} —</span>}
 </span>
}
