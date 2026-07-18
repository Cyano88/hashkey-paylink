import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
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
const pocketWalletPrefetches = new Map<string, Promise<void>>()
const POCKET_BALANCE_REFRESH_INTERVAL_MS = 45_000
const POCKET_BALANCE_FOCUS_THROTTLE_MS = 10_000

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

export async function prefetchPocketWalletSnapshot({
  email,
  getAccessToken,
}: {
  email: string
  getAccessToken: PocketAccessTokenReader
}) {
  if (!email || pocketWalletCache.has(email)) return
  const active = pocketWalletPrefetches.get(email)
  if (active) return active

  const prefetch = (async () => {
    const token = await getAccessToken()
    if (!token) throw new Error('Pocket session is not ready.')
    const [wallets, balanceOutcome] = await Promise.all([
      readPocketLinkedWallets({ accessToken: token }),
      readPocketBalances({ accessToken: token })
        .then(result => ({ result }))
        .catch(reason => ({ reason })),
    ])
    const previous = pocketWalletCache.get(email)
    pocketWalletCache.set(email, 'result' in balanceOutcome
      ? { wallets, rows: balanceOutcome.result.rows, total: balanceOutcome.result.total }
      : { wallets, rows: previous?.rows ?? [], total: previous?.total ?? 0 })
  })().finally(() => {
    pocketWalletPrefetches.delete(email)
  })

  pocketWalletPrefetches.set(email, prefetch)
  return prefetch
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
  const balanceReadInFlight = useRef(false)
  const lastBalanceReadAt = useRef(0)

  const refreshBalances = useCallback(async () => {
    if (balanceReadInFlight.current) return
    balanceReadInFlight.current = true
    setBalanceBusy(true)
    setError('')
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Email session is not ready. Sign in again and retry.')
      const result = await readPocketBalances({ accessToken: token })
      setRows(result.rows)
      setTotal(result.total)
      lastBalanceReadAt.current = Date.now()
      pocketWalletCache.set(email, {
        wallets,
        rows: result.rows,
        total: result.total,
      })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Circle Pocket balance refresh failed.')
    } finally {
      balanceReadInFlight.current = false
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
      if (balanceReadInFlight.current) return
      balanceReadInFlight.current = true
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
          lastBalanceReadAt.current = Date.now()
          pocketWalletCache.set(email, {
            wallets: nextWallets,
            rows: balanceOutcome.result.rows,
            total: balanceOutcome.result.total,
          })
        } else if (!Object.keys(nextWallets).length) {
          setRows([])
          setTotal(0)
          lastBalanceReadAt.current = Date.now()
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
      } catch {
        if (!cancelled) {
          const previous = pocketWalletCache.get(email)
          if (!previous) {
            setWallets({})
            setRows([])
            setTotal(0)
          }
        }
      } finally {
        balanceReadInFlight.current = false
        if (!cancelled) setBalanceBusy(false)
      }
    }

    void hydrate()
    return () => {
      cancelled = true
    }
  }, [authenticated, email, getAccessToken])

  useEffect(() => {
    if (!authenticated || !email) return

    const refreshVisibleBalance = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastBalanceReadAt.current < POCKET_BALANCE_FOCUS_THROTTLE_MS) return
      void refreshBalances()
    }

    const interval = window.setInterval(refreshVisibleBalance, POCKET_BALANCE_REFRESH_INTERVAL_MS)
    window.addEventListener('focus', refreshVisibleBalance)
    document.addEventListener('visibilitychange', refreshVisibleBalance)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', refreshVisibleBalance)
      document.removeEventListener('visibilitychange', refreshVisibleBalance)
    }
  }, [authenticated, email, refreshBalances])

  return { wallets, setWallets, rows, total, balanceBusy, error, setError, refreshBalances }
}
