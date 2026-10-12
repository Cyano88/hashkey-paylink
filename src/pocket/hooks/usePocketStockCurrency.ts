import { useSyncExternalStore } from 'react'
import { readPocketDisplayCurrency, savePocketDisplayCurrency, subscribePocketDisplayCurrency } from '../lib/pocketDisplayCurrency'
export default function usePocketStockCurrency(email: string) {
  const currency = useSyncExternalStore(subscribePocketDisplayCurrency, () => readPocketDisplayCurrency(email), () => 'USDC' as const)
  const save = async (value: string) => {
    if (value !== 'USDC' && value !== 'NGN' && value !== 'UGX') return false
    savePocketDisplayCurrency(email, value)
    return true
  }
  return { currency, save }
}
