import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatUnits, parseUnits } from 'viem'
import { bridgeCircleEvmEmailWallet, type CircleEvmEmailSession } from '../../lib/circleEvmEmailWallet'
import {
  selectPocketCheckoutRoute,
  type PocketCheckoutNetwork,
  type PocketCheckoutRoute,
} from '../../lib/pocketCheckoutRouting'
import { readPocketBridgeQuote, readPocketBridgeStatus, recordPocketBridge } from '../api/pocketBridgeClient'
import { readPocketBalances, readPocketLinkedWallets } from '../api/pocketReadClient'
import { bridgeCircleSolanaWallet } from '../lib/pocketSolanaBridge'
import type { CirclePocketWallet, CirclePocketWallets } from '../models/pocketWallet'
import type { PocketSolanaEmailSession } from './usePocketWalletController'

type LiquidityStatus = 'idle' | 'checking' | 'ready' | 'moving' | 'waiting' | 'reconciling' | 'arrived'
export type PocketPaymentLiquidityCheckpoint = {
  phase: 'started' | 'submitted' | 'completed' | 'failed'
  source: PocketCheckoutNetwork
  destination: PocketCheckoutNetwork
  amount: string
  txHash: string
  claimed?: boolean
}
export type PocketPaymentLiquidityPersistence = {
  read(accessToken: string): Promise<PocketPaymentLiquidityCheckpoint | null>
  start(accessToken: string, input: { source: PocketCheckoutNetwork; destination: PocketCheckoutNetwork; amount: string }): Promise<PocketPaymentLiquidityCheckpoint>
  update(accessToken: string, input: { phase: 'submitted' | 'completed' | 'failed'; txHash?: string }): Promise<PocketPaymentLiquidityCheckpoint | null>
}

function liquidityError(reason: unknown) {
  const message = reason instanceof Error ? reason.message : String(reason ?? '')
  return /failed to fetch|networkerror|network request failed|unable to resolve host|no address associated|enotfound|pocket could not connect/i.test(message)
    ? 'Pocket could not connect. Check your connection and try again.'
    : message || 'Pocket routing is temporarily unavailable.'
}
const NETWORKS: PocketCheckoutNetwork[] = ['base', 'arbitrum', 'solana']
const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms))
const networkLabel = (network: PocketCheckoutNetwork) => network === 'base' ? 'Base' : network === 'arbitrum' ? 'Arbitrum' : 'Solana'
export const pocketBridgePollDelay = (attempt: number) => attempt < 12 ? 1_500 : attempt < 32 ? 3_000 : 5_000

async function inspectLiquidity(input: {
  accessToken: string
  destination: PocketCheckoutNetwork
  amountUnits: bigint
}) {
  const [snapshot, wallets] = await Promise.all([
    readPocketBalances({ accessToken: input.accessToken }),
    readPocketLinkedWallets({ accessToken: input.accessToken }),
  ])
  const balances = NETWORKS.map(network => {
    const row = snapshot.rows.find(candidate => candidate.key === network)
    return {
      network,
      units: row?.status === 'ok' ? parseUnits(row.balance.toFixed(6), 6) : 0n,
      available: row?.status === 'ok' && Boolean(wallets[network]),
    }
  })
  const bridgeTotals: Partial<Record<PocketCheckoutNetwork, bigint>> = {}
  let route = selectPocketCheckoutRoute({
    destination: input.destination,
    amountUnits: input.amountUnits,
    balances,
    bridgeTotals,
  })
  for (let attempt = 0; attempt < 2 && route.kind === 'quote-required'; attempt += 1) {
    const quote = await readPocketBridgeQuote({
      accessToken: input.accessToken,
      source: route.source,
      destination: route.destination,
      amount: formatUnits(route.amountUnits, 6),
    })
    bridgeTotals[route.source] = parseUnits(quote.total, 6)
    route = selectPocketCheckoutRoute({
      destination: input.destination,
      amountUnits: input.amountUnits,
      balances,
      bridgeTotals,
    })
  }
  if (route.kind === 'quote-required') throw new Error('Could not quote every eligible Pocket route.')
  return { route, wallets }
}

