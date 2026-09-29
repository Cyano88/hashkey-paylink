import { createElement } from 'react'
import PocketAmountShimmer from '../components/PocketAmountShimmer'
import usePocketFxQuote from './usePocketFxQuote'
import usePocketDisplayCurrency from './usePocketDisplayCurrency'
import { localCurrencyAmount } from '../lib/pocketDisplayCurrency'
export default function usePocketLimitDisplay(localCurrency?: 'NGN' | 'UGX') {
 const preference = usePocketDisplayCurrency()
 const currency = localCurrency || preference
 const ngn = usePocketFxQuote(1)
 const ugx = usePocketFxQuote(1, currency === 'UGX', 'UGX')
 const usdc = (value: number) => ngn.quote ? '~ ' + (value / ngn.quote.rate).toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' USDC' : ngn.loading ? createElement(PocketAmountShimmer, { label: 'Loading USDC allowance' }) : 'USDC estimate unavailable'
 const secondary = (value: number) => currency === 'NGN' ? localCurrencyAmount(value, 'NGN') : currency === 'UGX' && ngn.quote && ugx.quote ? '~ ' + localCurrencyAmount(value / ngn.quote.rate * ugx.quote.rate, 'UGX') : currency === 'UGX' && (ngn.loading || ugx.loading) ? createElement(PocketAmountShimmer, { label: 'Loading UGX allowance' }) : null
 return { usdc, secondary }
}
