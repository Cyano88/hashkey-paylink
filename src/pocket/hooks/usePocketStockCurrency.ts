import { useState } from 'react'
export default function usePocketStockCurrency(email: string) {
  const key = 'pocket.xstocks.displayCurrency:' + email.trim().toLowerCase()
  const [saved, setSaved] = useState<{key: string; currency: 'USDC' | 'NGN' | 'UGX'} | null>(null)
  const currency = saved?.key === key ? saved.currency : localStorage.getItem(key) === 'NGN' ? 'NGN' : localStorage.getItem(key) === 'UGX' ? 'UGX' : 'USDC'
  const save = async (value: string) => {
    if (value !== 'USDC' && value !== 'NGN' && value !== 'UGX') return false
    localStorage.setItem(key, value)
    setSaved({key, currency: value})
    return true
  }
  return { currency, save }
}