export default function usePocketPaymentLiquidityController(input: {
  enabled: boolean
  amount: string
  destination: PocketCheckoutNetwork
  getAccessToken(): Promise<string | null>
  ensureWallet(network: PocketCheckoutNetwork): Promise<CirclePocketWallet | null>
  getEvmSession(network: 'base' | 'arbitrum', walletAddress: string): Promise<CircleEvmEmailSession>
  getSolanaSession(walletAddress: string): Promise<PocketSolanaEmailSession>
  refreshBalances(): Promise<unknown>
  persistence?: PocketPaymentLiquidityPersistence
}) {
  const amountUnits = useMemo(() => {
    try {
      return parseUnits(input.amount || '0', 6)
    } catch {
      return 0n
    }
  }, [input.amount])
  const [route, setRoute] = useState<PocketCheckoutRoute | null>(null)
  const [wallets, setWallets] = useState<CirclePocketWallets>({})
  const [status, setStatus] = useState<LiquidityStatus>('idle')
  const [error, setError] = useState('')
  const run = useRef(0)

  const inspect = useCallback(async () => {
    if (amountUnits <= 0n) throw new Error('Payment amount is unavailable.')
    const accessToken = await input.getAccessToken()
    if (!accessToken) throw new Error('Sign in again to check Pocket balances.')
    const result = await inspectLiquidity({
      accessToken,
      destination: input.destination,
      amountUnits,
    })
    return { ...result, accessToken }
  }, [amountUnits, input.destination, input.getAccessToken])

  useEffect(() => {
    const current = ++run.current
    if (!input.enabled || amountUnits <= 0n) {
      setRoute(null)
      setWallets({})
      setStatus('idle')
      setError('')
      return
    }
    setStatus('checking')
    setError('')
    void inspect()
      .then(result => {
        if (run.current !== current) return
        setRoute(result.route)
        setWallets(result.wallets)
        setStatus(result.route.kind === 'insufficient' ? 'idle' : 'ready')
      })
      .catch(reason => {
        if (run.current !== current) return
        setRoute(null)
        setStatus('idle')
        setError(liquidityError(reason))
      })
  }, [amountUnits, input.enabled, inspect])

  const ensureLiquidity = useCallback(async () => {
    setError('')
    setStatus('checking')
    try {
      const inspected = await inspect()
      const checkpoint = await input.persistence?.read(inspected.accessToken) ?? null
      let currentRoute = inspected.route
      if ((checkpoint?.phase === 'submitted' || checkpoint?.phase === 'completed') && checkpoint.txHash) {
        const checkpointAmountUnits = parseUnits(checkpoint.amount, 6)
        currentRoute = {
          kind: 'bridge',
          source: checkpoint.source,
          destination: checkpoint.destination,
          amountUnits: checkpointAmountUnits,
          totalSourceUnits: checkpointAmountUnits,
        }
      }
      setRoute(currentRoute)
      setWallets(inspected.wallets)
      if (currentRoute.kind === 'insufficient') {
        throw new Error('No single gas-sponsored source can cover the remaining amount and bridge fee.')
      }
      const destinationWallet = inspected.wallets[currentRoute.destination]
        ?? await input.ensureWallet(currentRoute.destination)
      if (!destinationWallet) throw new Error('Open the destination Pocket wallet before paying.')
      if (checkpoint?.phase === 'completed') {
        void input.refreshBalances().catch(() => undefined)
        setStatus('arrived')
        return destinationWallet
      }
      if (currentRoute.kind === 'direct') {
        if (checkpoint?.phase === 'submitted' || checkpoint?.phase === 'completed') {
          await input.persistence?.update(inspected.accessToken, { phase: 'completed', txHash: checkpoint.txHash })
        } else if (checkpoint?.phase === 'started') {
          await input.persistence?.update(inspected.accessToken, { phase: 'failed' })
        }
        setStatus('ready')
        return destinationWallet
      }
      let activeCheckpoint = checkpoint?.phase === 'completed' ? null : checkpoint
      const sourceWallet = inspected.wallets[currentRoute.source]
        ?? await input.ensureWallet(currentRoute.source)
      if (!sourceWallet?.walletId || !sourceWallet.blockchain || !destinationWallet.address) {
        throw new Error('Open both Pocket wallets before moving USDC.')
      }
      const amount = formatUnits(currentRoute.amountUnits, 6)
      let txHash = ''
      let complete = false
      if (activeCheckpoint?.phase === 'started' && !activeCheckpoint.txHash) {
        await input.persistence?.update(inspected.accessToken, { phase: 'failed' }).catch(() => null)
        activeCheckpoint = null
      }
      if (activeCheckpoint && activeCheckpoint.phase !== 'failed') {
        if (activeCheckpoint.source !== currentRoute.source || activeCheckpoint.destination !== currentRoute.destination || activeCheckpoint.amount !== amount) {
          throw new Error('A previous payment move needs review before another route can start.')
        }
        txHash = activeCheckpoint.txHash
      }
      if (!txHash) {
        let started = await input.persistence?.start(inspected.accessToken, { source: currentRoute.source, destination: currentRoute.destination, amount })
        if (started && !started.claimed && !started.txHash) {
          await input.persistence?.update(inspected.accessToken, { phase: 'failed' }).catch(() => null)
          started = await input.persistence?.start(inspected.accessToken, { source: currentRoute.source, destination: currentRoute.destination, amount })
        }
        if (started && !started.claimed) {
          if (started.source !== currentRoute.source || started.amount !== amount || !started.txHash) {
            throw new Error('Payment timed out. No money was sent. Try again.')
          }
          txHash = started.txHash
          complete = started.phase === 'completed'
        }
      }
      if (!txHash) {
        setStatus('moving')
        try {
          txHash = currentRoute.source === 'solana'
            ? await bridgeCircleSolanaWallet({
                session: await input.getSolanaSession(sourceWallet.address),
                destination: currentRoute.destination as 'base' | 'arbitrum',
                destinationAddress: destinationWallet.address,
                amount,
                accessToken: inspected.accessToken,
              })
            : await bridgeCircleEvmEmailWallet({
                session: await input.getEvmSession(currentRoute.source, sourceWallet.address),
                destination: currentRoute.destination,
                destinationAddress: destinationWallet.address,
                amount,
              })
        } catch (reason) {
          const message = reason instanceof Error ? reason.message : ''
          if (!/submitted and is being reconciled|still moving|without a verifiable source transaction|check activity before retrying/i.test(message)) {
            await input.persistence?.update(inspected.accessToken, { phase: 'failed' }).catch(() => null)
          }
          throw reason
        }
        await input.persistence?.update(inspected.accessToken, { phase: 'submitted', txHash })
      }
      await recordPocketBridge({
        accessToken: inspected.accessToken,
        source: currentRoute.source,
        destination: currentRoute.destination,
        amount,
        txHash,
        status: 'submitted',
      }).catch(() => undefined)
      setStatus('waiting')
      for (let attempt = 0; attempt < 12 && !complete; attempt += 1) {
        if (attempt) await wait(pocketBridgePollDelay(attempt))
        const next = await readPocketBridgeStatus({
          accessToken: inspected.accessToken,
          source: currentRoute.source,
          txHash,
        }).catch(() => null)
        complete = next?.status === 'confirmed' || next?.status === 'complete'
      }
      if (!complete) throw new Error('USDC move submitted. Pocket will continue automatically.')
      await input.persistence?.update(inspected.accessToken, { phase: 'completed', txHash })
      void recordPocketBridge({
        accessToken: inspected.accessToken,
        source: currentRoute.source,
        destination: currentRoute.destination,
        amount,
        txHash,
        status: 'completed',
      }).catch(() => undefined)
      // Circle forward confirmation is provider truth that the destination
      // transaction completed. Do not block the payment on a lagging balance
      // index after that confirmation.
      void input.refreshBalances().catch(() => undefined)
      setStatus('arrived')
      return destinationWallet
    } catch (reason) {
      const message = liquidityError(reason)
      const retryBlocked = /submitted and is being reconciled|USDC move submitted|still moving|without a verifiable source transaction|check activity before retrying/i.test(message)
      setStatus(retryBlocked ? 'reconciling' : 'idle')
      setError(message)
      throw reason
    }
  }, [amountUnits, input.ensureWallet, input.getEvmSession, input.getSolanaSession, input.persistence, input.refreshBalances, inspect])

  const prepareLiquidity = useCallback(async () => {
    const inspected = await inspect()
    const checkpoint = await input.persistence?.read(inspected.accessToken) ?? null
    let currentRoute = inspected.route
    if ((checkpoint?.phase === 'submitted' || checkpoint?.phase === 'completed') && checkpoint.txHash) {
      const checkpointAmountUnits = parseUnits(checkpoint.amount, 6)
      currentRoute = { kind: 'bridge', source: checkpoint.source, destination: checkpoint.destination, amountUnits: checkpointAmountUnits, totalSourceUnits: checkpointAmountUnits }
    }
    if (currentRoute.kind !== 'bridge') return
    const sourceWallet = inspected.wallets[currentRoute.source] ?? await input.ensureWallet(currentRoute.source)
    if (!sourceWallet) throw new Error('Open the source Pocket wallet before confirming this payment.')
    if (currentRoute.source === 'solana') await input.getSolanaSession(sourceWallet.address)
    else await input.getEvmSession(currentRoute.source, sourceWallet.address)
  }, [input.ensureWallet, input.getEvmSession, input.getSolanaSession, input.persistence, inspect])

  const notice = error
    || (status === 'checking'
      ? 'Checking gas-sponsored USDC routes.'
      : status === 'moving'
        ? 'Moving USDC to ' + networkLabel(input.destination) + '.'
        : status === 'waiting' || status === 'reconciling'
          ? 'USDC is moving. Payment will continue after confirmed arrival.'
          : route?.kind === 'bridge'
            ? 'Moving ' + formatUnits(route.amountUnits, 6) + ' USDC from ' + networkLabel(route.source) + ' to complete the payment on ' + networkLabel(route.destination) + '.'
            : route?.kind === 'insufficient'
              ? 'Your available USDC cannot cover this payment and the network move.'
              : route?.kind === 'direct'
                ? networkLabel(route.destination) + ' can cover this payment.'
                : '')

  return {
    route,
    wallets,
    status,
    error,
    notice,
    checking: status === 'checking',
    busy: status === 'checking' || status === 'moving' || status === 'waiting' || status === 'reconciling',
    insufficient: route?.kind === 'insufficient',
    prepareLiquidity,
    ensureLiquidity,
  }
}
