import { useSyncExternalStore } from 'react'
import usePocketIdentity from './usePocketIdentity'
import { readPocketDisplayCurrency, subscribePocketDisplayCurrency } from '../lib/pocketDisplayCurrency'
export default function usePocketDisplayCurrency() {
 const { email } = usePocketIdentity()
 return useSyncExternalStore(subscribePocketDisplayCurrency, () => readPocketDisplayCurrency(email), () => 'USDC' as const)
}
