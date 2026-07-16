import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import type { UnifiedBalanceBreakdown } from '../../lib/unifiedBalance'
import { readPocketBalances, readPocketLinkedWallets } from '../api/pocketReadClient'
import type { CirclePocketWallets } from '../models/pocketWallet'

type PocketAccessTokenReader = () => Promise<string | null>

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
  const [wallets, setWallets] = useState<CirclePocketWallets>({})
  const [rows, setRows] = useState<UnifiedBalanceBreakdown[]>([])
  const [total, setTotal] = useState(0)
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
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Circle Pocket balance refresh failed.')
    } finally {
      setBalanceBusy(false)
    }
  }, [getAccessToken])

  useEffect(() => {
    if (!authenticated || !email) {
      setWallets({})
      setRows([])
      setTotal(0)
      return
    }

    let cancelled = false
    async function hydrate() {
      try {
        const token = await getAccessToken()
        if (!token || cancelled) return
        const nextWallets = await readPocketLinkedWallets({ accessToken: token })
        if (cancelled) return
        setWallets(nextWallets)
        if (Object.keys(nextWallets).length) {
          setBalanceBusy(true)
          setError('')
          try {
            const result = await readPocketBalances({ accessToken: token })
            if (cancelled) return
            setRows(result.rows)
            setTotal(result.total)
          } catch (reason) {
            if (!cancelled) setError(reason instanceof Error ? reason.message : 'Circle Pocket balance refresh failed.')
          } finally {
            if (!cancelled) setBalanceBusy(false)
          }
        } else {
          setRows([])
          setTotal(0)
        }
      } catch {
        if (!cancelled) {
          setWallets({})
          setRows([])
          setTotal(0)
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
