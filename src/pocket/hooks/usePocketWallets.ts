import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import type { UnifiedBalanceBreakdown } from '../../lib/unifiedBalance'
import { readPocketBalances, readPocketLinkedWallets } from '../api/pocketReadClient'
import type { CirclePocketWallets } from '../models/pocketWallet'

type PocketAccessTokenReader = () => Promise<string | null>

type PocketWalletCacheEntry = {
  wallets: CirclePocketWallets
  rows: UnifiedBalanceBreakdown[]
  total: number
}

const pocketWalletCache = new Map<string, PocketWalletCacheEntry>()

type PocketWalletReadState = {
  wallets: CirclePocketWallets
  setWallets: Dispatch<SetStateAction<CirclePocketWallets>>
  rows: UnifiedBalanceBreakdown[]
  total: number
  balanceBusy: boolean
  error: string
  setError: Dispatch<SetStateAction<string>>
  refreshBalances: () => Promise<void>
}

export default function usePocketWallets({
  authenticated,
  email,
  getAccessToken,
}: {
  authenticated: boolean
  email: string
  getAccessToken: PocketAccessTokenReader
}): PocketWalletReadState {
  const cached = authenticated && email ? pocketWalletCache.get(email) : undefined
  const [wallets, setWallets] = useState<CirclePocketWallets>(() => cached?.wallets ?? {})
  const [rows, setRows] = useState<UnifiedBalanceBreakdown[]>(() => cached?.rows ?? [])
  const [total, setTotal] = useState(() => cached?.total ?? 0)
  const [balanceBusy, setBalanceBusy] = useState(false)
  const [error, setError] = useState('')

  const refreshBalances = useCallback(async () => {
    setBalanceBusy(true)
    setError('')
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Email session is not ready. Sign in again and retry.')
      const result = await readPocketBalances({ accessToken: token })
      setRows(result.rows)
      setTotal(result.total)
      pocketWalletCache.set(email, {
        wallets,
        rows: result.rows,
        total: result.total,
      })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Circle Pocket balance refresh failed.')
    } finally {
      setBalanceBusy(false)
    }
  }, [email, getAccessToken, wallets])

  useEffect(() => {
    if (!authenticated || !email) {
      setWallets({})
      setRows([])
      setTotal(0)
      return
    }

    const immediate = pocketWalletCache.get(email)
    if (immediate) {
      setWallets(immediate.wallets)
      setRows(immediate.rows)
      setTotal(immediate.total)
    }

    let cancelled = false
    async function hydrate() {
      try {
        const token = await getAccessToken()
        if (!token || cancelled) return
        const walletsRequest = readPocketLinkedWallets({ accessToken: token })
        const balancesRequest = readPocketBalances({ accessToken: token })
          .then(result => ({ result }))
          .catch(reason => ({ reason }))
        const nextWallets = await walletsRequest
        if (cancelled) return
        setWallets(nextWallets)
        setBalanceBusy(true)
        setError('')
        const balanceOutcome = await balancesRequest
        if (cancelled) return
        if ('result' in balanceOutcome) {
          setRows(balanceOutcome.result.rows)
          setTotal(balanceOutcome.result.total)
          pocketWalletCache.set(email, {
            wallets: nextWallets,
            rows: balanceOutcome.result.rows,
            total: balanceOutcome.result.total,
          })
        } else if (!Object.keys(nextWallets).length) {
          setRows([])
          setTotal(0)
          pocketWalletCache.set(email, { wallets: nextWallets, rows: [], total: 0 })
        } else {
          setError(balanceOutcome.reason instanceof Error ? balanceOutcome.reason.message : 'Circle Pocket balance refresh failed.')
          const previous = pocketWalletCache.get(email)
          pocketWalletCache.set(email, {
            wallets: nextWallets,
            rows: previous?.rows ?? [],
            total: previous?.total ?? 0,
          })
        }
        setBalanceBusy(false)
      } catch {
        if (!cancelled) {
          const previous = pocketWalletCache.get(email)
          if (!previous) {
            setWallets({})
            setRows([])
            setTotal(0)
          }
          setBalanceBusy(false)
        }
      }
    }

    void hydrate()
    return () => {
      cancelled = true
    }
  }, [authenticated, email, getAccessToken])

  return { wallets, setWallets, rows, total, balanceBusy, error, setError, refreshBalances }
}
