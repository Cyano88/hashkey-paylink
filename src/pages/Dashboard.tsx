/**
 * Recipient Settlement Dashboard - /dashboard?e=0x...
 *
 * Shows direct USDC receipts and PayLinkFactoryV2 settlements for the recipient.
 * EVM history is loaded through the backend so large log scans do not run in the browser.
 * The frontend remains read-only and polls the backend for new settlement rows.
 */

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { isAddress } from 'viem'
import {
  CheckCircle2, ExternalLink, Loader2, Link2,
  RefreshCw, TrendingUp, Wallet, Info, AlertCircle, ChevronDown, ChevronUp, X,
} from 'lucide-react'
import { CHAIN_META } from '../lib/chains'
import { cn, truncateAddress } from '../lib/utils'
import { queryBalances, type UnifiedBalanceBreakdown, type UnifiedBalanceChainKey } from '../lib/unifiedBalance'
import { isValidSolanaAddress } from '../lib/solanaAddress'
import { getPaylinkParam, hasPaylinkFlag, isTelegramSourceParam } from '../lib/paylinkParams'

const OG_GLOBAL_ARCHIVE_URL = 'https://chainscan.0g.ai/address/0x79a804C49e1E5EBC279A228Ab73a7570A0D0819a#events'

// Types

interface PaymentRow {
  id:               string
  txHash:           string
  blockNumber:      bigint
  timestamp:        number | null
  sender:           string
  recipientAmount:  bigint
  treasuryAmount:   bigint
  gasCostWei:       bigint
  gasReimbUsdc:     bigint   // V2 only - gas reimb taken in USDC (0n for V1)
  status:           'settled' | 'incoming'
  flow:             'direct' | 'v2' | 'registry'
  chain:            keyof typeof CHAIN_META
  label?:           string
  source?:          string
  merchantId?:      string
  settlementType?:  string
  amountNgn?:       string
  ogRootHash?:      string
  ogTxHash?:        string
}

interface ApiPaymentRow {
  id: string
  txHash: string
  blockNumber: string
  timestamp: number | null
  sender: string
  recipientAmount: string
  treasuryAmount: string
  gasCostWei: string
  gasReimbUsdc: string
  status: 'settled' | 'incoming'
  flow: 'direct' | 'v2'
}

interface EventPaymentRow {
  eventId: string
  txHash: string
  chain: string
  payer: string
  memo: string
  amount: string
  ts: number
  source?: string
  merchantId?: string
  settlementType?: string
  amountNgn?: string
  ogRootHash?: string
  ogTxHash?: string
}

function chainKey(value: string | undefined): keyof typeof CHAIN_META {
  return value === 'solana' || value === 'starknet' || value === 'arc' || value === 'arbitrum' || value === 'hashkey'
    ? value
    : 'base'
}

function hydratePaymentRow(row: ApiPaymentRow): PaymentRow {
  return {
    ...row,
    blockNumber: BigInt(row.blockNumber),
    recipientAmount: BigInt(row.recipientAmount),
    treasuryAmount: BigInt(row.treasuryAmount),
    gasCostWei: BigInt(row.gasCostWei),
    gasReimbUsdc: BigInt(row.gasReimbUsdc),
    chain: 'base',
  }
}

function eventPaymentToRow(row: EventPaymentRow, index: number): PaymentRow {
  const amount = Number.parseFloat(row.amount || '0')
  const units = Number.isFinite(amount) ? BigInt(Math.round(amount * 1_000_000)) : 0n
  const chain = chainKey(row.chain)
  return {
    id: `event-${row.txHash || index}-${row.ts}`,
    txHash: row.txHash || '',
    blockNumber: BigInt(Math.max(0, row.ts || 0)),
    timestamp: row.ts || null,
    sender: row.payer || '',
    recipientAmount: units,
    treasuryAmount: 0n,
    gasCostWei: 0n,
    gasReimbUsdc: 0n,
    status: 'settled',
    flow: 'registry',
    chain,
    label: row.memo || row.payer || 'Payment',
    source: row.source,
    merchantId: row.merchantId,
    settlementType: row.settlementType,
    amountNgn: row.amountNgn,
    ogRootHash: row.ogRootHash,
    ogTxHash: row.ogTxHash,
  }
}

type DateFilter = 'today' | 'yesterday' | 'last7' | 'custom' | 'all'
type PosNetwork = 'base' | 'arbitrum' | 'arc' | 'solana'

const POS_NETWORK_LABELS: Record<PosNetwork, string> = {
  base: 'Base',
  arbitrum: 'Arbitrum',
  arc: 'Arc Testnet',
  solana: 'Solana',
}

function isPosNetwork(value: string): value is PosNetwork {
  return value === 'base' || value === 'arbitrum' || value === 'arc' || value === 'solana'
}

