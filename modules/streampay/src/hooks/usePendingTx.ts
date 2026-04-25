import { useCallback, useEffect, useRef, useState } from 'react'
import { createPublicClient, http, defineChain } from 'viem'

// ── Arc public RPC (frontend-safe, no key) ────────────────────────────────────
const arc = defineChain({
  id:             5042002,
  name:           'Arc Testnet',
  nativeCurrency: { decimals: 18, name: 'USD Coin', symbol: 'USDC' },
  rpcUrls:        { default: { http: ['https://rpc.testnet.arc.network'] } },
})

const client = createPublicClient({ chain: arc, transport: http() })

const STORAGE_KEY = 'streampay:pending_txs'
const POLL_MS     = 4_000   // check every 4 seconds
const TTL_MS      = 3_600_000  // discard unconfirmed entries older than 1 hour

// ── Types ─────────────────────────────────────────────────────────────────────

export type PendingAction = 'claim' | 'cancel'
export type TxStatus      = 'pending' | 'confirmed' | 'failed'

export interface PendingTx {
  txHash:       `0x${string}`
  vaultAddress: `0x${string}`
  action:       PendingAction
  timestamp:    number        // ms since epoch
  status:       TxStatus
}

// ── Storage helpers ───────────────────────────────────────────────────────────

function loadStored(): PendingTx[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const all: PendingTx[] = JSON.parse(raw)
    // Evict entries older than TTL to avoid stale noise
    return all.filter(t => Date.now() - t.timestamp < TTL_MS)
  } catch {
    return []
  }
}

function saveStored(txs: PendingTx[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(txs))
  } catch { /* localStorage quota exceeded — ignore */ }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * usePendingTx
 *
 * Persists in-flight transactions to localStorage so they survive a tab close.
 * On mount, resumes polling for any pending txs from a previous session.
 *
 * @param vaultAddress  If provided, only surfaces txs for this vault.
 */
export function usePendingTx(vaultAddress?: `0x${string}`) {
  const [allTxs, setAllTxs] = useState<PendingTx[]>(loadStored)
  const pollingRef = useRef<Set<`0x${string}`>>(new Set())

  // Derive the view for the current vault
  const pendingTxs = vaultAddress
    ? allTxs.filter(t => t.vaultAddress.toLowerCase() === vaultAddress.toLowerCase())
    : allTxs

  // ── Mutation helpers ───────────────────────────────────────────────────────

  const addPending = useCallback((
    txHash:       `0x${string}`,
    vaultAddr:    `0x${string}`,
    action:       PendingAction,
  ) => {
    const tx: PendingTx = {
      txHash,
      vaultAddress: vaultAddr,
      action,
      timestamp: Date.now(),
      status:    'pending',
    }
    setAllTxs(prev => {
      const updated = [...prev.filter(t => t.txHash !== txHash), tx]
      saveStored(updated)
      return updated
    })
  }, [])

  const updateStatus = useCallback((txHash: `0x${string}`, status: TxStatus) => {
    setAllTxs(prev => {
      const updated = prev.map(t => t.txHash === txHash ? { ...t, status } : t)
      saveStored(updated)
      return updated
    })
  }, [])

  const dismiss = useCallback((txHash: `0x${string}`) => {
    setAllTxs(prev => {
      const updated = prev.filter(t => t.txHash !== txHash)
      saveStored(updated)
      return updated
    })
  }, [])

  // ── Background poller ──────────────────────────────────────────────────────
  // Starts a poll loop for each pending tx, survives across re-renders via ref set.

  useEffect(() => {
    const pending = allTxs.filter(t => t.status === 'pending')

    for (const tx of pending) {
      if (pollingRef.current.has(tx.txHash)) continue  // already polling
      pollingRef.current.add(tx.txHash)

      let attempts = 0
      const MAX_ATTEMPTS = 150  // 150 × 4s = 10 minutes before giving up

      async function poll() {
        attempts++
        try {
          const receipt = await client.getTransactionReceipt({ hash: tx.txHash })
          if (receipt) {
            const status: TxStatus = receipt.status === 'success' ? 'confirmed' : 'failed'
            updateStatus(tx.txHash, status)
            pollingRef.current.delete(tx.txHash)
            return
          }
        } catch {
          // tx not yet mined — keep polling
        }

        if (attempts < MAX_ATTEMPTS) {
          setTimeout(poll, POLL_MS)
        } else {
          // Give up — mark as failed after timeout
          updateStatus(tx.txHash, 'failed')
          pollingRef.current.delete(tx.txHash)
        }
      }

      // Slight stagger to avoid slamming the RPC on multi-tx resume
      setTimeout(poll, pollingRef.current.size * 500)
    }
  }, [allTxs, updateStatus])

  return { pendingTxs, addPending, dismiss }
}
