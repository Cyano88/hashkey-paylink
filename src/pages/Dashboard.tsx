/**
 * Recipient Settlement Dashboard — /dashboard?evm=0x...
 *
 * Shows all PaymentRouted events from the recipient's router in real-time.
 * Uses viem EVM_CLIENTS (stateless public client — no wallet required).
 * Rows transition from 'incoming' to 'settled' instantly when the sweep event arrives.
 */

import { useEffect, useState, useCallback, Fragment } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { isAddress } from 'viem'
import {
  CheckCircle2, Clock, ExternalLink, Loader2, Link2,
  RefreshCw, TrendingUp, Wallet, Info, AlertCircle, ChevronDown, ChevronUp,
} from 'lucide-react'
import {
  EVM_CLIENTS, ROUTER_FACTORY, FACTORY_GET_ROUTER_ABI,
  PAYMENT_ROUTED_ABI, PAYMENT_RELAYED_ABI, FACTORY_V2_ADDRESS,
} from '../lib/router'
import { CHAIN_META } from '../lib/chains'
import { cn, truncateAddress } from '../lib/utils'
import { queryBalances, type UnifiedBalanceBreakdown, type UnifiedBalanceChainKey } from '../lib/unifiedBalance'
import { isValidSolanaAddress } from '../lib/solanaAddress'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PaymentRow {
  id:               string
  txHash:           `0x${string}`
  blockNumber:      bigint
  timestamp:        number | null
  sender:           `0x${string}`
  recipientAmount:  bigint
  treasuryAmount:   bigint
  gasCostWei:       bigint
  gasReimbUsdc:     bigint   // V2 only — gas reimb taken in USDC (0n for V1)
  status:           'settled' | 'incoming'
  flow:             'v1' | 'v2'
}

// Oldest block to scan from (Base mainnet factory deployment area)
const FROM_BLOCK = 29_500_000n