function telegramReturnUrl(params: URLSearchParams) {
  if (!isTelegramSourceParam(params)) return ''
  const raw = getPaylinkParam(params, 'return', 'r').trim()
  if (!raw) return ''
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' && url.hostname === 't.me' ? url.toString() : ''
  } catch {
    return ''
  }
}

function OgArchiveLink({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <a
      href={OG_GLOBAL_ARCHIVE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex items-center gap-2 border border-purple-100 bg-white font-medium text-gray-700 shadow-sm transition-all hover:border-purple-200 hover:bg-purple-50/40 active:scale-[0.98] dark:border-purple-900/50 dark:bg-white/[0.04] dark:text-gray-200 dark:hover:bg-purple-950/30',
        compact ? 'rounded-lg px-3 py-1.5 text-xs' : 'rounded-xl px-5 py-2.5 text-sm',
        className,
      )}
    >
      <span className={cn('relative flex items-center justify-center', compact ? 'h-4 w-4' : 'h-5 w-5')}>
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-purple-300 opacity-40" />
        <span className={cn(
          'relative inline-flex items-center justify-center rounded-full border border-purple-200 bg-purple-50 font-bold text-purple-600 dark:border-purple-800 dark:bg-purple-950/60 dark:text-purple-300',
          compact ? 'h-4 w-4 text-[7px]' : 'h-5 w-5 text-[8px]',
        )}>
          0G
        </span>
      </span>
      View 0G Global Archive
      <ExternalLink className={cn('text-gray-400 dark:text-gray-500', compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
    </a>
  )
}

function OgArchiveNotice({
  archivedCount,
  totalCount,
  className,
}: {
  archivedCount: number
  totalCount: number
  className?: string
}) {
  const archiveLabel = totalCount > 0 ? `${archivedCount}/${totalCount} archived` : 'No receipts archived yet'

  return (
    <div className={cn(
      'flex items-center justify-center gap-2 px-3 py-2 text-center',
      className,
    )}>
      <span className="shrink-0 rounded border border-purple-100 bg-purple-50 px-1 py-0.5 text-[8px] font-bold leading-none text-purple-500 dark:border-purple-900/60 dark:bg-purple-950/50 dark:text-purple-300">
        0G
      </span>
      <p className="text-[10px] text-gray-400 dark:text-gray-500">
        Payment records archived on{' '}
        <a
          href={OG_GLOBAL_ARCHIVE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-gray-500 underline-offset-2 transition-colors hover:text-purple-600 hover:underline dark:text-gray-400 dark:hover:text-purple-300"
        >
          0G decentralized storage
        </a>
        {' '}— {archiveLabel}
      </p>
    </div>
  )
}

// Component

export default function Dashboard() {
  const [searchParams] = useSearchParams()
  const evmAddr = getPaylinkParam(searchParams, 'evm', 'e').trim()
  const solanaAddr = getPaylinkParam(searchParams, 'sol', 's').trim()
  const starkAddr = getPaylinkParam(searchParams, 'stark', 'k').trim()
  const eventId = (searchParams.get('id') ?? '').trim()
  const netParam = getPaylinkParam(searchParams, 'net', 'n').trim() as UnifiedBalanceChainKey | ''
  const isMultiChain = hasPaylinkFlag(searchParams, 'multi', 'x')
  const isNgPosDashboard = searchParams.get('src') === 'ngpos' || eventId.startsWith('ngpos-')
  const telegramUrl = telegramReturnUrl(searchParams)

  const [routerChecked, setRouterChecked] = useState(false)
  const [payments,      setPayments]      = useState<PaymentRow[]>([])
  const [scanCursor,    setScanCursor]    = useState<bigint | null>(null)
  const [isLoading,     setIsLoading]     = useState(false)
  const [loadError,     setLoadError]     = useState<string | null>(null)
  const [balanceRows,   setBalanceRows]   = useState<UnifiedBalanceBreakdown[]>([])
  const [globalBalance, setGlobalBalance] = useState(0)
  const [balanceLoading,setBalanceLoading]= useState(false)
  const [balanceError,  setBalanceError]  = useState<string | null>(null)
  const [balanceOpen,   setBalanceOpen]   = useState(false)
  const [receiptFlash,  setReceiptFlash]  = useState(false)
  const [dateFilter,    setDateFilter]    = useState<DateFilter>('today')
  const [customDate,    setCustomDate]    = useState(() => new Date().toISOString().slice(0, 10))
  const [posNetworks,   setPosNetworks]   = useState<PosNetwork[]>([])
  const [activeReceipt, setActiveReceipt] = useState<PaymentRow | null>(null)
  const lastReceiptCount = useRef<number | null>(null)

  const meta   = CHAIN_META.base
  const evmValid = isAddress(evmAddr)
  const solanaValid = isValidSolanaAddress(solanaAddr)
  const starkValid = /^0x[0-9a-fA-F]{64}$/.test(starkAddr)
  const hasDashboardAddress = evmValid || solanaValid || starkValid
  const posMerchantId = eventId.startsWith('ngpos-') ? eventId.slice(6) : ''
  const receiptAddress = evmValid ? evmAddr : solanaValid ? solanaAddr : starkAddr
  const shortReceiptAddress = receiptAddress
    ? receiptAddress.startsWith('0x')
      ? `0x..${receiptAddress.slice(-4)}`
      : `${receiptAddress.slice(0, 4)}..${receiptAddress.slice(-4)}`
    : ''
  const receiptNetworks = posNetworks.length
    ? posNetworks
    : isPosNetwork(netParam)
      ? [netParam]
      : evmValid
        ? ['base']
        : solanaValid
          ? ['solana']
          : []
  const receiptNetworkLabel = receiptNetworks.map(network => POS_NETWORK_LABELS[network]).join(' · ')
  const balanceChains: UnifiedBalanceChainKey[] = (() => {
    const isPortfolioBalanceView = isMultiChain || Boolean(eventId)
    if (isPortfolioBalanceView) {
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

  useEffect(() => {
    if (!isNgPosDashboard || !posMerchantId) {
      setPosNetworks([])
      return
    }
    let cancelled = false
    fetch(`/api/ng-pos?merchant_id=${encodeURIComponent(posMerchantId)}`)
      .then(async response => {
        const data = await response.json() as { ok?: boolean; merchant?: { supported_networks?: unknown } }
        if (!response.ok || !data.ok || !Array.isArray(data.merchant?.supported_networks)) return []
        return data.merchant.supported_networks.filter((network): network is PosNetwork => typeof network === 'string' && isPosNetwork(network))
      })
      .then(networks => {
        if (!cancelled) setPosNetworks(networks)
      })
      .catch(() => {
        if (!cancelled) setPosNetworks([])
      })
    return () => { cancelled = true }
  }, [isNgPosDashboard, posMerchantId])

  // Load unified balances for selected dashboard chains.
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
  }, [evmAddr, solanaAddr, starkAddr, eventId, isMultiChain, netParam])

  // Load payment events through the backend reader.
  const loadPayments = useCallback(async (opts?: { silent?: boolean; fromBlock?: bigint; merge?: boolean }) => {
    if (eventId) {
      if (!opts?.silent) setIsLoading(true)
      setLoadError(null)
      try {
        const response = await fetch(`/api/list-event-payments?id=${encodeURIComponent(eventId)}`)
        const data = await response.json() as { ok?: boolean; error?: string; payments?: EventPaymentRow[] }
        if (!response.ok || !data.ok) throw new Error(data.error ?? 'Failed to load payments')
        const nextRows = (data.payments ?? []).map(eventPaymentToRow)
        setPayments(nextRows.sort((a, b) => Number(b.blockNumber - a.blockNumber)))
        setRouterChecked(true)
        setScanCursor(null)
      } catch (err) {
        setRouterChecked(true)
        setLoadError(err instanceof Error ? err.message.slice(0, 120) : 'Failed to load payments')
      } finally {
        if (!opts?.silent) setIsLoading(false)
      }
      return
    }

    if (!evmValid) {
      setRouterChecked(true)
      setPayments([])
      setScanCursor(null)
      return
    }

    if (!opts?.silent) setIsLoading(true)
    setLoadError(null)
    try {
      const params = new URLSearchParams({ evm: evmAddr })
      if (opts?.fromBlock != null) params.set('fromBlock', opts.fromBlock.toString())
      const response = await fetch(`/api/dashboard-payments?${params.toString()}`)
      const data = await response.json() as {
        ok?: boolean
        error?: string
        latestBlock?: string
        rows?: ApiPaymentRow[]
      }
      if (!response.ok || !data.ok) throw new Error(data.error ?? 'Failed to load payments')

      setRouterChecked(true)
      if (data.latestBlock) setScanCursor(BigInt(data.latestBlock))

      const nextRows = (data.rows ?? []).map(hydratePaymentRow)
      setPayments(prev => {
        const merged = new Map<string, PaymentRow>()
        if (opts?.merge) prev.forEach(row => merged.set(row.id, row))
        nextRows.forEach(row => merged.set(row.id, row))
        return [...merged.values()].sort((a, b) => Number(b.blockNumber - a.blockNumber))
      })
    } catch (err) {
      setRouterChecked(true)
      setLoadError(err instanceof Error ? err.message.slice(0, 120) : 'Failed to load payments')
    } finally {
      if (!opts?.silent) setIsLoading(false)
    }
  }, [eventId, evmAddr, evmValid])

  useEffect(() => {
    setRouterChecked(false)
    loadPayments()
  }, [loadPayments])

  useEffect(() => {
    if (!isNgPosDashboard) return
    if (lastReceiptCount.current == null) {
      lastReceiptCount.current = payments.length
      return
    }
    if (payments.length > lastReceiptCount.current) {
      setReceiptFlash(true)
      window.setTimeout(() => setReceiptFlash(false), 1800)
    }
    lastReceiptCount.current = payments.length
  }, [isNgPosDashboard, payments.length])

  // Lightweight live poll from the latest scanned block.
  useEffect(() => {
    if (eventId) {
      const timer = window.setInterval(() => {
        void loadPayments({ silent: true })
      }, 5_000)
      return () => window.clearInterval(timer)
    }
    if (!evmValid || scanCursor == null) return
    const timer = window.setInterval(() => {
      const overlap = scanCursor > 20n ? scanCursor - 20n : scanCursor
      void loadPayments({ silent: true, fromBlock: overlap, merge: true })
    }, 8_000)
    return () => window.clearInterval(timer)
  }, [eventId, evmValid, scanCursor, loadPayments])

  // Computed helpers
  function receivedUsdc(row: PaymentRow) {
    return Math.max(0, Number(row.recipientAmount) / 1e6)
  }
  const totalReceived = payments.reduce((s, p) => s + receivedUsdc(p), 0)
  const dayStart = useCallback((date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime(), [])
  const selectedPayments = useMemo(() => {
    if (!isNgPosDashboard || dateFilter === 'all') return payments
    const now = new Date()
    let from = 0
    let to = Number.POSITIVE_INFINITY
    if (dateFilter === 'today') {
      from = dayStart(now)
      to = from + 86_400_000
    } else if (dateFilter === 'yesterday') {
      from = dayStart(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))
      to = from + 86_400_000
    } else if (dateFilter === 'last7') {
      from = dayStart(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6))
    } else if (dateFilter === 'custom') {
      const parsed = customDate ? new Date(`${customDate}T00:00:00`) : null
      if (!parsed || Number.isNaN(parsed.getTime())) return payments
      from = dayStart(parsed)
      to = from + 86_400_000
    }
    return payments.filter(row => row.timestamp != null && row.timestamp >= from && row.timestamp < to)
  }, [customDate, dateFilter, dayStart, isNgPosDashboard, payments])
  const todayStart = dayStart(new Date())
  const todayReceived = payments
    .filter(row => row.timestamp != null && row.timestamp >= todayStart && row.timestamp < todayStart + 86_400_000)
    .reduce((s, p) => s + receivedUsdc(p), 0)
  const lastPayment = payments[0] ?? null
  const archivedCount = payments.filter(row => Boolean(row.ogTxHash)).length
  const archiveStatus = payments.length === 0
    ? 'No receipts yet'
    : archivedCount === payments.length
      ? 'All archived'
      : `${archivedCount}/${payments.length} archived`

  function fmt(n: number) {
    if (!Number.isFinite(n) || Math.abs(n) < 0.0000005) return '0'
    return n.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: n >= 1 ? 2 : 6,
    })
  }
  function fmtUsdc(n: number) { return `${fmt(n)} USDC` }
  function fmtNgn(value?: string) {
    const n = Number.parseFloat(value || '')
    if (!Number.isFinite(n)) return 'NGN not captured'
    return `₦${n.toLocaleString('en-NG', { maximumFractionDigits: 2 })}`
  }
  function fmtTs(ts: number | null) {
    if (!ts) return '-'
    const d = new Date(ts)
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  function fmtNgnSafe(value?: string) {
    const n = Number.parseFloat(value || '')
    if (!Number.isFinite(n)) return 'NGN not captured'
    return `NGN ${n.toLocaleString('en-NG', { maximumFractionDigits: 2 })}`
  }
  function fmtTime(ts: number | null) {
    if (!ts) return '-'
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  function settlementCopy(row?: PaymentRow | null) {
    if (!row) return 'USDC wallet'
    return row.settlementType === 'instant_fiat' ? 'Naira bank' : 'USDC wallet'
  }
  function rowMeta(row: PaymentRow) { return CHAIN_META[row.chain] ?? meta }
  function customerLabel(row: PaymentRow) {
    const customerSource = row.source === 'ngpos' ? (row.label || row.sender) : row.sender
    return customerSource
      ? /^0x[0-9a-fA-F]{10,}$/.test(customerSource) || customerSource.length > 36
        ? truncateAddress(customerSource, 6)
        : customerSource
      : 'Customer'
  }
  function txExplorerHref(row: PaymentRow) {
    if (!row.txHash || row.txHash.startsWith('manual_')) return ''
    return `${rowMeta(row).explorerUrl}/tx/${row.txHash}`
  }
  function ogExplorerHref(row: PaymentRow) {
    return row.ogTxHash ? `https://chainscan.0g.ai/tx/${row.ogTxHash}` : ''
  }

  // No address
  if (!hasDashboardAddress) {
    return (
      <div className="mx-auto max-w-lg py-20 text-center animate-fade-in">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
          <Wallet className="h-6 w-6 text-gray-400" />
        </div>
        <h2 className="text-lg font-semibold text-gray-700">No address provided</h2>
        <p className="mt-1 text-sm text-gray-400">
          Add <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">?e=0x...</code>, <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">?s=...</code>, or <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">?k=0x...</code> to the URL
        </p>
        <Link to="/" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 transition-all">
          <Link2 className="h-4 w-4" /> Create a PayLink
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl animate-fade-in space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-50">
            {isNgPosDashboard ? 'POS Payments' : 'Payments Received'}
          </h1>
          {isNgPosDashboard ? (
            <p className="mt-1 flex max-w-full flex-wrap items-center gap-1.5 text-xs font-medium text-gray-400 dark:text-gray-500">
              {receiptNetworkLabel && <span>{receiptNetworkLabel}</span>}
              {receiptNetworkLabel && shortReceiptAddress && <span className="text-gray-300 dark:text-gray-700">·</span>}
              {shortReceiptAddress && <span className="font-mono">{shortReceiptAddress}</span>}
            </p>
          ) : (
            <p className="mt-0.5 font-mono text-xs text-gray-400 dark:text-gray-500">
              {evmValid
                ? truncateAddress(evmAddr, 12)
                : solanaValid
                  ? truncateAddress(solanaAddr, 12)
                  : truncateAddress(starkAddr, 12)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadPayments()}
            disabled={isLoading}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-600 hover:bg-gray-50 dark:border-white/10 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10 transition-all disabled:opacity-50"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
            Refresh
          </button>
          {isNgPosDashboard ? (
            <Link
              to={eventId.startsWith('ngpos-') ? `/pos/ng?merchant_id=${encodeURIComponent(eventId.slice(6))}&manage=1` : '/pos/ng'}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-black px-3 text-xs font-semibold text-white transition-all hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
            >
              <Link2 className="h-3.5 w-3.5" />
              Open POS QR
            </Link>
          ) : telegramUrl ? (
            <a
              href={telegramUrl}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-black px-3 text-xs font-semibold text-white hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200 transition-all"
            >
              <Link2 className="h-3.5 w-3.5" />
              New Telegram PayLink
            </a>
          ) : (
            <Link
              to="/"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-black px-3 text-xs font-semibold text-white hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200 transition-all"
            >
              <Link2 className="h-3.5 w-3.5" />
              New PayLink
            </Link>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className={cn(
        'rounded-xl border border-gray-100 bg-white p-5 shadow-sm transition-all duration-500 dark:border-white/10 dark:bg-[#17181c]',
        balanceLoading && 'animate-pulse',
        receiptFlash && 'border-emerald-200 bg-emerald-50/60 shadow-emerald-100/70 dark:border-emerald-400/30 dark:bg-emerald-950/20 dark:shadow-none',
      )}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Unified Global Balance</p>
              <span className={cn(
                'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold',
                balanceError ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
              )}>
                {balanceError ? <><AlertCircle className="h-3 w-3" /> Partial</> : <><Info className="h-3 w-3" /> Read-only</>}
                <span className="text-emerald-300/80 dark:text-emerald-500/50">·</span>
                <img src="/brand/circle-logo.jpeg" alt="" className="h-3 w-3 rounded-full object-cover" />
                <span>Powered by Circle</span>
              </span>
            </div>
            <p className="mt-2 font-mono text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-50">
              {balanceLoading ? '--' : fmt(globalBalance)}
              <span className="ml-2 text-sm font-semibold text-gray-400 dark:text-gray-500">USDC</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setBalanceOpen(open => !open)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-600 hover:bg-gray-50 dark:border-white/10 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10 transition-all"
          >
            Breakdown
            {balanceOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>

        {balanceOpen && (
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {balanceRows.map(row => (
              <div key={row.key} className="rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">{row.label}</span>
                  <span className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    row.status === 'ok' ? 'bg-emerald-500' : row.status === 'error' ? 'bg-amber-500' : 'bg-gray-300',
                  )} />
                </div>
                <p className="mt-1 font-mono text-sm font-bold text-gray-900 dark:text-gray-100">{fmtUsdc(row.balance)}</p>
                {row.error && <p className="mt-1 text-[10px] leading-snug text-amber-600">{row.error}</p>}
              </div>
            ))}
            {balanceRows.length === 0 && (
              <p className="text-xs text-gray-400">No supported USDC balance chains were selected for this dashboard.</p>
            )}
          </div>
        )}
      </div>

      {isNgPosDashboard && (
        <div className={cn(
          'overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all duration-500 dark:border-white/10 dark:bg-[#17181c]',
          receiptFlash && 'border-emerald-200 bg-emerald-50/50 shadow-emerald-100/70 dark:border-emerald-400/30 dark:bg-emerald-950/15 dark:shadow-none',
        )}>
          <div className="grid divide-y divide-gray-100 dark:divide-white/10 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-5">
          {[
            { label: 'Today', value: fmtUsdc(todayReceived), tone: 'emerald' },
            { label: 'Total', value: fmtUsdc(totalReceived), tone: 'gray' },
            { label: 'Last payment', value: lastPayment ? fmtTime(lastPayment.timestamp) : 'None yet', tone: 'gray' },
            { label: 'Settlement', value: settlementCopy(lastPayment), tone: 'blue' },
            { label: '0G proof', value: archiveStatus, tone: 'purple' },
          ].map(item => (
            <div
              key={item.label}
              className="min-w-0 px-4 py-3"
            >
              <div className="flex items-center gap-2">
                <span className={cn(
                  'h-1.5 w-1.5 shrink-0 rounded-full',
                  item.tone === 'emerald' ? 'bg-emerald-500' : item.tone === 'blue' ? 'bg-blue-500' : item.tone === 'purple' ? 'bg-purple-500' : 'bg-gray-300 dark:bg-gray-600',
                )} />
                <p className="truncate text-xs font-medium text-gray-400 dark:text-gray-500">{item.label}</p>
              </div>
              <p className="mt-1.5 truncate text-[15px] font-semibold leading-tight text-gray-900 dark:text-gray-50">{item.value}</p>
            </div>
          ))}
          </div>
        </div>
      )}

      {payments.length > 0 && (
        <div className={cn('grid grid-cols-2 gap-3', isNgPosDashboard && 'hidden')}>
          {[
            { label: 'Paid',      value: String(payments.length), color: 'text-gray-900 dark:text-gray-50', border: 'border-gray-100 dark:border-white/10' },
            { label: 'Collected', value: fmtUsdc(totalReceived),  color: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-100 dark:border-emerald-900/50', bg: 'bg-emerald-50/60 dark:bg-emerald-950/20' },
          ].map(({ label, value, color, border, bg }) => (
            <div key={label} className={cn('rounded-xl border p-4 shadow-sm', border, bg ?? 'bg-white dark:bg-[#17181c]')}>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">{label}</p>
              <p className={cn('mt-1 text-lg font-bold leading-tight', color)}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-white/10 dark:bg-[#17181c]">
        {/* Live indicator */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3 dark:border-white/10">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            {isNgPosDashboard ? 'Receipts' : 'Settlement History'}
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {isNgPosDashboard && (
              <>
                <select
                  value={dateFilter}
                  onChange={event => setDateFilter(event.target.value as DateFilter)}
                  className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs font-semibold text-gray-600 outline-none transition-all hover:bg-gray-50 focus:border-gray-300 dark:border-white/10 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10"
                >
                  <option value="today">Today</option>
                  <option value="yesterday">Yesterday</option>
                  <option value="last7">Last 7 days</option>
                  <option value="custom">Custom date</option>
                  <option value="all">All</option>
                </select>
                {dateFilter === 'custom' && (
                  <input
                    type="date"
                    value={customDate}
                    onChange={event => setCustomDate(event.target.value)}
                    className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs font-semibold text-gray-600 outline-none transition-all focus:border-gray-300 dark:border-white/10 dark:bg-white/5 dark:text-gray-300"
                  />
                )}
              </>
            )}
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-600">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Live
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-3 py-16 text-gray-400 dark:text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading payment history...</span>
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <AlertCircle className="h-8 w-8 text-red-300" />
            <p className="text-sm text-gray-500 dark:text-gray-400">{loadError}</p>
            <button onClick={() => loadPayments()} className="text-xs text-blue-500 underline underline-offset-2 hover:text-blue-400">
              Try again
            </button>
          </div>
        ) : payments.length === 0 ? (
          <div className="py-16 text-center">
            <TrendingUp className="mx-auto mb-4 h-10 w-10 text-gray-200 dark:text-gray-700" />
            <p className="text-sm font-medium text-gray-500 dark:text-gray-300">No payments received yet</p>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              {isNgPosDashboard ? 'Customer payments from this POS QR will appear here.' : 'Share your PayLink to get started'}
            </p>
            {isNgPosDashboard ? null : telegramUrl ? (
              <OgArchiveLink className="mt-6" />
            ) : (
              <Link
                to="/"
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200 transition-all"
              >
                <Link2 className="h-4 w-4" />
                Create a HashPay Link
              </Link>
            )}
          </div>
        ) : isNgPosDashboard ? (
          selectedPayments.length === 0 ? (
            <div className="py-14 text-center">
              <TrendingUp className="mx-auto mb-4 h-10 w-10 text-gray-200 dark:text-gray-700" />
              <p className="text-sm font-medium text-gray-500 dark:text-gray-300">No receipts for this date</p>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Try another day or select all receipts.</p>
            </div>
          ) : (
            <div className="space-y-2 p-3">
              <div className="hidden grid-cols-[1.15fr_1fr_1fr_auto] gap-3 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 sm:grid">
                <span>Customer</span>
                <span>Amount</span>
                <span>Route</span>
                <span className="text-right">Proof</span>
              </div>
              {selectedPayments.map((row, index) => {
                const chainMeta = rowMeta(row)
                const explorerHref = txExplorerHref(row)
                const ogHref = ogExplorerHref(row)
                const customer = customerLabel(row)
                return (
                  <div
                    key={row.id}
                    role={isNgPosDashboard ? 'button' : undefined}
                    tabIndex={isNgPosDashboard ? 0 : undefined}
                    onClick={() => {
                      if (isNgPosDashboard) setActiveReceipt(row)
                    }}
                    onKeyDown={event => {
                      if (!isNgPosDashboard) return
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        setActiveReceipt(row)
                      }
                    }}
                    className={cn(
                      'grid gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm transition-all hover:border-gray-200 hover:bg-gray-50/50 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/15 dark:hover:bg-white/[0.05] sm:grid-cols-[1.15fr_1fr_1fr_auto] sm:items-center',
                      isNgPosDashboard && 'cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-950',
                    )}
                  >
                    <div className="min-w-0">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 sm:hidden">Customer</p>
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="w-6 shrink-0 text-[11px] font-semibold text-gray-400 dark:text-gray-500">#{index + 1}</span>
                        <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-50">{customer}</p>
                      </div>
                      <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{fmtTs(row.timestamp)}</p>
                    </div>

                    <div className="min-w-0">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 sm:hidden">Amount</p>
                      <p className="font-mono text-sm font-bold text-emerald-700 dark:text-emerald-300">{fmtUsdc(receivedUsdc(row))}</p>
                      <p className="mt-1 truncate text-xs font-medium text-gray-500 dark:text-gray-400">{fmtNgnSafe(row.amountNgn)}</p>
                    </div>

                    <div className="min-w-0">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 sm:hidden">Route</p>
                      <p className="truncate text-xs font-semibold text-gray-700 dark:text-gray-200">{settlementCopy(row)}</p>
                      <p className="mt-1 inline-flex items-center rounded-full border border-gray-100 bg-gray-50 px-2 py-0.5 text-[10px] font-semibold text-gray-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-400">
                        {chainMeta.label}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 sm:justify-end">
                      {ogHref ? (
                        <a
                          href={ogHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Permanently archived on 0G Storage"
                          onClick={event => event.stopPropagation()}
                          className="inline-flex items-center rounded border border-purple-100 bg-purple-50 px-1 py-0.5 text-[8px] font-bold leading-none text-purple-500 transition-colors hover:border-purple-200 hover:bg-purple-100 dark:border-purple-900/60 dark:bg-purple-950/50 dark:text-purple-300"
                        >
                          0G
                        </a>
                      ) : (
                        <span className="inline-flex items-center rounded border border-gray-100 bg-gray-50 px-1 py-0.5 text-[8px] font-bold leading-none text-gray-300 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-500">
                          0G
                        </span>
                      )}
                      {explorerHref && (
                        <a
                          href={explorerHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="View transaction"
                          onClick={event => event.stopPropagation()}
                          className="inline-flex h-7 items-center gap-1 rounded-lg border border-gray-200 px-2 text-[11px] font-semibold text-gray-500 transition-all hover:bg-gray-50 hover:text-blue-600 dark:border-white/10 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-blue-300"
                        >
                          Tx
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60 dark:border-white/10 dark:bg-white/[0.03]">
                  {['Date', 'From', 'Received', 'Status', 'Explorer'].map((h, i) => (
                    <th key={h} className={cn(
                      'px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500',
                      i >= 2 ? 'text-right' : 'text-left',
                      i === 3 ? 'text-center' : '',
                    )}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-white/10">
                {payments.map((row) => {
                  const received = receivedUsdc(row)
                  const chainMeta = rowMeta(row)

                  return (
                    <tr key={row.id} className="group hover:bg-gray-50/60 transition-colors dark:hover:bg-white/[0.03]">
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap dark:text-gray-400">
                        {fmtTs(row.timestamp)}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center rounded-full border border-gray-100 bg-gray-50 px-2 py-0.5 text-[10px] font-semibold text-gray-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-300">
                            {chainMeta.label}
                          </span>
                          {row.flow === 'v2' || row.flow === 'registry' ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300">
                              {row.label ?? 'Direct Send'}
                            </span>
                          ) : (
                            <a
                              href={`${chainMeta.explorerUrl}/address/${row.sender}`}
                              target="_blank" rel="noopener noreferrer"
                              className="font-mono hover:text-blue-600 transition-colors dark:hover:text-blue-300"
                            >
                              {truncateAddress(row.sender, 6)}
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                        {fmtUsdc(received)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                          <CheckCircle2 className="h-2.5 w-2.5" />
                          Settled
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <a
                          href={`${chainMeta.explorerUrl}/tx/${row.txHash}`}
                          target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg border border-transparent px-2 py-1 text-[11px] text-blue-500 hover:border-blue-100 hover:bg-blue-50 hover:text-blue-700 transition-all dark:text-blue-300 dark:hover:border-blue-900/50 dark:hover:bg-blue-950/30"
                        >
                          {truncateAddress(row.txHash, 4)}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CTA at bottom */}
      <div className="flex justify-center pb-4">
        {isNgPosDashboard ? (
          <OgArchiveNotice archivedCount={archivedCount} totalCount={payments.length} />
        ) : telegramUrl ? (
          <OgArchiveLink />
        ) : (
          <Link
            to="/"
            className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 hover:border-gray-300 transition-all active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200 dark:hover:bg-white/10"
          >
            <Link2 className="h-4 w-4" />
            Create a new HashPay Link
          </Link>
        )}
      </div>

      {isNgPosDashboard && activeReceipt && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 px-3 py-4 backdrop-blur-sm sm:items-center"
          onClick={() => setActiveReceipt(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-4 shadow-2xl dark:border-white/10 dark:bg-gray-950"
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">POS receipt</p>
                <h3 className="mt-1 text-base font-semibold text-gray-950 dark:text-white">{customerLabel(activeReceipt)}</h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveReceipt(null)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-100 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-700 dark:border-white/10 dark:text-gray-500 dark:hover:bg-white/10 dark:hover:text-gray-200"
                aria-label="Close receipt"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50/70 p-3 dark:border-white/10 dark:bg-white/[0.03]">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[11px] font-medium text-gray-400 dark:text-gray-500">Amount received</p>
                  <p className="mt-1 font-mono text-lg font-bold text-emerald-700 dark:text-emerald-300">
                    {fmtUsdc(receivedUsdc(activeReceipt))}
                  </p>
                </div>
                <p className="text-right text-xs font-semibold text-gray-500 dark:text-gray-400">
                  {fmtNgnSafe(activeReceipt.amountNgn)}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3 text-sm">
              {[
                ['Settlement', settlementCopy(activeReceipt)],
                ['Network', rowMeta(activeReceipt).label],
                ['Time', fmtTs(activeReceipt.timestamp)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4">
                  <span className="text-xs text-gray-400 dark:text-gray-500">{label}</span>
                  <span className="text-right text-xs font-semibold text-gray-800 dark:text-gray-200">{value}</span>
                </div>
              ))}

              <div className="flex items-center justify-between gap-4">
                <span className="text-xs text-gray-400 dark:text-gray-500">Transaction</span>
                {txExplorerHref(activeReceipt) ? (
                  <a
                    href={txExplorerHref(activeReceipt)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-100 px-2 py-1 font-mono text-[11px] font-semibold text-blue-500 transition-colors hover:bg-blue-50 dark:border-white/10 dark:hover:bg-blue-950/30"
                  >
                    {truncateAddress(activeReceipt.txHash, 5)}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <span className="font-mono text-[11px] text-gray-400">Pending</span>
                )}
              </div>

              <div className="flex items-center justify-between gap-4">
                <span className="text-xs text-gray-400 dark:text-gray-500">0G proof</span>
                {ogExplorerHref(activeReceipt) ? (
                  <a
                    href={ogExplorerHref(activeReceipt)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-purple-100 bg-purple-50 px-2 py-1 text-[11px] font-bold text-purple-600 transition-colors hover:bg-purple-100 dark:border-purple-900/60 dark:bg-purple-950/50 dark:text-purple-300"
                  >
                    Archived
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <span className="rounded border border-gray-100 bg-gray-50 px-2 py-1 text-[11px] font-semibold text-gray-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-500">
                    Archiving
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
