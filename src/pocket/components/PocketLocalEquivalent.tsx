import PocketAmountShimmer from './PocketAmountShimmer'
import usePocketDisplayCurrency from '../hooks/usePocketDisplayCurrency'
import usePocketFxQuote from '../hooks/usePocketFxQuote'
import { localCurrencyAmount } from '../lib/pocketDisplayCurrency'
export default function PocketLocalEquivalent({ amount, recordedAmount, recordedCurrency = 'NGN', className = 'mt-1 text-xs font-medium tabular-nums text-gray-500 dark:text-gray-400' }: { amount: number; recordedAmount?: string; recordedCurrency?: 'NGN' | 'UGX'; className?: string }) {
 const currency = usePocketDisplayCurrency()
 const hasRecordedAmount = !!recordedAmount && Number.isFinite(Number(recordedAmount)) && Number(recordedAmount) > 0
 const fx = usePocketFxQuote(1, currency !== 'USDC' && !hasRecordedAmount && Number.isFinite(amount), currency === 'UGX' ? 'UGX' : 'NGN')
 if (currency === 'USDC') return null
 return <span className={'block min-h-4 leading-4 ' + className}>
   {hasRecordedAmount ? localCurrencyAmount(Number(recordedAmount), recordedCurrency) : fx.quote ? <>~ {localCurrencyAmount(amount * fx.quote.rate, currency)}</> : fx.loading ? <PocketAmountShimmer label="Loading local equivalent" /> : <span aria-label="Local equivalent temporarily unavailable">Rate unavailable</span>}
 </span>
}