// ─── Component ───────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [searchParams] = useSearchParams()
  const evmAddr = (searchParams.get('evm') ?? '').trim()
  const solanaAddr = (searchParams.get('sol') ?? '').trim()
  const starkAddr = (searchParams.get('stark') ?? '').trim()
  const netParam = (searchParams.get('net') ?? '').trim() as UnifiedBalanceChainKey | ''
  const isMultiChain = searchParams.get('multi') === '1'

  const [routerAddr,    setRouterAddr]    = useState<`0x${string}` | null>(null)
  const [routerChecked, setRouterChecked] = useState(false)
  const [payments,      setPayments]      = useState<PaymentRow[]>([])
  const [isLoading,     setIsLoading]     = useState(false)
  const [loadError,     setLoadError]     = useState<string | null>(null)
  const [ethPrice,      setEthPrice]      = useState(2_500)
  const [expandedRow,   setExpandedRow]   = useState<string | null>(null)
  const [balanceRows,   setBalanceRows]   = useState<UnifiedBalanceBreakdown[]>([])
  const [globalBalance, setGlobalBalance] = useState(0)
  const [balanceLoading,setBalanceLoading]= useState(false)
  const [balanceError,  setBalanceError]  = useState<string | null>(null)
  const [balanceOpen,   setBalanceOpen]   = useState(false)

  const client = EVM_CLIENTS.base
  const meta   = CHAIN_META.base
  const evmValid = isAddress(evmAddr)
  const solanaValid = isValidSolanaAddress(solanaAddr)
  const starkValid = /^0x[0-9a-fA-F]{64}$/.test(starkAddr)
  const hasDashboardAddress = evmValid || solanaValid || starkValid
  const balanceChains: UnifiedBalanceChainKey[] = (() => {
    if (isMultiChain) {
      const chains: UnifiedBalanceChainKey[] = []
      if (evmValid) chains.push('base', 'arc', 'arbitrum')
      if (solanaValid) chains.push('solana')
      if (starkValid) chains.push('starknet')
      return chains
    }
    if (netParam === 'solana') return solanaValid ? ['solana'] : []
    if (netParam === 'starknet') return starkValid ? ['starknet'] : []
    if (netParam === 'arc' || netParam === 'arbitrum' || netParam === 'base') return evmValid ? [netParam] : []
    return evmValid ? ['base'] : []
  })()

  // ── Fetch ETH price (for gas cost in USD) ──────────────────────────────
  useEffect(() => {
    fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd')
      .then(r => r.json())
      .then((d: { ethereum?: { usd?: number } }) => { if (d?.ethereum?.usd) setEthPrice(d.ethereum.usd) })
      .catch(() => {})
  }, [])

  // ── Predict router address ──────────────────────────────────────────────
  useEffect(() => {
    if (!evmValid) { setRouterAddr(null); setRouterChecked(true); return }
    const factory = ROUTER_FACTORY['base']
    if (!factory) return
    setRouterChecked(false)
    client.readContract({
      address: factory, abi: FACTORY_GET_ROUTER_ABI,
      functionName: 'getRouterAddress', args: [evmAddr as `0x${string}`],
    })
      .then(addr => { setRouterAddr(addr); setRouterChecked(true) })
      .catch(() => setRouterChecked(true))
  }, [evmAddr, evmValid])

  useEffect(() => {
    let cancelled = false
    if (balanceChains.length === 0) {
      setBalanceRows([])
      setGlobalBalance(0)
      setBalanceError(null)
      setBalanceLoading(false)
      return
    }

    setBalanceLoading(true)
    setBalanceError(null)
    queryBalances({
      evmAddress: evmValid ? evmAddr : undefined,
      solanaAddress: solanaValid ? solanaAddr : undefined,
      starknetAddress: starkValid ? starkAddr : undefined,
      chains: balanceChains,
    })
      .then(result => {
        if (cancelled) return
        setGlobalBalance(result.total)
        setBalanceRows(result.rows)
        setBalanceError(result.rows.some(row => row.status === 'error') ? 'Some selected chains could not be queried' : null)
      })
      .catch(error => {
        if (cancelled) return
        setBalanceError(error instanceof Error ? error.message.slice(0, 120) : 'Unified balance query failed')
        setBalanceRows(balanceChains.map(key => ({
          key,
          label: key === 'base' ? 'Base' : key === 'arc' ? 'Arc' : key === 'arbitrum' ? 'Arbitrum' : key === 'solana' ? 'Solana' : 'Starknet',
          balance: 0,
          status: 'error',
        })))
        setGlobalBalance(0)
      })
      .finally(() => {
        if (!cancelled) setBalanceLoading(false)
      })

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evmAddr, solanaAddr, starkAddr, isMultiChain, netParam])

  // ── Build a V1 PaymentRow from a PaymentRouted log ───────────────────
  async function rowFromLog(log: {
    transactionHash: `0x${string}` | null
    blockNumber: bigint | null
    logIndex: number
    args: unknown
  }): Promise<PaymentRow | null> {
    if (!log.transactionHash || log.blockNumber == null) return null
    const args = log.args as {
      sender?: `0x${string}`
      recipientAmount?: bigint
      treasuryAmount?: bigint
    }
    const [receipt, block] = await Promise.all([
      client.getTransactionReceipt({ hash: log.transactionHash }),
      client.getBlock({ blockNumber: log.blockNumber }),
    ])
    return {
      id:              `${log.transactionHash}-${log.logIndex}`,
      txHash:          log.transactionHash,
      blockNumber:     log.blockNumber,
      timestamp:       block.timestamp ? Number(block.timestamp) * 1_000 : null,
      sender:          args.sender ?? '0x0000000000000000000000000000000000000000',
      recipientAmount: args.recipientAmount ?? 0n,
      treasuryAmount:  args.treasuryAmount  ?? 0n,
      gasCostWei:      receipt.gasUsed * receipt.effectiveGasPrice,
      gasReimbUsdc:    0n,
      status:          'settled',
      flow:            'v1',
    }
  }

  // ── Build a V2 PaymentRow from a PaymentRelayed log ───────────────────
  async function rowFromRelayedLog(log: {
    transactionHash: `0x${string}` | null
    blockNumber: bigint | null
    logIndex: number
    args: unknown
  }): Promise<PaymentRow | null> {
    if (!log.transactionHash || log.blockNumber == null) return null
    const args = log.args as {
      payout?:      bigint
      platformFee?: bigint
      gasReimb?:    bigint
    }
    const block = await client.getBlock({ blockNumber: log.blockNumber })
    return {
      id:              `v2-${log.transactionHash}-${log.logIndex}`,
      txHash:          log.transactionHash,
      blockNumber:     log.blockNumber,
      timestamp:       block.timestamp ? Number(block.timestamp) * 1_000 : null,
      sender:          '0x0000000000000000000000000000000000000000',  // not in event
      recipientAmount: args.payout      ?? 0n,
      treasuryAmount:  args.platformFee ?? 0n,
      gasCostWei:      0n,  // gas was reimbursed in USDC, not ETH
      gasReimbUsdc:    args.gasReimb ?? 0n,
      status:          'settled',
      flow:            'v2',
    }
  }

  // ── Load historical events (V1 PaymentRouted + V2 PaymentRelayed) ─────
  const loadPayments = useCallback(async () => {
    if (!routerAddr && !evmValid) return
    setIsLoading(true); setLoadError(null)
    try {
      // V1: events from the per-recipient router contract
      const v1Promise = routerAddr
        ? client.getLogs({ address: routerAddr, event: PAYMENT_ROUTED_ABI[0], fromBlock: FROM_BLOCK, toBlock: 'latest' })
            .then(logs => Promise.all(logs.map(rowFromLog)))
        : Promise.resolve([])

      // V2: events from PayLinkFactoryV2, filtered by recipient
      const v2Promise = FACTORY_V2_ADDRESS && evmValid
        ? client.getLogs({
            address:   FACTORY_V2_ADDRESS,
            event:     PAYMENT_RELAYED_ABI[0],
            fromBlock: FROM_BLOCK,
            toBlock:   'latest',
            args:      { recipient: evmAddr as `0x${string}` },
          }).then(logs => Promise.all(logs.map(rowFromRelayedLog)))
        : Promise.resolve([])

      const [v1Rows, v2Rows] = await Promise.all([v1Promise, v2Promise])
      const all = [...v1Rows, ...v2Rows].filter(Boolean) as PaymentRow[]
      setPayments(all.sort((a, b) => Number(b.blockNumber - a.blockNumber)))
    } catch (err) {
      setLoadError(err instanceof Error ? err.message.slice(0, 100) : 'Failed to load payments')
    } finally {
      setIsLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routerAddr, evmAddr, evmValid])

  useEffect(() => {
    if (routerAddr || (FACTORY_V2_ADDRESS && evmValid)) loadPayments()
  }, [routerAddr, evmAddr, evmValid, loadPayments])

  // ── Real-time listener: V1 PaymentRouted + V2 PaymentRelayed ─────────
  useEffect(() => {
    const unwatchers: (() => void)[] = []

    if (routerAddr) {
      unwatchers.push(client.watchContractEvent({
        address:         routerAddr,
        abi:             PAYMENT_ROUTED_ABI,
        eventName:       'PaymentRouted',
        pollingInterval: 2_000,
        onLogs: async (logs) => {
          const newRows = (await Promise.all(logs.map(rowFromLog))).filter(Boolean) as PaymentRow[]
          setPayments(prev => {
            const seen = new Set(prev.map(p => p.id))
            const fresh = newRows.filter(r => !seen.has(r.id))
            return fresh.length ? [...fresh, ...prev] : prev
          })
        },
      }))
    }

    if (FACTORY_V2_ADDRESS && evmValid) {
      unwatchers.push(client.watchContractEvent({
        address:         FACTORY_V2_ADDRESS,
        abi:             PAYMENT_RELAYED_ABI,
        eventName:       'PaymentRelayed',
        pollingInterval: 2_000,
        args:            { recipient: evmAddr as `0x${string}` },
        onLogs: async (logs) => {
          const newRows = (await Promise.all(logs.map(rowFromRelayedLog))).filter(Boolean) as PaymentRow[]
          setPayments(prev => {
            const seen = new Set(prev.map(p => p.id))
            const fresh = newRows.filter(r => !seen.has(r.id))
            return fresh.length ? [...fresh, ...prev] : prev
          })
        },
      }))
    }

    return () => unwatchers.forEach(u => u())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routerAddr, evmAddr, evmValid])

  // ── Computed helpers ──────────────────────────────────────────────────
  function gasCostUsdc(wei: bigint) { return Number(wei) / 1e18 * ethPrice }
  function netUsdc(row: PaymentRow) {
    if (row.flow === 'v2') return Number(row.recipientAmount) / 1e6  // gas already subtracted on-chain
    return Math.max(0, Number(row.recipientAmount) / 1e6 - gasCostUsdc(row.gasCostWei))
  }
  function grossUsdc(row: PaymentRow) {
    if (row.flow === 'v2') return Number(row.recipientAmount + row.treasuryAmount + row.gasReimbUsdc) / 1e6
    return Number(row.recipientAmount + row.treasuryAmount) / 1e6
  }
  function feeUsdc(row: PaymentRow) { return Number(row.treasuryAmount) / 1e6 }

  const totalGross = payments.reduce((s, p) => s + grossUsdc(p), 0)
  const totalNet   = payments.reduce((s, p) => s + netUsdc(p), 0)
  const totalFee   = payments.reduce((s, p) => s + feeUsdc(p), 0)

  function fmt(n: number) { return n.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) }
  function fmtTs(ts: number | null) {
    if (!ts) return '—'
    const d = new Date(ts)
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  // ── No address ────────────────────────────────────────────────────────
  if (!hasDashboardAddress) {
    return (
      <div className="mx-auto max-w-lg py-20 text-center animate-fade-in">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
          <Wallet className="h-6 w-6 text-gray-400" />
        </div>
        <h2 className="text-lg font-semibold text-gray-700">No address provided</h2>
        <p className="mt-1 text-sm text-gray-400">
          Add <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">?evm=0x...</code>, <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">?sol=...</code>, or <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">?stark=0x...</code> to the URL
        </p>
        <Link to="/" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 transition-all">
          <Link2 className="h-4 w-4" /> Create a PayLink
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl animate-fade-in space-y-6">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Payments Received</h1>
          <p className="mt-0.5 font-mono text-xs text-gray-400">
            {evmValid
              ? truncateAddress(evmAddr, 12)
              : solanaValid
                ? truncateAddress(solanaAddr, 12)
                : truncateAddress(starkAddr, 12)}
          </p>
          {routerAddr && (
            <p className="mt-1 flex items-center gap-1.5 text-[11px] text-gray-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Router: <span className="font-mono">{truncateAddress(routerAddr, 8)}</span>
              <a href={`${meta.explorerUrl}/address/${routerAddr}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-2.5 w-2.5 text-gray-300 hover:text-gray-500" />
              </a>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadPayments}
            disabled={isLoading}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-all disabled:opacity-50"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
            Refresh
          </button>
          <Link
            to="/"
            className="flex items-center gap-1.5 rounded-xl bg-black px-4 py-2 text-xs font-semibold text-white hover:bg-gray-800 transition-all"
          >
            <Link2 className="h-3.5 w-3.5" />
            New PayLink
          </Link>
        </div>
      </div>

      {/* ── Summary cards ────────────────────────────────────────────────── */}
      <div className={cn(
        'rounded-xl border border-gray-100 bg-white p-5 shadow-sm transition-all',
        balanceLoading && 'animate-pulse',
      )}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Unified Global Balance</p>
              {balanceError ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                  <AlertCircle className="h-3 w-3" /> Partial
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                  <Info className="h-3 w-3" /> Read-only
                </span>
              )}
            </div>
            <p className="mt-2 font-mono text-3xl font-bold tracking-tight text-gray-900">
              {balanceLoading ? '$--.----' : `$${fmt(globalBalance)}`}
              <span className="ml-2 text-sm font-semibold text-gray-400">USDC</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setBalanceOpen(open => !open)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-all"
          >
            Breakdown
            {balanceOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>

        {balanceOpen && (
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {balanceRows.map(row => (
              <div key={row.key} className="rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-gray-600">{row.label}</span>
                  <span className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    row.status === 'ok' ? 'bg-emerald-500' : row.status === 'error' ? 'bg-amber-500' : 'bg-gray-300',
                  )} />
                </div>
                <p className="mt-1 font-mono text-sm font-bold text-gray-900">${fmt(row.balance)}</p>
                {row.error && <p className="mt-1 text-[10px] leading-snug text-amber-600">{row.error}</p>}
              </div>
            ))}
            {balanceRows.length === 0 && (
              <p className="text-xs text-gray-400">No supported USDC balance chains were selected for this dashboard.</p>
            )}
          </div>
        )}
      </div>

      {payments.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Payments',     value: String(payments.length),        color: 'text-gray-900',    border: 'border-gray-100' },
            { label: 'Gross',        value: `$${fmt(totalGross)} USDC`,     color: 'text-gray-900',    border: 'border-gray-100' },
            { label: 'Fees Paid',    value: `-$${fmt(totalFee)} USDC`,      color: 'text-red-600',     border: 'border-red-100'  },
            { label: 'Net Received', value: `$${fmt(totalNet)} USDC`,       color: 'text-emerald-700', border: 'border-emerald-100', bg: 'bg-emerald-50/60' },
          ].map(({ label, value, color, border, bg }) => (
            <div key={label} className={cn('rounded-xl border p-4 shadow-sm', border, bg ?? 'bg-white')}>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">{label}</p>
              <p className={cn('mt-1 text-lg font-bold leading-tight', color)}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        {/* Live indicator */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <p className="text-sm font-semibold text-gray-800">Settlement History</p>
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 font-medium">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Live
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-3 py-16 text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading payment history…</span>
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <AlertCircle className="h-8 w-8 text-red-300" />
            <p className="text-sm text-gray-500">{loadError}</p>
            <button onClick={loadPayments} className="text-xs text-blue-500 underline underline-offset-2 hover:text-blue-700">
              Try again
            </button>
          </div>
        ) : payments.length === 0 ? (
          <div className="py-16 text-center">
            <TrendingUp className="mx-auto mb-4 h-10 w-10 text-gray-200" />
            <p className="text-sm font-medium text-gray-500">No payments received yet</p>
            <p className="mt-1 text-xs text-gray-400">Share your PayLink to get started</p>
            <Link
              to="/"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 transition-all"
            >
              <Link2 className="h-4 w-4" />
              Create a HashPay Link
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  {['Date', 'From', 'Gross', 'Net Received ⓘ', 'Status', 'Explorer'].map((h, i) => (
                    <th key={h} className={cn(
                      'px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400',
                      i >= 2 ? 'text-right' : 'text-left',
                      i === 4 ? 'text-center' : '',
                    )}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {payments.map((row) => {
                  const gross   = grossUsdc(row)
                  const fee     = feeUsdc(row)
                  const gas     = gasCostUsdc(row.gasCostWei)
                  const net     = netUsdc(row)
                  const isOpen  = expandedRow === row.id

                  return (
                    <Fragment key={row.id}>
                      <tr className="group hover:bg-gray-50/60 transition-colors">
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {fmtTs(row.timestamp)}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">
                          {row.flow === 'v2' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600 border border-blue-100">
                              Direct Send
                            </span>
                          ) : (
                            <a
                              href={`${meta.explorerUrl}/address/${row.sender}`}
                              target="_blank" rel="noopener noreferrer"
                              className="font-mono hover:text-blue-600 transition-colors"
                            >
                              {truncateAddress(row.sender, 6)}
                            </a>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-gray-700">
                          ${fmt(gross)}
                        </td>
                        {/* Net Received — click to expand breakdown */}
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => setExpandedRow(isOpen ? null : row.id)}
                            className="ml-auto flex items-center justify-end gap-1 font-mono text-xs font-semibold text-emerald-700 hover:text-emerald-900 transition-colors"
                            title="Click to see breakdown"
                          >
                            ${fmt(net)}
                            {isOpen
                              ? <ChevronUp   className="h-3 w-3 text-gray-400" />
                              : <ChevronDown className="h-3 w-3 text-gray-400" />}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            Settled
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <a
                            href={`${meta.explorerUrl}/tx/${row.txHash}`}
                            target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg border border-transparent px-2 py-1 text-[11px] text-blue-500 hover:border-blue-100 hover:bg-blue-50 hover:text-blue-700 transition-all"
                          >
                            {truncateAddress(row.txHash, 4)}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </td>
                      </tr>

                      {/* ── Breakdown row ─────────────────────────────────── */}
                      {isOpen && (
                        <tr className="bg-gray-50/80 animate-slide-up">
                          <td colSpan={6} className="px-5 py-4">
                            <div className="flex flex-wrap items-center gap-6">
                              <div className="space-y-0.5">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Gross Amount</p>
                                <p className="font-mono text-sm font-semibold text-gray-800">${fmt(gross)} USDC</p>
                              </div>
                              <div className="text-gray-300">—</div>
                              <div className="space-y-0.5">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Protocol Fee (0.2%)</p>
                                <p className="font-mono text-sm font-semibold text-red-500">−${fmt(fee)} USDC</p>
                              </div>
                              <div className="text-gray-300">—</div>
                              {row.flow === 'v2' ? (
                                <div className="space-y-0.5">
                                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Gas Reimb (USDC)</p>
                                  <p className="font-mono text-sm font-semibold text-red-400">
                                    −${fmt(Number(row.gasReimbUsdc) / 1e6)} USDC
                                    <span className="ml-1 text-[10px] font-normal text-gray-400">(relayer reimbursed)</span>
                                  </p>
                                </div>
                              ) : (
                                <div className="space-y-0.5">
                                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Network Gas (actual)</p>
                                  <p className="font-mono text-sm font-semibold text-red-400">
                                    −${fmt(gas)} USDC
                                    <span className="ml-1 text-[10px] font-normal text-gray-400">
                                      ({(Number(row.gasCostWei) / 1e18).toFixed(8)} ETH)
                                    </span>
                                  </p>
                                </div>
                              )}
                              <div className="text-gray-300">=</div>
                              <div className="space-y-0.5">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600">Net Received</p>
                                <p className="font-mono text-base font-bold text-emerald-700">${fmt(net)} USDC</p>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── CTA at bottom ────────────────────────────────────────────────── */}
      <div className="flex justify-center pb-4">
        <Link
          to="/"
          className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 hover:border-gray-300 transition-all active:scale-[0.98]"
        >
          <Link2 className="h-4 w-4" />
          Create a new HashPay Link
        </Link>
      </div>
    </div>
  )
}
