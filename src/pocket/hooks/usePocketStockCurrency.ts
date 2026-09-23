import { useState } from 'react'
export default function usePocketStockCurrency(email: string) {
  const key = 'pocket.xstocks.displayCurrency:' + email.trim().toLowerCase()
  const [saved, setSaved] = useState<{key: string; currency: 'USDC' | 'NGN'} | null>(null)
  const currency = saved?.key === key ? saved.currency : localStorage.getItem(key) === 'NGN' ? 'NGN' : 'USDC'
  const save = async (value: string) => {
    if (value !== 'USDC' && value !== 'NGN') return false
    localStorage.setItem(key, value)
    setSaved({key, currency: value})
    return true
  }
  return { currency, save }
}
