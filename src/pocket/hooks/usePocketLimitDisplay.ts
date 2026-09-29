import usePocketFxQuote from './usePocketFxQuote'
import usePocketDisplayCurrency from './usePocketDisplayCurrency'
import { localCurrencyAmount } from '../lib/pocketDisplayCurrency'
export default function usePocketLimitDisplay() {
 const currency = usePocketDisplayCurrency()
 const ngn = usePocketFxQuote(1)
 const ugx = usePocketFxQuote(1, currency === 'UGX', 'UGX')
 const usdc = (value: number) => ngn.quote ? '~ ' + (value / ngn.quote.rate).toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' USDC' : ngn.busy || !ngn.error ? '\u2026 USDC' : 'USDC estimate unavailable'
 const secondary = (value: number) => currency === 'NGN' ? localCurrencyAmount(value, 'NGN') : currency === 'UGX' && ngn.quote && ugx.quote ? '~ ' + localCurrencyAmount(value / ngn.quote.rate * ugx.quote.rate, 'UGX') : null
 return { usdc, secondary }
}
