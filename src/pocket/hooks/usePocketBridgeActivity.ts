import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { readPendingPocketBridges, readPocketBridgeStatus, recordPocketBridge } from '../api/pocketBridgeClient'
import { readCircleEvmBridgeChallenge, reconcileCircleEvmEmailWithdraw, type CircleEvmEmailSession } from '../../lib/circleEvmEmailWallet'
import { POCKET_BRIDGES_UPDATED, bridgeProgressFromProvider, parsePocketPendingBridge, readPocketBridgeTransfers, savePocketBridgeTransfer, type PocketPendingBridge } from '../lib/pocketPendingBridge'
import { mergePocketBridgeActivity } from '../lib/pocketBridgeActivity'
import type { PocketActivityRow } from '../models/pocketActivity'

export default function usePocketBridgeActivity(input: {
  owner: string
  authenticated: boolean
  rows: PocketActivityRow[]
  getAccessToken(): Promise<string | null>
  getEvmSession(network: 'base' | 'arbitrum' | 'arc', address: string): Promise<CircleEvmEmailSession>
}) {
  const current = useRef(input)
  current.current = input
  const [transfers, setTransfers] = useState<PocketPendingBridge[]>([])
  const [messages, setMessages] = useState<Record<string, string>>({})
  const [checkingIds, setCheckingIds] = useState<string[]>([])
  const checking = useRef(new Set<string>())
  const syncing = useRef(false)
  const [storageError, setStorageError] = useState('')
  const reload = useCallback(() => {
    if (!input.authenticated || !input.owner) { setTransfers([]); return }
    try { setTransfers(readPocketBridgeTransfers(input.owner, localStorage)); setStorageError('') }
    catch { setStorageError('Some bridge details could not be loaded. Contact support before repeating an unfinished transfer.') }
  }, [input.owner, input.authenticated])
  const check = useCallback(async (record: PocketPendingBridge, interactive = true) => {
    const owner = current.current.owner
    const key = owner + ':' + record.id
    if (!owner || checking.current.has(key) || record.progress === 'failed') return
    checking.current.add(key)
    setCheckingIds([...checking.current])
    let active = record
    try {
      const token = await current.current.getAccessToken()
      if (current.current.owner !== owner) return
      if (!token) throw new Error('Sign in again to check this transfer.')
      if (active.challengeId && active.walletAddress && active.source !== 'solana' && interactive) {
        const session = await current.current.getEvmSession(active.source, active.walletAddress)
        if (current.current.owner !== owner) return
        const outcome = await readCircleEvmBridgeChallenge(session, active.challengeId)
        if (current.current.owner !== owner) return
        if (outcome.failedWithoutTransaction || outcome.sourceFailed) {
          savePocketBridgeTransfer(owner, { ...active, progress: 'failed' }, localStorage)
          setMessages(value => ({ ...value, [record.id]: 'The source transfer did not complete. You can start a new bridge with a fresh quote.' }))
          return
        }
        const result = await reconcileCircleEvmEmailWithdraw({ session, challengeId: active.challengeId, timeoutMs: 10_000 })
        if (current.current.owner !== owner) return
        if (result.txHash) active = { ...active, txHash: result.txHash, progress: 'submitted' }
      }
      if (!active.txHash) {
        if (interactive) setMessages(value => ({ ...value, [record.id]: 'The submission result is not known yet. Check again or contact support before repeating this transfer.' }))
        return
      }
      const status = await readPocketBridgeStatus({ accessToken: token, source: active.source, txHash: active.txHash })
      if (current.current.owner !== owner) return
      const progress = bridgeProgressFromProvider(status.status || 'pending', status.sourceConfirmed)
      active = { ...active, progress, historySynced: false, sourceConfirmed: Boolean(active.sourceConfirmed || status.sourceConfirmed), destinationTxHash: status.destinationTxHash || active.destinationTxHash }
      savePocketBridgeTransfer(owner, active, localStorage)
      await recordPocketBridge({ accessToken: token, ...active, txHash: active.txHash!, status: progress === 'completed' ? 'completed' : 'submitted' })
      if (current.current.owner === owner) savePocketBridgeTransfer(owner, { ...active, historySynced: true }, localStorage)
      if (current.current.owner === owner) setMessages(value => ({ ...value, [record.id]: progress === 'needs_attention' ? 'The source transfer may have succeeded, but delivery needs attention. Contact support; do not resend this transfer.' : '' }))
    } catch (reason) {
      // An unavailable status service never changes the transfer to failed.
      if (current.current.owner === owner && interactive) setMessages(value => ({ ...value, [record.id]: reason instanceof Error ? reason.message : 'Status is temporarily unavailable. Check again shortly.' }))
    } finally {
      checking.current.delete(key)
      setCheckingIds([...checking.current])
      if (current.current.owner === owner) reload()
    }
  }, [reload])
  const sync = useCallback(async () => {
    if (syncing.current || !input.authenticated || !input.owner || document.visibilityState !== 'visible') return
    syncing.current = true
    const owner = input.owner
    try {
      const token = await input.getAccessToken()
      if (!token || current.current.owner !== owner) throw new Error('Session changed')
      const records = await readPendingPocketBridges({ accessToken: token })
      if (current.current.owner !== owner) throw new Error('Session changed')
      for (const raw of records) savePocketBridgeTransfer(owner, parsePocketPendingBridge(raw), localStorage)
    } catch { /* Local transfers still recover when the activity service is down. */ }
    try {
      if (current.current.owner !== owner) return
      const records = readPocketBridgeTransfers(owner, localStorage)
      for (const record of records) {
        if (current.current.owner !== owner) break
        if (record.txHash && record.progress !== 'failed' && !(record.progress === 'completed' && record.historySynced)) await check(record, false)
      }
    } catch { /* reload reports corrupt local records without claiming failure. */ }
    finally { syncing.current = false; if (current.current.owner === owner) reload() }
  }, [input.authenticated, input.owner, input.getAccessToken, check, reload])
  useEffect(() => {
    setTransfers([]); setMessages({}); reload(); void sync()
    const onLocal = () => reload()
    const onFocus = () => { void sync() }
    window.addEventListener(POCKET_BRIDGES_UPDATED, onLocal)
    window.addEventListener('storage', onLocal)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    const timer = window.setInterval(onFocus, 10_000)
    return () => { clearInterval(timer); window.removeEventListener(POCKET_BRIDGES_UPDATED, onLocal); window.removeEventListener('storage', onLocal); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus) }
  }, [reload, sync])
  const rows = useMemo(() => mergePocketBridgeActivity(input.rows, transfers), [input.rows, transfers])
  return { rows, messages, error: storageError, check: (bridge: PocketPendingBridge) => check(bridge, true), isChecking: (id: string) => checkingIds.includes(input.owner + ':' + id) }
}
