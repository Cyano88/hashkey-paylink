import usePocketDisplayCurrency from '../hooks/usePocketDisplayCurrency'
import usePocketFxQuote from '../hooks/usePocketFxQuote'
import { localCurrencyAmount } from '../lib/pocketDisplayCurrency'
export default function PocketLocalEquivalent({ amount, className = 'mt-1 text-xs font-medium tabular-nums text-gray-500 dark:text-gray-400' }: { amount: number; className?: string }) {
 const currency = usePocketDisplayCurrency()
 const fx = usePocketFxQuote(1, currency !== 'USDC' && Number.isFinite(amount), currency === 'UGX' ? 'UGX' : 'NGN')
 return currency !== 'USDC' && fx.quote ? <span className={'block ' + className}>~ {localCurrencyAmount(amount * fx.quote.rate, currency)}</span> : null
}
