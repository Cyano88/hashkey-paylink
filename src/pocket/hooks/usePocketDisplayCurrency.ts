import { useLocation } from 'react-router-dom'
import usePocketStockCurrency from './usePocketStockCurrency'
import { isXStocksPath } from '../lib/pocketRail'
import { useSyncExternalStore } from 'react'
import usePocketIdentity from './usePocketIdentity'
import { readPocketDisplayCurrency, subscribePocketDisplayCurrency } from '../lib/pocketDisplayCurrency'
export default function usePocketDisplayCurrency() {
 const { email } = usePocketIdentity()
 const { pathname } = useLocation()
 const stock = usePocketStockCurrency(email)
 const stable = useSyncExternalStore(subscribePocketDisplayCurrency, () => readPocketDisplayCurrency(email), () => 'USDC' as const)
 return isXStocksPath(pathname) ? stock.currency : stable
}
