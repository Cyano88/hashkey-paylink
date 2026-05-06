import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams, Link, useOutletContext } from 'react-router-dom'
import type { LayoutOutletContext } from '../Layout'
import {
  useAccount,
  useChainId,
  useSwitchChain,
  useDisconnect,
  useSendTransaction,
  useWaitForTransactionReceipt,
  useSignTypedData,
  useReadContract,
  useWriteContract,
} from 'wagmi'
import { ConnectButton, useConnectModal } from '@rainbow-me/rainbowkit'
import {
  parseEther,
  parseUnits,
  isAddress,
  encodeFunctionData,
  parseSignature,
  concat,
} from 'viem'

// ─── Base Builder Code (ERC-8021) ─────────────────────────────────────────────
// Appended to calldata on Base Mainnet transactions only. Hex of "bc_8qtb7tny".
const BASE_BUILDER_CODE = '0x62635f3871746237746e79' as `0x${string}`
import {
  ArrowLeft, ArrowRight, CheckCircle2, ExternalLink, AlertCircle, Loader2, ArrowLeftRight,
  RefreshCw, ShieldCheck, Zap, Copy, CheckCheck, Wallet,
  AlertTriangle, Radio,
} from 'lucide-react'
import {
  CHAIN_META, PLATFORM_FEE_BPS, EVM_TREASURY, STARK_TREASURY, type ChainKey,
} from '../lib/chains'
import {
  EVM_CLIENTS,
  ROUTER_FACTORY,
  FACTORY_GET_ROUTER_ABI,
  FACTORY_DEPLOY_ROUTER_ABI,
  PAYMENT_ROUTED_ABI,
  ERC20_TRANSFER_ABI,
  ERC20_BALANCE_OF_ABI,
  ROUTER_SWEEP_ABI,
  FACTORY_V2_ADDRESSES,
} from '../lib/router'
import { useStarknet } from '../lib/StarknetContext'
import { useSolana }   from '../lib/SolanaContext'
import { computeStarkGhostAddress } from '../lib/starknet-ghost'
import { cn, truncateAddress, formatAmount, memoToHex, copyToClipboard } from '../lib/utils'
import { getFxMeta, formatLocalAmt, fetchFxRate } from '../lib/fx'

const CHAINS: ChainKey[] = ['base', 'starknet', 'arc', 'solana', 'ethereum']

const CHAIN_DISPLAY_NAMES: Record<number, string> = {
  1:       'Ethereum',
  10:      'Optimism',
  56:      'BNB Chain',
  137:     'Polygon',
  177:     'HashKey',
  8453:    'Base',
  42161:   'Arbitrum',
  43114:   'Avalanche',
  5042002: 'Arc',
}

// ─── Starknet RPC ─────────────────────────────────────────────────────────────
const STARKNET_RPC = 'https://rpc.starknet.lava.build'

// ─── Multicall3 ──────────────────────────────────────────────────────────────
const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11' as `0x${string}`

const MULTICALL3_AGGREGATE3_ABI = [{
  name: 'aggregate3', type: 'function' as const, stateMutability: 'payable' as const,
  inputs: [{ name: 'calls', type: 'tuple[]', components: [
    { name: 'target',       type: 'address' },
    { name: 'allowFailure', type: 'bool'    },
    { name: 'callData',     type: 'bytes'   },
  ]}],
  outputs: [{ name: 'returnData', type: 'tuple[]', components: [
    { name: 'success',    type: 'bool'  },
    { name: 'returnData', type: 'bytes' },
  ]}],
}] as const

const MULTICALL3_AGGREGATE3VALUE_ABI = [{
  name: 'aggregate3Value', type: 'function' as const, stateMutability: 'payable' as const,
  inputs: [{ name: 'calls', type: 'tuple[]', components: [
    { name: 'target',       type: 'address' },
    { name: 'allowFailure', type: 'bool'    },
    { name: 'value',        type: 'uint256' },
    { name: 'callData',     type: 'bytes'   },
  ]}],
  outputs: [{ name: 'returnData', type: 'tuple[]', components: [
    { name: 'success',    type: 'bool'  },
    { name: 'returnData', type: 'bytes' },
  ]}],
}] as const

const ERC20_PERMIT_ABI = [{
  name: 'permit', type: 'function' as const, stateMutability: 'nonpayable' as const,
  inputs: [
    { name: 'owner',    type: 'address' },
    { name: 'spender',  type: 'address' },
    { name: 'value',    type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
    { name: 'v',        type: 'uint8'   },
    { name: 'r',        type: 'bytes32' },
    { name: 's',        type: 'bytes32' },
  ],
  outputs: [],
}] as const

const ERC20_TRANSFER_FROM_ABI = [{
  name: 'transferFrom', type: 'function' as const, stateMutability: 'nonpayable' as const,
  inputs: [
    { name: 'from',   type: 'address' },
    { name: 'to',     type: 'address' },
    { name: 'amount', type: 'uint256' },
  ],
  outputs: [{ type: 'bool' }],
}] as const

const NONCES_ABI = [{
  name: 'nonces', type: 'function' as const, stateMutability: 'view' as const,
  inputs:  [{ name: 'owner', type: 'address' }],
  outputs: [{ name: '',      type: 'uint256' }],
}] as const

// ─── Starknet helpers ─────────────────────────────────────────────────────────
async function pollStarknetReceipt(txHash: string, signal: AbortSignal): Promise<void> {
  const deadline = Date.now() + 3 * 60_000
  while (Date.now() < deadline && !signal.aborted) {
    await new Promise((r) => setTimeout(r, 4000))
    if (signal.aborted) break
    try {
      const res = await fetch(STARKNET_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'starknet_getTransactionReceipt', params: [txHash], id: 1 }),
        signal,
      })
      const json = await res.json()
      const status: string = json?.result?.finality_status ?? ''
      if (status === 'ACCEPTED_ON_L2' || status === 'ACCEPTED_ON_L1') return
      if (json?.result?.execution_status === 'REVERTED') throw new Error('Transaction reverted on Starknet')
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') break
    }
  }
}

/**
 * Queries USDC balance via our own backend proxy (/api/starknet-balance).
 * Direct browser→Starknet RPC calls are blocked by CORS; the backend proxy has no such restriction.
 */
async function starkUsdcBalance(tokenAddress: string, accountAddress: string): Promise<bigint> {
  const res = await fetch('/api/starknet-balance', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ tokenAddress, accountAddress }),
  })
  const data = await res.json() as { ok: boolean; balance?: string; error?: string }
  if (!data.ok) throw new Error(data.error ?? 'starknet-balance API failed')
  return BigInt(data.balance ?? '0x0')
}

// ─── Error message normaliser ─────────────────────────────────────────────────
function friendlyErrorMsg(raw: string): string {
  const s = raw.toLowerCase()
  if (s.includes('insufficient') || s.includes('exceeds balance') || s.includes('exceeds the balance') ||
      s.includes('transfer amount exceeds') || s.includes('not enough'))
    return 'Insufficient funds — check your balance and try again.'
  if (s.includes('user rejected') || s.includes('user denied') || s.includes('rejected the request') || s.includes('user cancelled'))
    return 'Transaction cancelled in wallet.'
  if (s.includes('reverted') || s.includes('execution reverted'))
    return 'Transaction reverted — permit may have expired. Try again.'
  if (s.includes('nonce') || s.includes('already known'))
    return 'Nonce conflict — please wait a moment and try again.'
  if (s.includes('gas') && s.includes('insufficient'))
    return 'Insufficient gas — add funds to cover network fees.'
  return raw.slice(0, 120)
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function PaymentPage() {
  const [searchParams] = useSearchParams()
  const { onPayChainChange } = useOutletContext<LayoutOutletContext>()

  const evmParam    = searchParams.get('evm')    ?? searchParams.get('to') ?? ''
  const starkParam  = searchParams.get('stark')  ?? ''
  const amt         = searchParams.get('amt')    ?? ''
  const memo        = searchParams.get('memo')   ?? ''
  const legacyChain = searchParams.get('chain')  as ChainKey | null
  const netParam    = searchParams.get('net')    as ChainKey | null

  const resolvedStark  = starkParam || (legacyChain === 'starknet' ? evmParam : '')
  const resolvedEvm    = legacyChain === 'starknet' ? '' : evmParam
  const resolvedSolana = searchParams.get('sol') ?? ''
  const isMultiChain   = searchParams.get('multi') === '1'
  const isFlex         = searchParams.get('flex')  === '1'

  // netParam (from new link format) takes priority; legacy chain param as fallback
  const [chain, setChain] = useState<ChainKey>(() => {
    if (netParam === 'base' || netParam === 'starknet' || netParam === 'hashkey' || netParam === 'arc' || netParam === 'solana' || netParam === 'ethereum') return netParam
    if (legacyChain === 'base' || legacyChain === 'starknet' || legacyChain === 'hashkey' || legacyChain === 'arc') return legacyChain
    if (resolvedStark && !resolvedEvm) return 'starknet'
    if (resolvedSolana && !resolvedEvm && !resolvedStark) return 'solana'
    return 'base'
  })

  // Multi-chain links: chain toggle free before payment, locked only by success card after.
  // Single-chain links: locked to the net= param chain.
  const netLocked = !!netParam && !isMultiChain

  // Sync header pill with initial chain on mount
  useEffect(() => { onPayChainChange(chain) }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Flexible amount (payer-entered) ──────────────────────────────────────
  const [flexAmt,     setFlexAmt]     = useState('')
  const [flexMemo,    setFlexMemo]    = useState('')
  const [fxInputMode, setFxInputMode] = useState<'usdc' | 'local'>('usdc')
  const [localAmt,    setLocalAmt]    = useState('')

  // ── UI state ──────────────────────────────────────────────────────────────
  const [hashCopied,        setHashCopied]       = useState(false)
  const [addrCopied,        setAddrCopied]        = useState(false)
  const [manualPayDetected, setManualPayDetected] = useState(false)
  const [manualTxHash,      setManualTxHash]      = useState<`0x${string}` | null>(null)
  const [receivedAmount,    setReceivedAmount]    = useState<bigint | null>(null)
  const [showCheckButton,   setShowCheckButton]   = useState(false)
  const [isManualChecking,  setIsManualChecking]  = useState(false)
  const [sweepState,        setSweepState]        = useState<'idle' | 'calling' | 'pending_profitability' | 'done' | 'failed'>('idle')
  const [sweepTxHash,       setSweepTxHash]       = useState<string | null>(null)
  const [sweepBalanceUsdc,  setSweepBalanceUsdc]  = useState<number | null>(null)

  // ── Event mode ─────────────────────────────────────────────────────────────
  // Capture event params from the INITIAL URL at mount — before the direct-send
  // V2 flow can overwrite ?id= via window.history.replaceState.
  const [initParams] = useState(() => new URLSearchParams(window.location.search))
  const isEventMode      = initParams.get('event') === '1'
  const eventId          = initParams.get('id') ?? ''
  const [attendeeName,   setAttendeeName]   = useState('')
  const [eventRegStatus, setEventRegStatus] = useState<'idle' | 'pending' | 'ok' | 'error'>('idle')
  const eventRegistered  = useRef(false)

  // ── FX display (event mode only — reads params baked into the URL at link creation) ──
  const fxCurrency  = isEventMode ? (initParams.get('fx') ?? '') : ''
  const fxShow      = isEventMode && initParams.get('fxshow') === '1' && !!fxCurrency
  const fxSrc       = initParams.get('fxsrc') === 'custom' ? 'custom' : 'live'
  const fxCustomVal = parseFloat(initParams.get('fxrate') ?? '0') || 0

  const [fxRate,    setFxRate]    = useState<number | null>(fxSrc === 'custom' && fxCustomVal > 0 ? fxCustomVal : null)
  const [fxLoading, setFxLoading] = useState(false)
  const [fxStale,   setFxStale]   = useState(false)

  const refreshFxRate = useCallback(async () => {
    if (!fxCurrency || fxSrc === 'custom') return
    setFxLoading(true)
    try {
      const d = await fetchFxRate(fxCurrency)
      if (d.ok && d.rate) { setFxRate(d.rate); setFxStale(d.stale ?? false) }
    } catch { /* ignore */ }
    finally { setFxLoading(false) }
  }, [fxCurrency, fxSrc])

  useEffect(() => { if (fxShow && fxSrc === 'live') refreshFxRate() }, [fxShow, fxSrc, refreshFxRate])

  // Flex USDC amount — when payer types in local currency, convert to USDC here
  const flexAmtInUsdc = fxInputMode === 'local' && fxRate && parseFloat(localAmt) > 0
    ? (parseFloat(localAmt) / fxRate).toFixed(6)
    : flexAmt

  // effectiveAmt: always USDC
  const effectiveAmt = isFlex ? flexAmtInUsdc : amt

  // flexPayDisabled: accounts for USDC and local-currency input modes
  const flexPayDisabled = isFlex && (
    fxInputMode === 'local'
      ? (!localAmt || parseFloat(localAmt) <= 0 || !fxRate)
      : (!flexAmt  || parseFloat(flexAmt)  <= 0)
  )

  // ── Direct Send state (shared across Base, Arc, Starknet) ────────────────
  const [payMode,          setPayMode]          = useState<'wallet' | 'direct'>((chain === 'starknet' || chain === 'ethereum') ? 'wallet' : 'direct')
  const [directLinkId,     setDirectLinkId]     = useState<string | null>(null)
  // EVM chains (Base / Arc): the CREATE2 ghost vault address
  const [directVault,      setDirectVault]      = useState<`0x${string}` | null>(null)
  // Starknet: the counterfactual OZ account address
  const [starkDirectAddr,  setStarkDirectAddr]  = useState<string | null>(null)
  const [directStatus,     setDirectStatus]     = useState<'idle' | 'waiting' | 'relaying' | 'success' | 'error'>('idle')
  const [directTxHash,     setDirectTxHash]     = useState<string | null>(null)
  const [directError,      setDirectError]      = useState<string | null>(null)
  const [directAddrCopied, setDirectAddrCopied] = useState(false)
  const [directHashCopied, setDirectHashCopied] = useState(false)
  const directRelayedRef = useRef(false)
  const directPollRef    = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Router state (predicted via public RPC, no wallet needed) ─────────────
  const [routerAddr,    setRouterAddr]    = useState<`0x${string}` | null>(null)
  const [routerDeployed, setRouterDeployed] = useState<boolean | null>(null)

  // ── Stale-closure guards ─────────────────────────────────────────────────
  const detectedRef = useRef(false)
  useEffect(() => { detectedRef.current = manualPayDetected }, [manualPayDetected])

  // ── EVM wallet hooks ──────────────────────────────────────────────────────
  const { isConnected, address } = useAccount()
  const chainId                  = useChainId()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const { disconnect: disconnectEvm } = useDisconnect()
  const { openConnectModal }     = useConnectModal()

  const {
    sendTransaction, data: evmTxHash,
    isPending: isEvmWalletPending, isError: isEvmSendError,
    error: evmSendError, reset: resetEvmSend,
  } = useSendTransaction()

  const { isLoading: isEvmConfirming, isSuccess: isEvmConfirmed, isError: isEvmReverted } =
    useWaitForTransactionReceipt({ hash: evmTxHash })

  // ── GHO relay state (Ethereum — relayer submits tx on payer's behalf) ──────
  const [ghoRelayHash,    setGhoRelayHash]    = useState<`0x${string}` | undefined>(undefined)
  const [ghoRelayPending, setGhoRelayPending] = useState(false)
  const [ghoRelayError,   setGhoRelayError]   = useState<string | null>(null)
  const [ghoGasEstimate,  setGhoGasEstimate]  = useState<bigint>(0n)

  const { isLoading: isGhoConfirming, isSuccess: isGhoConfirmed } =
    useWaitForTransactionReceipt({ hash: ghoRelayHash, chainId: 1 })

  const { signTypedDataAsync, isPending: isSignPending, reset: resetPermitSign } = useSignTypedData()

  const { writeContract: callSweep, isPending: isSweeping } = useWriteContract()

  const { data: permitNonce } = useReadContract({
    address: chain === 'base'
      ? CHAIN_META.base.tokenAddress
      : chain === 'ethereum'
      ? CHAIN_META.ethereum.tokenAddress
      : CHAIN_META.arc.tokenAddress,
    abi: NONCES_ABI,
    functionName: 'nonces',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    chainId: (chain === 'base'
      ? CHAIN_META.base.chainId
      : chain === 'ethereum'
      ? CHAIN_META.ethereum.chainId
      : CHAIN_META.arc.chainId) as number,
    query: { enabled: (chain === 'base' || chain === 'arc' || chain === 'ethereum') && !!address },
  })

  // ── Starknet ──────────────────────────────────────────────────────────────
  const { address: starkAccount, isConnecting: isStarkConnecting, connect: connectStarknet } = useStarknet()
  const [starkTxHash,       setStarkTxHash]      = useState<string | null>(null)
  const [isStarkPending,    setIsStarkPending]    = useState(false)
  const [isStarkConfirming, setIsStarkConfirming] = useState(false)
  const [isStarkConfirmed,  setIsStarkConfirmed]  = useState(false)
  const [starkError,        setStarkError]        = useState<string | null>(null)
  const starkPollAbort = useRef<AbortController | null>(null)

  // ── Solana ────────────────────────────────────────────────────────────────
  const { address: solanaWalletAddr, isConnecting: isSolanaConnecting, connect: connectSolana, disconnect: disconnectSolana } = useSolana()
  const [solanaTxHash,         setSolanaTxHash]         = useState<string | null>(null)
  const [isSolanaPending,      setIsSolanaPending]      = useState(false)
  const [isSolanaConfirming,   setIsSolanaConfirming]   = useState(false)
  const [isSolanaConfirmed,    setIsSolanaConfirmed]    = useState(false)
  const [solanaError,          setSolanaError]          = useState<string | null>(null)
  // Solana Send-via-Address
  const [solanaLinkId,         setSolanaLinkId]         = useState<string | null>(null)
  const [solanaVaultAddr,      setSolanaVaultAddr]      = useState<string | null>(null)
  const [solanaDirectStatus,   setSolanaDirectStatus]   = useState<'idle' | 'waiting' | 'relaying' | 'success' | 'error'>('idle')
  const [solanaDirectTxHash,   setSolanaDirectTxHash]   = useState<string | null>(null)
  const [solanaDirectError,    setSolanaDirectError]    = useState<string | null>(null)
  const [solanaAddrCopied,     setSolanaAddrCopied]     = useState(false)
  const [solanaDirHashCopied,  setSolanaDirHashCopied]  = useState(false)

  // ── Derived ───────────────────────────────────────────────────────────────
  const isEvmChain    = chain !== 'starknet' && chain !== 'solana'
  const isHskOnly     = legacyChain === 'hashkey'
  const meta          = CHAIN_META[chain]
  const targetChainId =
    chain === 'base'     ? CHAIN_META.base.chainId     :
    chain === 'arc'      ? CHAIN_META.arc.chainId      :
    chain === 'ethereum' ? CHAIN_META.ethereum.chainId :
    CHAIN_META.hashkey.chainId
  const isCorrectNetwork = isEvmChain ? chainId === targetChainId : true
  const feeAmount        = (parseFloat(effectiveAmt) || 0) * (PLATFORM_FEE_BPS / 10_000)

  const activeRecipient = chain === 'starknet' ? resolvedStark
    : chain === 'solana' ? resolvedSolana
    : resolvedEvm
  const displayAddress  = (isEvmChain && routerAddr) ? routerAddr : activeRecipient
  const isRouterAddress = isEvmChain && !!routerAddr

  const missingStark   = chain === 'starknet' && !resolvedStark
  const missingSolana  = chain === 'solana'   && !resolvedSolana
  const effectiveMemo  = isEventMode ? attendeeName : (isFlex ? (flexMemo || memo) : memo)

  const isValidParams =
    (isFlex || (!isNaN(parseFloat(amt)) && parseFloat(amt) > 0)) &&
    (isAddress(resolvedEvm) || !!resolvedStark || !!resolvedSolana)

  // Whether Direct Send is available for the current chain
  const canDirectSend =
    ((chain === 'base' || chain === 'arc') && isAddress(resolvedEvm) && !!FACTORY_V2_ADDRESSES[chain as 'base' | 'arc']) ||
    (chain === 'solana' && !!resolvedSolana)

  // ── Step 1: Predict router address + check deployment ────────────────────
  useEffect(() => {
    if (!resolvedEvm || chain === 'starknet') {
      setRouterAddr(null)
      setRouterDeployed(null)
      return
    }
    const factory = ROUTER_FACTORY[chain as 'base' | 'hashkey' | 'arc']
    if (!factory) { setRouterAddr(null); setRouterDeployed(null); return }

    const client = EVM_CLIENTS[chain as 'base' | 'hashkey' | 'arc']
    let cancelled = false
    setRouterAddr(null)
    setRouterDeployed(null)

    async function predict() {
      try {
        const router = await client.readContract({
          address: factory!,
          abi: FACTORY_GET_ROUTER_ABI,
          functionName: 'getRouterAddress',
          args: [resolvedEvm as `0x${string}`],
        })
        if (cancelled) return
        setRouterAddr(router)

        const code = await client.getBytecode({ address: router })
        if (cancelled) return
        setRouterDeployed(!!code && code !== '0x')
      } catch {
        if (!cancelled) { setRouterAddr(null); setRouterDeployed(false) }
      }
    }
    predict()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedEvm, chain])

  // ── Step 2: Real-time payment listener ───────────────────────────────────
  useEffect(() => {
    if (manualPayDetected || chain === 'starknet' || chain === 'solana' || !resolvedEvm) return

    const evmChain = chain as 'base' | 'hashkey' | 'arc'
    const client   = EVM_CLIENTS[evmChain]

    let unwatchTransfer: (() => void) | undefined
    let unwatchRouted:   (() => void) | undefined
    let hskTimer:        ReturnType<typeof setInterval> | undefined

    if (chain === 'hashkey') {
      let initialBalance: bigint | null = null
      const requestedWei = parseEther(effectiveAmt || '0')

      hskTimer = setInterval(async () => {
        if (detectedRef.current) { clearInterval(hskTimer); return }
        try {
          const bal = await client.getBalance({ address: resolvedEvm as `0x${string}` })
          if (initialBalance === null) { initialBalance = bal; return }
          if (bal > initialBalance && bal >= initialBalance + requestedWei * 99n / 100n) {
            const received = bal - initialBalance
            setReceivedAmount(received)
            setManualTxHash(null)
            setManualPayDetected(true)
          }
        } catch { /* rpc hiccup — retry next tick */ }
      }, 2_000)

    } else {
      const tokenAddress = chain === 'base'
        ? CHAIN_META.base.tokenAddress
        : CHAIN_META.arc.tokenAddress

      const watchTarget = (routerAddr ?? resolvedEvm) as `0x${string}`
      const requestedUnits = parseUnits(effectiveAmt || '0', meta.decimals)

      unwatchTransfer = client.watchContractEvent({
        address:         tokenAddress,
        abi:             ERC20_TRANSFER_ABI,
        eventName:       'Transfer',
        args:            { to: watchTarget },
        pollingInterval: 2_000,
        onLogs(logs) {
          if (detectedRef.current) return
          const log   = logs[0]
          if (!log)   return
          const value = (log.args as { value?: bigint }).value ?? 0n
          if (value >= requestedUnits * 99n / 100n) {
            setReceivedAmount(isRouterAddress ? value * 9950n / 10000n : value)
            setManualTxHash(log.transactionHash ?? null)
            setManualPayDetected(true)
          }
        },
      })

      if (routerAddr) {
        unwatchRouted = client.watchContractEvent({
          address:         routerAddr,
          abi:             PAYMENT_ROUTED_ABI,
          eventName:       'PaymentRouted',
          pollingInterval: 2_000,
          onLogs(logs) {
            if (detectedRef.current) return
            const log = logs[0]
            if (!log)  return
            const args = log.args as { recipientAmount?: bigint }
            if (args.recipientAmount != null) setReceivedAmount(args.recipientAmount)
            setManualTxHash(log.transactionHash ?? null)
            setManualPayDetected(true)
          },
        })
      }
    }

    return () => {
      unwatchTransfer?.()
      unwatchRouted?.()
      if (hskTimer) clearInterval(hskTimer)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain, resolvedEvm, routerAddr, manualPayDetected, amt])

  // ── Auto-sweep keeper ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!manualPayDetected || !isRouterAddress || !routerAddr || chain === 'hashkey') return
    setSweepState('calling')
    const evmChain = chain as 'base' | 'arc'
    fetch('/api/sweep', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ router: routerAddr, chain: evmChain }),
    })
      .then(r => r.json())
      .then((data: { ok: boolean; status?: string; tx?: string; balanceUsdc?: number }) => {
        if (data.balanceUsdc != null) setSweepBalanceUsdc(data.balanceUsdc)
        if (data.status === 'swept' || data.status === 'empty') {
          setSweepTxHash(data.tx ?? null)
          setSweepState('done')
        } else if (data.status === 'pending_profitability') {
          setSweepState('pending_profitability')
        } else {
          setSweepState('failed')
        }
      })
      .catch(() => setSweepState('failed'))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualPayDetected])

  // ── Reset payMode on chain switch: Starknet wallet-only, all others direct ─
  useEffect(() => {
    setPayMode((chain === 'starknet' || chain === 'ethereum') ? 'wallet' : 'direct')
  }, [chain])

  // ── V2 EVM: Generate linkId + compute ghost vault address ─────────────────
  useEffect(() => {
    if (payMode !== 'direct') return
    if (chain === 'starknet') return
    const factoryAddr = FACTORY_V2_ADDRESSES[chain as 'base' | 'arc' | 'hashkey']
    if (!factoryAddr || !resolvedEvm) return

    const params  = new URLSearchParams(window.location.search)
    const idParam = params.get('id')
    let linkId: `0x${string}`
    if (idParam && /^0x[0-9a-fA-F]{64}$/.test(idParam)) {
      linkId = idParam as `0x${string}`
    } else {
      const bytes = crypto.getRandomValues(new Uint8Array(32))
      linkId = ('0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')) as `0x${string}`
      params.set('id', linkId)
      window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`)
    }
    setDirectLinkId(linkId)

    const client = EVM_CLIENTS[chain as 'base' | 'arc' | 'hashkey']
    let cancelled = false
    client.readContract({
      address:      factoryAddr,
      abi:          [{ name: 'getVaultAddress', type: 'function' as const, stateMutability: 'view' as const,
        inputs: [{ name: 'linkId', type: 'bytes32' as const }, { name: 'recipient', type: 'address' as const }],
        outputs: [{ name: '', type: 'address' as const }],
      }],
      functionName: 'getVaultAddress',
      args:         [linkId, resolvedEvm as `0x${string}`],
    }).then(addr => {
      if (!cancelled) {
        setDirectVault(addr as `0x${string}`)
        setDirectStatus('waiting')
        directRelayedRef.current = false
      }
    }).catch(() => {})
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payMode, resolvedEvm, chain])

  // ── V2 EVM: Poll balance at ghost vault; trigger relay on arrival ─────────
  // Base/Arc: polls ERC-20 USDC balance
  // HashKey:  polls native HSK balance (no ERC-20 token on HashKey)
  useEffect(() => {
    if (directStatus !== 'waiting' || !directVault || !directLinkId) return
    if (chain === 'starknet') return

    const evmChain  = chain as 'base' | 'arc' | 'hashkey'
    const client    = EVM_CLIENTS[evmChain]
    const isNative  = chain === 'hashkey'
    const token     = isNative ? null : (CHAIN_META[evmChain as 'base' | 'arc'].tokenAddress as `0x${string}`)

    const check = async () => {
      if (directRelayedRef.current) return
      try {
        let balance: bigint
        if (isNative) {
          balance = await client.getBalance({ address: directVault! })
        } else {
          balance = await client.readContract({
            address:      token!,
            abi:          ERC20_BALANCE_OF_ABI,
            functionName: 'balanceOf',
            args:         [directVault],
          }) as bigint
        }

        if (balance > 0n && !directRelayedRef.current) {
          directRelayedRef.current = true
          if (directPollRef.current) clearInterval(directPollRef.current)
          setReceivedAmount(balance)
          setDirectStatus('relaying')
          fetch('/api/relay-v2', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ linkId: directLinkId, recipient: resolvedEvm, chain: evmChain }),
          })
            .then(r => r.json())
            .then((data: { ok: boolean; txHash?: string; error?: string }) => {
              if (data.ok && data.txHash) {
                setDirectTxHash(data.txHash)
                setDirectStatus('success')
              } else {
                setDirectError(data.error ?? 'Relay failed')
                setDirectStatus('error')
              }
            })
            .catch((e: Error) => {
              setDirectError(e.message ?? 'Relay failed')
              setDirectStatus('error')
            })
        }
      } catch { /* ignore poll errors — retry next tick */ }
    }

    directPollRef.current = setInterval(check, 3000)
    check()
    return () => { if (directPollRef.current) clearInterval(directPollRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directStatus, directVault, directLinkId, chain])


  // ── Solana Send-via-Address: generate linkId + fetch vault ATA ───────────
  useEffect(() => {
    if (chain !== 'solana' || payMode !== 'direct' || !resolvedSolana) return
    const params    = new URLSearchParams(window.location.search)
    const idParam   = params.get('sid')
    let linkId: string
    if (idParam) {
      linkId = idParam
    } else {
      const bytes = crypto.getRandomValues(new Uint8Array(16))
      linkId = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
      params.set('sid', linkId)
      window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`)
    }
    setSolanaLinkId(linkId)
    setSolanaVaultAddr(null)
    setSolanaDirectStatus('idle')
    fetch(`/api/solana-vault?linkId=${encodeURIComponent(linkId)}`)
      .then(r => r.json())
      .then((data: { ok: boolean; vaultAddress?: string; error?: string }) => {
        if (data.ok && data.vaultAddress) {
          setSolanaVaultAddr(data.vaultAddress)
          setSolanaDirectStatus('waiting')
        } else {
          setSolanaDirectError(data.error ?? 'Could not derive vault address')
          setSolanaDirectStatus('error')
        }
      })
      .catch(() => {
        setSolanaDirectError('Network error — could not reach relay server')
        setSolanaDirectStatus('error')
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain, payMode, resolvedSolana])

  // ── Solana Send-via-Address: poll server for sweep ────────────────────────
  useEffect(() => {
    if (solanaDirectStatus !== 'waiting' || !solanaLinkId || !resolvedSolana || chain !== 'solana') return
    let cancelled = false

    const check = async () => {
      if (cancelled) return
      try {
        const res = await fetch('/api/solana-sweep', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ linkId: solanaLinkId, recipient: resolvedSolana }),
        })
        const data = await res.json() as { ok: boolean; status?: string; txHash?: string; recipientAmount?: string; error?: string }
        if (data.ok && data.status === 'swept' && data.txHash) {
          if (data.recipientAmount) setReceivedAmount(BigInt(data.recipientAmount))
          setSolanaDirectTxHash(data.txHash)
          setSolanaDirectStatus('success')
          setSolanaLinkId(null)
        } else if (res.status === 503 || (data.error && data.status !== 'waiting')) {
          // Hard error (relay not configured, tx failure) — stop polling, show error
          setSolanaDirectError(data.error ?? 'Relay unavailable')
          setSolanaDirectStatus('error')
        }
        // status==='waiting' → no USDC yet, keep polling silently
      } catch { /* network hiccup — retry next tick */ }
    }

    const timer = setInterval(check, 3000)
    check()
    return () => { cancelled = true; clearInterval(timer) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solanaDirectStatus, solanaLinkId, resolvedSolana, chain])

  // ── Solana: mark confirmed when direct send succeeds ─────────────────────
  useEffect(() => {
    if (solanaDirectStatus === 'success') setIsSolanaConfirmed(true)
  }, [solanaDirectStatus])

  // ── Manual claim fallback ─────────────────────────────────────────────────
  async function handleManualClaim() {
    if (!routerAddr || !isRouterAddress) return
    const tokenAddress = chain === 'base' ? CHAIN_META.base.tokenAddress : CHAIN_META.arc.tokenAddress
    setSweepState('calling')
    try {
      const res  = await fetch('/api/sweep', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ router: routerAddr, chain }),
      })
      const data = await res.json() as { ok: boolean; status?: string; tx?: string }
      if (data.ok && (data.status === 'swept' || data.status === 'empty')) {
        setSweepTxHash(data.tx ?? null)
        setSweepState('done')
        return
      }
    } catch { /* fall through to wallet sweep */ }
    if (isConnected) {
      callSweep({
        address:      routerAddr,
        abi:          ROUTER_SWEEP_ABI,
        functionName: 'sweep',
        args:         [tokenAddress],
        chainId:      targetChainId,
      })
      setSweepState('done')
    } else {
      setSweepState('failed')
    }
  }

  // ── "Check Status" button ─────────────────────────────────────────────────
  useEffect(() => {
    if (manualPayDetected || chain === 'starknet' || chain === 'solana' || !resolvedEvm) return
    setShowCheckButton(false)
    const timer = setTimeout(() => setShowCheckButton(true), 15_000)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain, resolvedEvm, manualPayDetected])

  async function handleManualCheck() {
    if (!resolvedEvm || chain === 'starknet') return
    setIsManualChecking(true)
    try {
      const evmChain = chain as 'base' | 'hashkey' | 'arc'
      const client   = EVM_CLIENTS[evmChain]
      if (chain === 'hashkey') {
        const bal          = await client.getBalance({ address: resolvedEvm as `0x${string}` })
        const requestedWei = parseEther(effectiveAmt || '0')
        if (bal >= requestedWei * 99n / 100n) {
          setReceivedAmount(bal); setManualTxHash(null); setManualPayDetected(true)
        }
      } else {
        const tokenAddress   = chain === 'base' ? CHAIN_META.base.tokenAddress : CHAIN_META.arc.tokenAddress
        const target         = (routerAddr ?? resolvedEvm) as `0x${string}`
        const requestedUnits = parseUnits(effectiveAmt || '0', meta.decimals)
        const balance = await client.readContract({
          address: tokenAddress, abi: ERC20_BALANCE_OF_ABI,
          functionName: 'balanceOf', args: [target],
        })
        if (balance >= requestedUnits * 99n / 100n) {
          setReceivedAmount(isRouterAddress ? balance * 9950n / 10000n : balance)
          setManualTxHash(null); setManualPayDetected(true)
        }
      }
    } catch { /* ignore */ }
    setIsManualChecking(false)
  }

  // ── Auto-switch network when wallet connects ──────────────────────────────
  useEffect(() => {
    if (isEvmChain && isConnected && !isCorrectNetwork && !isSwitching)
      switchChain({ chainId: targetChainId })
  }, [isEvmChain, isConnected, isCorrectNetwork, isSwitching, switchChain, targetChainId])

  // ── Chain switch ──────────────────────────────────────────────────────────
  function handleChainSwitch(c: ChainKey) {
    if (isHskOnly && c !== 'hashkey') return
    if (c === chain) return
    // Chains that don't support Send via Address — fall back to wallet connect
    if (c === 'starknet') setPayMode('wallet')
    // Auto-disconnect: switching TO Solana drops EVM; switching AWAY from Solana drops Solana
    if (c === 'solana' && isConnected) disconnectEvm()
    if (c !== 'solana' && solanaWalletAddr) disconnectSolana()
    onPayChainChange(c)   // mirror in header pill (non-interactive, display only)
    setChain(c)
    resetEvmSend()
    resetPermitSign()
    setStarkTxHash(null); setIsStarkPending(false); setIsStarkConfirming(false)
    setIsStarkConfirmed(false); setStarkError(null)
    starkPollAbort.current?.abort()
    setIsSolanaPending(false); setIsSolanaConfirming(false); setIsSolanaConfirmed(false)
    setSolanaError(null); setSolanaTxHash(null)
    setSolanaLinkId(null); setSolanaVaultAddr(null)
    setSolanaDirectStatus('idle'); setSolanaDirectTxHash(null); setSolanaDirectError(null)
    setManualPayDetected(false); setManualTxHash(null); setReceivedAmount(null)
    setRouterAddr(null); setRouterDeployed(null); setShowCheckButton(false)
    setSweepState('idle'); setSweepTxHash(null); setSweepBalanceUsdc(null)
    // Reset direct send state
    setDirectLinkId(null); setDirectVault(null); setStarkDirectAddr(null)
    setDirectStatus('idle'); setDirectTxHash(null); setDirectError(null)
    directRelayedRef.current = false
    if (directPollRef.current) { clearInterval(directPollRef.current); directPollRef.current = null }
    if (isConnected && c !== 'starknet' && c !== 'solana') {
      const cid =
        c === 'base'    ? CHAIN_META.base.chainId    :
        c === 'arc'     ? CHAIN_META.arc.chainId     :
        CHAIN_META.hashkey.chainId
      switchChain({ chainId: cid })
    }
  }

  // ── Copy handlers ─────────────────────────────────────────────────────────
  async function handleCopyHash() {
    const hash = chain === 'starknet' ? starkTxHash : chain === 'solana' ? solanaTxHash : evmTxHash
    if (!hash) return
    await copyToClipboard(hash)
    setHashCopied(true)
    setTimeout(() => setHashCopied(false), 2000)
  }

  async function handleCopyAddress() {
    if (!displayAddress) return
    await copyToClipboard(displayAddress)
    setAddrCopied(true)
    setTimeout(() => setAddrCopied(false), 3000)
  }

  // ── Fetch GHO gas estimate when Ethereum chain is active ─────────────────
  useEffect(() => {
    if (chain !== 'ethereum') return
    fetch('/api/relay-gho')
      .then(r => r.json())
      .then((d: { ok: boolean; gasReimbGho?: string }) => {
        if (d.gasReimbGho) setGhoGasEstimate(BigInt(d.gasReimbGho))
      })
      .catch(() => {})
  }, [chain])

  // ── GHO relay pay (Ethereum — relayer submits tx, payer only signs) ───────
  async function handleGhoRelayPay() {
    if (!address || !activeRecipient) return
    setGhoRelayError(null)
    setGhoRelayPending(true)

    const tokenAddress = CHAIN_META.ethereum.tokenAddress
    const totalUnits   = parseUnits(effectiveAmt || '0', 18)
    const deadline     = BigInt(Math.floor(Date.now() / 1000) + 3600)
    const nonce        = permitNonce ?? 0n

    // Refresh gas estimate just before signing so it's accurate
    let gasReimbGho = ghoGasEstimate
    try {
      const est = await fetch('/api/relay-gho').then(r => r.json()) as { ok: boolean; gasReimbGho?: string }
      if (est.gasReimbGho) { gasReimbGho = BigInt(est.gasReimbGho); setGhoGasEstimate(gasReimbGho) }
    } catch { /* use cached */ }

    try {
      const sig = await signTypedDataAsync({
        domain: { name: 'Gho Token', version: '1', chainId: 1, verifyingContract: tokenAddress },
        types: {
          Permit: [
            { name: 'owner',    type: 'address' },
            { name: 'spender',  type: 'address' },
            { name: 'value',    type: 'uint256' },
            { name: 'nonce',    type: 'uint256' },
            { name: 'deadline', type: 'uint256' },
          ],
        },
        primaryType: 'Permit',
        message: { owner: address, spender: MULTICALL3_ADDRESS, value: totalUnits, nonce, deadline },
      })

      const { v, r, s } = parseSignature(sig)

      const relayRes = await fetch('/api/relay-gho', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner:       address,
          recipient:   activeRecipient,
          amount:      totalUnits.toString(),
          deadline:    deadline.toString(),
          v:           Number(v),
          r,
          s,
          gasReimbGho: gasReimbGho.toString(),
        }),
      })
      const data = await relayRes.json() as { ok: boolean; txHash?: `0x${string}`; error?: string }
      if (!data.ok || !data.txHash) throw new Error(data.error ?? 'Relay failed')
      setGhoRelayHash(data.txHash)
    } catch (err) {
      setGhoRelayError(err instanceof Error ? friendlyErrorMsg(err.message) : 'Relay failed')
    } finally {
      setGhoRelayPending(false)
    }
  }

  // ── Payment handlers ──────────────────────────────────────────────────────
  async function handlePay() {
    if (!activeRecipient) return
    if (chain === 'ethereum') await handleGhoRelayPay()
    else if (chain === 'base' || chain === 'arc') await handleEvmPermitPay()
    else if (chain === 'starknet') handleStarknetPay()
    else if (chain === 'solana') await handleSolanaPay()
    else handleHashKeyPay()
  }

  async function handleSolanaPay() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const provider = (window as any).phantom?.solana ?? (window as any).solana ?? (window as any).solflare
    if (!provider || !solanaWalletAddr) {
      setSolanaError('No Solana wallet found. Install Phantom or Solflare.')
      return
    }
    setIsSolanaPending(true); setSolanaError(null)
    try {
      const buildRes = await fetch('/api/solana-build-tx', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ from: solanaWalletAddr, to: resolvedSolana, amount: effectiveAmt }),
      })
      const buildData = await buildRes.json() as { ok: boolean; tx?: string; error?: string }
      if (!buildData.ok || !buildData.tx) throw new Error(buildData.error ?? 'Failed to build transaction')

      const { Transaction } = await import('@solana/web3.js')
      const txBytes = Uint8Array.from(atob(buildData.tx), c => c.charCodeAt(0))
      const tx = Transaction.from(txBytes)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const signedTx = await (provider as any).signTransaction(tx)

      const bytes = (signedTx as { serialize: () => Uint8Array }).serialize()
      let binary = ''
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
      const signedB64 = btoa(binary)

      setIsSolanaPending(false); setIsSolanaConfirming(true)

      const relayRes = await fetch('/api/solana-relay', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tx: signedB64 }),
      })
      const relayData = await relayRes.json() as { ok: boolean; txHash?: string; error?: string }
      if (!relayData.ok || !relayData.txHash) throw new Error(relayData.error ?? 'Relay failed')

      setSolanaTxHash(relayData.txHash)
      setIsSolanaConfirming(false); setIsSolanaConfirmed(true)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transaction rejected'
      setSolanaError(msg.slice(0, 160))
      setIsSolanaPending(false); setIsSolanaConfirming(false)
    }
  }

  async function handleEvmPermitPay() {
    if (!address) return
    const meta_       = chain === 'arc' ? CHAIN_META.arc : chain === 'ethereum' ? CHAIN_META.ethereum : CHAIN_META.base
    const tokenAddress = meta_.tokenAddress
    const deadline     = BigInt(Math.floor(Date.now() / 1000) + 3600)
    const totalUnits   = parseUnits(effectiveAmt || '0', meta_.decimals)
    const feeBps       = BigInt(PLATFORM_FEE_BPS)
    const feeUnits     = totalUnits * feeBps / 10_000n
    const recipientUnits = totalUnits - feeUnits
    const nonce        = permitNonce ?? 0n
    // GHO EIP-712 domain: name="Gho Token", version="1"
    const permitDomain = chain === 'arc'
      ? { name: 'USDC',      version: '2', chainId: targetChainId, verifyingContract: tokenAddress }
      : chain === 'ethereum'
      ? { name: 'Gho Token', version: '1', chainId: targetChainId, verifyingContract: tokenAddress }
      : { name: 'USD Coin',  version: '2', chainId: targetChainId, verifyingContract: tokenAddress }
    try {
      const sig = await signTypedDataAsync({
        domain: permitDomain,
        types: {
          Permit: [
            { name: 'owner',    type: 'address' },
            { name: 'spender',  type: 'address' },
            { name: 'value',    type: 'uint256' },
            { name: 'nonce',    type: 'uint256' },
            { name: 'deadline', type: 'uint256' },
          ],
        },
        primaryType: 'Permit',
        message: { owner: address, spender: MULTICALL3_ADDRESS, value: totalUnits, nonce, deadline },
      })
      const { v, r, s } = parseSignature(sig)
      const baseCallData = encodeFunctionData({
        abi: MULTICALL3_AGGREGATE3_ABI, functionName: 'aggregate3',
        args: [[
          { target: tokenAddress, allowFailure: false, callData: encodeFunctionData({
              abi: ERC20_PERMIT_ABI, functionName: 'permit',
              args: [address, MULTICALL3_ADDRESS, totalUnits, deadline, Number(v), r, s],
          })},
          { target: tokenAddress, allowFailure: false, callData: encodeFunctionData({
              abi: ERC20_TRANSFER_FROM_ABI, functionName: 'transferFrom',
              args: [address, activeRecipient as `0x${string}`, recipientUnits],
          })},
          { target: tokenAddress, allowFailure: false, callData: encodeFunctionData({
              abi: ERC20_TRANSFER_FROM_ABI, functionName: 'transferFrom',
              args: [address, EVM_TREASURY, feeUnits],
          })},
        ]],
      })
      sendTransaction({
        to: MULTICALL3_ADDRESS, value: 0n, chainId: targetChainId,
        // Append Base Builder Code on Base Mainnet only (ERC-8021)
        data: chain === 'base' ? concat([baseCallData, BASE_BUILDER_CODE]) : baseCallData,
      })
    } catch { /* user rejected */ }
  }

  function handleHashKeyPay() {
    const totalNative     = parseEther(effectiveAmt || '0')
    const feeBps          = BigInt(PLATFORM_FEE_BPS)
    const feeNative       = totalNative * feeBps / 10_000n
    const recipientNative = totalNative - feeNative
    sendTransaction({
      to: MULTICALL3_ADDRESS, value: totalNative, chainId: CHAIN_META.hashkey.chainId,
      data: encodeFunctionData({
        abi: MULTICALL3_AGGREGATE3VALUE_ABI, functionName: 'aggregate3Value',
        args: [[
          { target: activeRecipient as `0x${string}`, allowFailure: false, value: recipientNative,
            callData: (effectiveMemo.trim() ? memoToHex(effectiveMemo.trim()) : '0x') as `0x${string}` },
          { target: EVM_TREASURY, allowFailure: false, value: feeNative, callData: '0x' },
        ]],
      }),
    })
  }

  async function handleStarknetPay() {
    const provider = window.starknet
    if (!provider?.account) { setStarkError('Wallet not connected.'); return }
    setIsStarkPending(true); setStarkError(null)
    try {
      const totalUnits = BigInt(Math.round(parseFloat(effectiveAmt || '0') * 1e6))
      const feeUnits   = totalUnits * BigInt(PLATFORM_FEE_BPS) / 10_000n
      const recipUnits = totalUnits - feeUnits
      const toU256 = (n: bigint) => ({
        low:  '0x' + (n & BigInt('0xffffffffffffffffffffffffffffffff')).toString(16),
        high: '0x0',
      })
      const result = await provider.account.execute([
        { contractAddress: CHAIN_META.starknet.tokenAddress, entrypoint: 'transfer',
          calldata: [resolvedStark, toU256(recipUnits).low, toU256(recipUnits).high] },
        { contractAddress: CHAIN_META.starknet.tokenAddress, entrypoint: 'transfer',
          calldata: [STARK_TREASURY, toU256(feeUnits).low, toU256(feeUnits).high] },
      ])
      setStarkTxHash(result.transaction_hash)
      setIsStarkPending(false); setIsStarkConfirming(true)
      const ctrl = new AbortController()
      starkPollAbort.current = ctrl
      await pollStarknetReceipt(result.transaction_hash, ctrl.signal)
      if (!ctrl.signal.aborted) { setIsStarkConfirming(false); setIsStarkConfirmed(true) }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transaction rejected'
      setStarkError(msg.slice(0, 160))
      setIsStarkPending(false); setIsStarkConfirming(false)
    }
  }

  // ── Unified aliases ───────────────────────────────────────────────────────
  // directStatus === 'success' is included so EVM Send-via-Address relay
  // immediately transitions to the full-screen success card (same as Solana).
  const isConfirmed     = (chain === 'starknet' ? isStarkConfirmed : chain === 'solana' ? isSolanaConfirmed : chain === 'ethereum' ? isGhoConfirmed : isEvmConfirmed) || manualPayDetected || directStatus === 'success'
  const txHash          = directStatus === 'success'   ? (directTxHash as `0x${string}` | null)
                        : manualPayDetected            ? manualTxHash
                        : chain === 'starknet'         ? starkTxHash
                        : chain === 'solana'           ? solanaTxHash
                        : chain === 'ethereum'         ? (ghoRelayHash ?? null)
                        : evmTxHash
  const isWalletPending = chain === 'starknet' ? isStarkPending   : chain === 'solana' ? isSolanaPending   : chain === 'ethereum' ? (ghoRelayPending || isSignPending) : isEvmWalletPending || isSignPending
  const isConfirming    = chain === 'starknet' ? isStarkConfirming : chain === 'solana' ? isSolanaConfirming : chain === 'ethereum' ? isGhoConfirming : isEvmConfirming
  const isSendError     = chain === 'starknet' ? !!starkError : chain === 'solana' ? !!solanaError : chain === 'ethereum' ? !!ghoRelayError : (isEvmSendError || isEvmReverted)
  const sendErrorMsg    = chain === 'starknet' ? starkError
                        : chain === 'solana'   ? solanaError
                        : chain === 'ethereum' ? ghoRelayError
                        : isEvmReverted
                          ? 'Transaction reverted. The permit may have expired or your USDC balance was insufficient.'
                          : (evmSendError?.message ?? 'An unknown error occurred').slice(0, 140)

  // ── Direct Send display address ───────────────────────────────────────────
  const directDisplayAddr = chain === 'starknet' ? starkDirectAddr : directVault

  // ── Event mode: register payment after confirmation ───────────────────────
  async function doRegister(name: string) {
    // In Send-via-Address mode the payer never connects a wallet so address is
    // undefined. Fall back to the vault address as the payer identifier.
    const payer  = chain === 'starknet' ? (starkAccount ?? '')
      : chain === 'solana' ? (solanaWalletAddr ?? solanaVaultAddr ?? '')
      : (address ?? directVault ?? '')
    const txH    = manualPayDetected ? manualTxHash
                 : chain === 'starknet' ? starkTxHash
                 : chain === 'solana'   ? (solanaTxHash ?? solanaDirectTxHash)
                 : (evmTxHash ?? null)
    const txHash = txH ?? `manual_${Date.now()}`
    const actualAmt = receivedAmount != null
      ? (Number(receivedAmount) / Math.pow(10, meta.decimals)).toFixed(meta.decimals <= 6 ? 6 : 8)
      : effectiveAmt
    const payload = { eventId, txHash, chain, payer, memo: name, amount: actualAmt }
    console.log('[EventReg] posting:', payload)
    setEventRegStatus('pending')
    try {
      const res  = await fetch('/api/event-register', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })
      const data = await res.json() as { ok: boolean; error?: string }
      console.log('[EventReg] response:', data)
      setEventRegStatus(data.ok ? 'ok' : 'error')
    } catch (err) {
      console.error('[EventReg] fetch failed:', err)
      setEventRegStatus('error')
    }
  }

  useEffect(() => {
    if (!isConfirmed || !isEventMode || !eventId || eventRegistered.current) return
    const name = attendeeName.trim()
    console.log('[EventReg] triggered — name:', name, 'eventId:', eventId)
    if (!name) return
    eventRegistered.current = true
    void doRegister(name)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirmed, attendeeName])

  // Fallback: also register when Send-via-Address relay succeeds (directStatus='success')
  // in case the Transfer event watcher hasn't set manualPayDetected yet.
  useEffect(() => {
    if (directStatus !== 'success' || !isEventMode || !eventId || eventRegistered.current) return
    const name = attendeeName.trim()
    if (!name) return
    eventRegistered.current = true
    void doRegister(name)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directStatus, attendeeName])

  // Fallback: register when Solana direct-send sweep succeeds.
  useEffect(() => {
    if (solanaDirectStatus !== 'success' || !isEventMode || !eventId || eventRegistered.current) return
    const name = attendeeName.trim()
    if (!name) return
    eventRegistered.current = true
    void doRegister(name)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solanaDirectStatus, attendeeName])

  // ── openConnectModal unused lint suppression ──────────────────────────────
  void openConnectModal

  // ────────────────────────────────────────────────────────────────────────────
  //  INVALID PARAMS
  // ────────────────────────────────────────────────────────────────────────────
  if (!isValidParams) {
    return (
      <div className="mx-auto max-w-md animate-fade-in">
        <div className="overflow-hidden rounded-2xl border border-red-100 bg-white shadow-card">
          <div className="bg-red-50 p-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
              <AlertCircle className="h-7 w-7 text-red-500" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Invalid Payment Link</h2>
            <p className="mt-1 text-sm text-gray-500">This link is missing required parameters or contains invalid data.</p>
          </div>
          <div className="p-6 text-center">
            <p className="mb-4 text-xs text-gray-400">
              A valid link looks like:{' '}
              <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-600">
                /pay?evm=0x…&amp;amt=10&amp;memo=Coffee
              </code>
            </p>
            <Link to="/" className="inline-flex items-center gap-2 rounded-xl bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 transition-all">
              <ArrowLeft className="h-4 w-4" />
              Create a valid link
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // ────────────────────────────────────────────────────────────────────────────
  //  SUCCESS STATE
  // ────────────────────────────────────────────────────────────────────────────
  if (isConfirmed) {
    const explorerTxUrl    = txHash      ? `${meta.explorerUrl}/tx/${txHash}`      : null
    const sweepExplorerUrl = sweepTxHash ? `${meta.explorerUrl}/tx/${sweepTxHash}` : null
    void explorerTxUrl
    void sweepExplorerUrl

    const recipientAmt = receivedAmount != null
      ? Number(receivedAmount) / Math.pow(10, meta.decimals)
      : null
    const requested = parseFloat(effectiveAmt)
    const isOver    = recipientAmt != null && !isFlex && recipientAmt > requested * 1.001
    const isUnder   = recipientAmt != null && !isFlex && recipientAmt < requested * 0.99
    const isPartial = isUnder && (recipientAmt ?? 0) >= requested * 0.50
    const shortfall = isUnder
      ? (requested - (recipientAmt ?? 0)).toFixed(meta.decimals <= 6 ? 4 : 6)
      : null

    // isRouterAddress already implies chain !== 'starknet'; only exclude hashkey separately
    const showSweepStatus = isRouterAddress && chain !== 'hashkey'
    const sweepLabel =
      sweepState === 'calling'               ? 'Distributing funds…' :
      sweepState === 'done'                  ? 'Funds distributed to recipient ✓' :
      sweepState === 'pending_profitability' ? 'Payment Secured — Optimizing network route for delivery…' :
      sweepState === 'failed'                ? 'Auto-distribution failed' : null

    const requestedUsdc = parseFloat(effectiveAmt) || 0
    const isBatch = sweepBalanceUsdc != null && sweepBalanceUsdc > requestedUsdc * 1.01

    const primaryExplorerUrl = chain === 'hashkey'
      ? (txHash ? `${meta.explorerUrl}/tx/${txHash}` : null)
      : (sweepTxHash ? `${meta.explorerUrl}/tx/${sweepTxHash}` : txHash ? `${meta.explorerUrl}/tx/${txHash}` : null)

    return (
      <div className="mx-auto max-w-md animate-scale-in">
        <div
          className={cn(
            'overflow-hidden rounded-2xl border bg-white shadow-card',
            isUnder && !isPartial ? 'border-red-200'
            : isPartial           ? 'border-amber-200'
            : 'border-emerald-100',
          )}
          style={{ boxShadow: isUnder ? '0 4px 32px -4px rgba(239,68,68,0.15)' : `0 4px 32px -4px rgba(16,185,129,0.18), ${meta.glowStyle}` }}
        >
          <div className={cn(
            'bg-gradient-to-br p-8 text-center',
            isUnder && !isPartial ? 'from-red-50 to-orange-50'
            : isPartial           ? 'from-amber-50 to-yellow-50'
            : 'from-emerald-50 to-green-50',
          )}>
            <div className={cn(
              'mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-sm animate-bounce-in',
            )}>
              {isUnder && !isPartial
                ? <AlertCircle  className="h-8 w-8 text-red-500" />
                : isPartial
                ? <AlertTriangle className="h-8 w-8 text-amber-500" />
                : <CheckCircle2  className="h-8 w-8 text-emerald-500" />
              }
            </div>
            <h2 className="text-xl font-bold text-gray-900">
              {isUnder && !isPartial ? 'Underpayment Detected'
               : isPartial           ? 'Partial Payment'
               : 'Payment Sent!'}
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              {recipientAmt != null ? (
                <>
                  <span className={cn('font-semibold', isUnder ? 'text-amber-700' : 'text-gray-900')}>
                    {recipientAmt.toFixed(meta.decimals <= 6 ? 4 : 6)} {meta.asset}
                  </span>
                  {' '}
                  {isUnder ? 'received — ' : 'received via payment router'}
                  {isUnder && (
                    <span className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                      isPartial ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700',
                    )}>
                      {shortfall} {meta.asset} short of requested {requested.toFixed(meta.decimals <= 6 ? 2 : 4)}
                    </span>
                  )}
                  {isOver && (
                    <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                      Overpayment processed
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span className="font-semibold text-gray-900">
                    {formatAmount(effectiveAmt, meta.decimals)} {meta.asset}
                  </span>{' '}
                  {manualPayDetected && directStatus !== 'success' ? 'received at router' : 'delivered successfully'}
                </>
              )}
            </p>
          </div>

          <div className="p-6 space-y-4">
            {showSweepStatus && sweepLabel && (
              <div className={cn(
                'flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5',
                sweepState === 'calling'               ? 'border-blue-100 bg-blue-50'
                : sweepState === 'done'                ? 'border-emerald-100 bg-emerald-50'
                : sweepState === 'pending_profitability' ? 'border-amber-200 bg-amber-50'
                : 'border-red-100 bg-red-50',
              )}>
                {sweepState === 'calling'               && <Loader2     className="h-3.5 w-3.5 shrink-0 animate-spin text-blue-500" />}
                {sweepState === 'done'                  && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />}
                {sweepState === 'pending_profitability' && <Loader2     className="h-3.5 w-3.5 shrink-0 animate-spin text-amber-500" />}
                {sweepState === 'failed'                && <AlertCircle  className="h-3.5 w-3.5 shrink-0 text-red-400" />}
                <p className={cn(
                  'flex-1 text-[11px] font-medium',
                  sweepState === 'calling'               ? 'text-blue-700'
                  : sweepState === 'done'                ? 'text-emerald-700'
                  : sweepState === 'pending_profitability' ? 'text-amber-700'
                  : 'text-red-600',
                )}>
                  {sweepLabel}
                </p>
                {sweepTxHash && (
                  <a href={`${meta.explorerUrl}/tx/${sweepTxHash}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3 w-3 text-emerald-400 hover:text-emerald-600" />
                  </a>
                )}
              </div>
            )}
            {showSweepStatus && isBatch && sweepState === 'done' && (
              <div className="rounded-xl border border-blue-100 bg-blue-50 px-3.5 py-2.5">
                <p className="text-[11px] text-blue-700 font-medium">
                  Settled: {sweepBalanceUsdc!.toFixed(4)} USDC
                  {' '}<span className="font-normal text-blue-500">(includes previous pending balances)</span>
                </p>
              </div>
            )}

            {showSweepStatus && sweepState === 'failed' && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 space-y-2">
                <p className="text-[11px] text-amber-700 font-medium">
                  The automatic distributor couldn't complete the sweep. You can claim manually:
                </p>
                <button
                  onClick={handleManualClaim}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-600 active:scale-[0.98] transition-all"
                >
                  <Zap className="h-3.5 w-3.5" />
                  Retry Distribution (Gasless)
                </button>
                {isConnected && (
                  <p className="text-center text-[10px] text-amber-600">
                    or connect wallet — Manual Claim uses your gas
                  </p>
                )}
                {!isConnected && (
                  <div className="flex justify-center pt-1">
                    <ConnectButton label="Connect to Claim Manually" />
                  </div>
                )}
              </div>
            )}

            <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 bg-gray-50/60 overflow-hidden">
              <Row label="Amount"    value={`${formatAmount(effectiveAmt, meta.decimals)} ${meta.asset}`} mono={false} />
              <Row label="Recipient" value={truncateAddress(activeRecipient, 8)} mono />
              <Row label="Network"   value={meta.label} mono={false} />
              {memo && <Row label="Memo" value={`"${memo}"`} mono={false} />}
              {txHash && (
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-gray-500">Tx Hash</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-gray-700">{truncateAddress(txHash, 8)}</span>
                    <button onClick={handleCopyHash} className="text-gray-400 hover:text-gray-600 transition-colors">
                      {hashCopied ? <CheckCheck className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {primaryExplorerUrl && (
              <a href={primaryExplorerUrl} target="_blank" rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all active:scale-[0.98]"
              >
                <ExternalLink className="h-4 w-4" />
                View on {meta.explorerName}
              </a>
            )}

            {isEventMode && (
              <div className={cn(
                'flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs font-medium',
                eventRegStatus === 'ok'      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : eventRegStatus === 'error' ? 'border-red-200 bg-red-50 text-red-600'
                : 'border-blue-100 bg-blue-50 text-blue-600',
              )}>
                <span>
                  {eventRegStatus === 'pending'  && 'Logging to dashboard…'}
                  {eventRegStatus === 'ok'        && '✓ Logged to organizer dashboard'}
                  {eventRegStatus === 'error'     && 'Failed to log — tap Retry'}
                  {eventRegStatus === 'idle'      && 'Registering payment…'}
                </span>
                {eventRegStatus === 'error' && (
                  <button
                    onClick={() => { eventRegistered.current = false; void doRegister(attendeeName.trim()) }}
                    className="shrink-0 rounded-lg bg-red-100 px-2.5 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-200 transition-colors"
                  >
                    Retry
                  </button>
                )}
              </div>
            )}

            <Link to="/" className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 transition-all active:scale-[0.98]">
              Create your own Hash PayLink
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // ────────────────────────────────────────────────────────────────────────────
  //  MAIN PAYMENT UI
  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-md animate-slide-up">
      <Link to="/" className="mb-5 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" />
        Create a link
      </Link>

      <div
        className="overflow-hidden rounded-2xl border bg-white transition-all duration-300"
        style={{ boxShadow: `0 4px 24px -4px rgba(0,0,0,0.08), ${meta.glowStyle}`, borderColor: meta.accentColor + '26' }}
      >
        {/* ── Chain toggle ─────────────────────────────────────────────── */}
        <div className="flex justify-center pt-5 pb-0 px-4">
          <div className="flex items-center justify-center gap-0.5 sm:gap-1 rounded-xl border border-gray-200 bg-gray-100/80 p-1 overflow-x-auto w-full sm:w-auto">
            {CHAINS.map((c) => {
              const m          = CHAIN_META[c]
              const isActive   = chain === c
              const hskLocked  = isHskOnly && c !== 'hashkey'
              const unavailable = isMultiChain
                ? (c === 'starknet' && !resolvedStark) ||
                  (c === 'solana'   && !resolvedSolana) ||
                  (c !== 'starknet' && c !== 'solana' && !resolvedEvm)
                : hskLocked ||
                  (c === 'starknet' && !resolvedStark) ||
                  (c === 'solana'   && !resolvedSolana) ||
                  (c !== 'starknet' && c !== 'solana' && !resolvedEvm)
              const tooltipText = hskLocked
                ? 'HSK-only payment link'
                : isMultiChain
                ? 'No address set for this chain'
                : 'Recipient address not provided for this chain'
              return (
                <div key={c} className="relative group">
                  <button
                    onClick={() => !unavailable && !netLocked && handleChainSwitch(c)}
                    disabled={(unavailable && !isActive) || (netLocked && !isActive)}
                    className={cn(
                      'flex shrink-0 items-center gap-1 sm:gap-1.5 rounded-lg px-1.5 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs font-semibold transition-all duration-150',
                      isActive                  ? m.toggleActive
                      : unavailable || netLocked ? 'cursor-not-allowed text-gray-300'
                      : 'cursor-pointer text-gray-500 hover:text-gray-800',
                    )}
                  >
                    <span className={cn('h-1.5 w-1.5 rounded-full transition-colors',
                      isActive ? 'bg-white/80' : unavailable ? 'bg-gray-200' : m.dotColor,
                    )} />
                    {m.label}
                  </button>
                  {unavailable && !isActive && (
                    <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 hidden -translate-x-1/2 group-hover:flex flex-col items-center z-20">
                      <div className="whitespace-nowrap rounded-lg bg-gray-900/90 px-2.5 py-1.5 text-[10px] text-white shadow-lg">
                        {tooltipText}
                      </div>
                      <div className="border-4 border-transparent border-t-gray-900/90" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Pay mode toggle (Base, Arc USDC, Starknet) ───────────────── */}
        {canDirectSend && (
          <div className="flex justify-center px-4 pt-3">
            <div className={cn(
              'flex rounded-xl border border-gray-200 bg-gray-100/80 p-0.5 text-xs font-semibold transition-opacity duration-200',
              isEventMode && !attendeeName.trim() && 'opacity-40 pointer-events-none select-none',
            )}>
              <button
                onClick={() => setPayMode('direct')}
                className={cn(
                  'rounded-lg px-4 py-1.5 transition-all duration-150',
                  payMode === 'direct'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700',
                )}
              >
                Send via Address
              </button>
              <button
                onClick={() => setPayMode('wallet')}
                className={cn(
                  'rounded-lg px-4 py-1.5 transition-all duration-150',
                  payMode === 'wallet'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700',
                )}
              >
                Connect Wallet
              </button>
            </div>
          </div>
        )}

        {/* ── Amount header ─────────────────────────────────────────────── */}
        <div className={cn('border-b border-gray-100 bg-gradient-to-br p-6 text-center mt-4', meta.headerBg)}>
          {isFlex ? (
            <div className="flex flex-col items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Enter Amount</p>

              {/* Input centered exactly under label; asset label floats right via absolute */}
              <div className="relative flex justify-center">
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0.00"
                  value={fxInputMode === 'local' ? localAmt : flexAmt}
                  onChange={e => fxInputMode === 'local' ? setLocalAmt(e.target.value) : setFlexAmt(e.target.value)}
                  className="w-40 text-center text-[2.75rem] font-bold leading-none tracking-tight text-gray-900 bg-transparent border-b-2 border-gray-300 focus:border-gray-500 outline-none"
                />
                <span className="absolute left-full top-1/2 -translate-y-1/2 pl-2 text-xl font-semibold text-gray-400 whitespace-nowrap">
                  {fxInputMode === 'local' ? (getFxMeta(fxCurrency)?.symbol ?? fxCurrency) : meta.asset}
                </span>
              </div>

              {/* Swap button — only when FX rate is ready */}
              {fxShow && fxRate ? (
                <button
                  type="button"
                  onClick={() => {
                    if (fxInputMode === 'usdc') {
                      if (flexAmt && parseFloat(flexAmt) > 0) {
                        const m = getFxMeta(fxCurrency)
                        setLocalAmt(formatLocalAmt(parseFloat(flexAmt), fxRate, m?.decimals ?? 2))
                      }
                      setFxInputMode('local')
                    } else {
                      if (localAmt && parseFloat(localAmt) > 0)
                        setFlexAmt((parseFloat(localAmt) / fxRate).toFixed(4).replace(/\.?0+$/, ''))
                      setFxInputMode('usdc')
                    }
                  }}
                  className="flex items-center gap-1.5 rounded-full border border-gray-200 dark:border-white/20 bg-white/60 dark:bg-white/10 px-3 py-1 text-[11px] font-medium text-gray-500 dark:text-gray-300 hover:bg-white dark:hover:bg-white/20 hover:text-gray-700 dark:hover:text-white transition-all"
                >
                  <ArrowLeftRight className="h-3 w-3" />
                  {fxInputMode === 'local' ? `Switch to ${meta.asset}` : `Switch to ${fxCurrency}`}
                </button>
              ) : null}
            </div>
          ) : chain === 'arc' ? (
            <div className="mb-2 flex flex-wrap items-center justify-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#008080] text-white text-xs font-bold shadow-sm">⬡</span>
              <span className="text-xs font-bold tracking-wide text-teal-700">Arc Economic OS</span>
              <span className="rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-700">Sub-second finality</span>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-600">Testnet</span>
            </div>
          ) : (
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-gray-400">Payment Request</p>
          )}
          {!isFlex && (
            <>
              <div className="flex items-baseline justify-center gap-2">
                <span className="text-[2.75rem] font-bold leading-none tracking-tight text-gray-900">{formatAmount(effectiveAmt, meta.decimals)}</span>
                <span className="text-xl font-semibold text-gray-400">{meta.asset}</span>
              </div>
              {memo && (
                <p className="mt-2.5 text-sm text-gray-500">
                  <span className="rounded-full border border-gray-200 bg-white px-3 py-0.5 text-xs font-medium">"{memo}"</span>
                </p>
              )}
            </>
          )}

          {/* ── FX indicator — event mode only ─────────────────────────── */}
          {fxShow && fxCurrency && (() => {
            const fxMeta = getFxMeta(fxCurrency)
            const rate   = fxRate ?? null

            // Local-currency mode: show the USDC the payer will actually pay
            if (fxInputMode === 'local') {
              const usdcOut = rate && parseFloat(localAmt) > 0
                ? (parseFloat(localAmt) / rate).toFixed(4).replace(/\.?0+$/, '')
                : null
              return (
                <div className="mt-2 flex items-center justify-center gap-1">
                  {usdcOut ? (
                    <span className="text-[11px] text-gray-400">You will pay ≈ {usdcOut} USDC</span>
                  ) : rate ? (
                    <span className="text-[11px] text-gray-400">
                      1 {fxCurrency} = {(1 / rate).toFixed(6).replace(/\.?0+$/, '')} USDC
                    </span>
                  ) : null}
                </div>
              )
            }

            // USDC mode: show local-currency equivalent
            const usdcAmt = parseFloat(effectiveAmt) || 0
            return (
              <div className="mt-3 flex items-center justify-center gap-1.5">
                {fxLoading ? (
                  <RefreshCw className="h-2.5 w-2.5 animate-spin text-gray-300" />
                ) : rate && usdcAmt > 0 ? (
                  <>
                    <span className="text-[11px] text-gray-400 leading-none">
                      ≈ {formatLocalAmt(usdcAmt, rate, fxMeta?.decimals ?? 2)} {fxCurrency}
                      {' · '}1 USDC = {rate.toFixed(2)} {fxCurrency}
                    </span>
                    {fxSrc === 'live' && (
                      <button onClick={refreshFxRate} title="Refresh rate" className="text-gray-300 hover:text-gray-500 transition-colors focus:outline-none">
                        <RefreshCw className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </>
                ) : rate ? (
                  <span className="text-[11px] text-gray-400">
                    1 USDC = {rate.toFixed(2)} {fxCurrency}
                    {fxSrc === 'live' && (
                      <button onClick={refreshFxRate} className="ml-1 text-gray-300 hover:text-gray-500 transition-colors">
                        <RefreshCw className="inline h-2.5 w-2.5" />
                      </button>
                    )}
                  </span>
                ) : fxSrc === 'live' ? (
                  <span className="text-[11px] text-gray-400 flex items-center gap-1">
                    Rate unavailable
                    <button onClick={refreshFxRate} title="Retry" className="text-gray-300 hover:text-gray-500 transition-colors">
                      <RefreshCw className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ) : null}
              </div>
            )
          })()}
        </div>

        {/* ── Live rates banner ─────────────────────────────────────────── */}
        {fxShow && fxCurrency && (
          <div className="px-6 pt-4">
            <p className="text-center text-[10px] text-gray-400 leading-relaxed">
              Pricing in {meta.asset} · Shown in {getFxMeta(fxCurrency)?.name ?? fxCurrency} at live market rates
              {fxStale && ' · ⚠ Rate may be outdated'}
            </p>
          </div>
        )}

        <div className="p-6 space-y-5">
          {/* Transaction details */}
          <div className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-100">
            <Row
              label="Network"
              value={
                <span className="flex items-center gap-1.5 text-sm font-medium text-gray-800">
                  <span className={cn('h-2 w-2 rounded-full', meta.dotColor)} />
                  {chain === 'base'     ? 'Base Mainnet'      :
                   chain === 'starknet' ? 'Starknet Mainnet'  :
                   chain === 'arc'      ? 'Arc Economic OS'   :
                   chain === 'solana'   ? 'Solana Mainnet'    :
                   chain === 'ethereum' ? 'Ethereum Mainnet'  :
                                         'HashKey Chain'}
                </span>
              }
            />
            {chain !== 'starknet' && chain !== 'solana' && <Row label="Chain ID" value={String(targetChainId)} mono />}
            <Row label="Engine" value={<span className={cn('text-xs font-medium', meta.badgeText)}>{meta.engineLabel}</span>} />
            <div className="flex items-center justify-between bg-gray-50/60 px-4 py-2 border-t border-dashed border-gray-100">
              <span className="text-[11px] font-normal text-slate-400 tracking-wide">Platform fee (0.2%)</span>
              <span className="font-mono text-[11px] text-slate-400">
                {feeAmount > 0 && effectiveAmt ? `${feeAmount.toFixed(meta.decimals <= 6 ? 4 : 6)} ${meta.asset}` : '—'}
              </span>
            </div>
            {chain === 'ethereum' && (
              <div className="flex items-center justify-between bg-gray-50/60 px-4 py-2 border-t border-dashed border-gray-100">
                <span className="text-[11px] font-normal text-slate-400 tracking-wide">Gas reimb (relayer pays ETH)</span>
                <span className="font-mono text-[11px] text-slate-400">
                  {ghoGasEstimate > 0n
                    ? `~${(Number(ghoGasEstimate) / 1e18).toFixed(4)} GHO`
                    : '…'}
                </span>
              </div>
            )}
            {chain === 'ethereum' && parseFloat(effectiveAmt || '0') < 5 && parseFloat(effectiveAmt || '0') > 0 && (
              <div className="flex items-center gap-2 border-t border-amber-100 bg-amber-50/60 px-4 py-2.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                <span className="text-[11px] text-amber-700">
                  Minimum $5 GHO recommended on Ethereum to keep gas overhead reasonable.
                </span>
              </div>
            )}
            {memo && <Row label="Memo (on-chain)" value={memo.length > 28 ? memo.slice(0, 28) + '…' : memo} />}
          </div>

          {/* ── Attendee name (event mode) ───────────────────────────────── */}
          {isEventMode && (() => {
            const paid = isConfirmed
            return (
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <span className={cn(
                    'h-2 w-2 rounded-full transition-colors duration-300',
                    paid ? 'bg-emerald-500' : attendeeName.trim() ? 'bg-emerald-400' : 'bg-gray-300',
                  )} />
                  Your Name or Handle
                  {paid ? (
                    <span className="ml-auto text-[10px] font-semibold text-emerald-600">✓ Saved</span>
                  ) : attendeeName.trim() ? (
                    <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Ready
                    </span>
                  ) : (
                    <span className="ml-auto flex items-center gap-1 text-[10px] font-medium text-gray-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-gray-300" />
                      Required
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  placeholder="e.g. @Clinton or Jane Doe"
                  value={attendeeName}
                  onChange={e => setAttendeeName(e.target.value)}
                  disabled={paid}
                  maxLength={60}
                  className={`w-full rounded-xl border px-4 py-3 text-sm placeholder:text-gray-400 transition-all ${
                    paid
                      ? 'border-emerald-200 bg-emerald-50/60 text-emerald-800 cursor-not-allowed'
                      : 'border-gray-200 bg-gray-50/60 focus:border-blue-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100'
                  }`}
                />
                {!paid && (
                  <p className="text-[11px] text-gray-400 transition-opacity duration-300" style={{ opacity: attendeeName.trim() ? 0.5 : 1 }}>
                    {attendeeName.trim()
                      ? 'Logged with your payment on the organizer dashboard.'
                      : 'Enter your name to unlock payment — it\'s logged with your payment.'}
                  </p>
                )}
              </div>
            )
          })()}

          {/* ── Direct Send panel (Base / Arc / HashKey) ─────────────────── */}
          {payMode === 'direct' && (chain === 'base' || chain === 'arc' || chain === 'hashkey') && (
            <div className="space-y-3">
              {/* Loading ghost address */}
              {!directDisplayAddr && directStatus !== 'error' ? (
                <div className="animate-pulse h-14 rounded-xl bg-gray-100" />
              ) : directStatus === 'relaying' ? (
                <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3.5">
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-500" />
                  <p className="text-sm font-medium text-blue-700">Relaying payment — broadcasting transaction…</p>
                </div>
              ) : directStatus === 'error' ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                    <div>
                      <p className="text-sm font-semibold text-red-800">Relay Failed</p>
                      <p className="mt-0.5 text-xs text-red-600">{directError}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      directRelayedRef.current = false
                      setDirectStatus('waiting')
                      setDirectError(null)
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 transition-all active:scale-[0.98]"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                /* Waiting for payment */
                <div className="space-y-3">
                  <div className="flex items-center gap-2.5 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2.5">
                    <div className="relative flex h-2.5 w-2.5 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    </div>
                    <p className="text-[11px] font-medium text-emerald-700">Monitoring for {meta.asset} — detects in under 3 seconds</p>
                  </div>
                  <p className="text-center text-xs text-gray-500">
                    Send {meta.asset} on {meta.label} to this address
                  </p>
                  <div className={cn(
                    'flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 transition-opacity duration-200',
                    isEventMode && !attendeeName.trim() && 'opacity-40',
                  )}>
                    <p className="min-w-0 flex-1 break-all font-mono text-xs text-gray-800">{directDisplayAddr}</p>
                    <button
                      onClick={() => {
                        if (isEventMode && !attendeeName.trim()) return
                        navigator.clipboard.writeText(directDisplayAddr!)
                        setDirectAddrCopied(true)
                        setTimeout(() => setDirectAddrCopied(false), 2500)
                      }}
                      className={cn(
                        'ml-2 shrink-0 flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-all',
                        isEventMode && !attendeeName.trim()
                          ? 'cursor-not-allowed'
                          : 'hover:bg-gray-100 active:scale-90',
                      )}
                    >
                      {directAddrCopied
                        ? <><CheckCheck className="h-3.5 w-3.5 text-emerald-500" /> Copied!</>
                        : <><Copy className="h-3.5 w-3.5" /> Copy</>}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Direct Send panel (Solana) ───────────────────────────── */}
          {payMode === 'direct' && chain === 'solana' && (
            <div className="space-y-3">
              {!solanaVaultAddr && solanaDirectStatus !== 'error' ? (
                <div className="animate-pulse h-14 rounded-xl bg-gray-100" />
              ) : solanaDirectStatus === 'success' ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                    <p className="text-sm font-semibold text-emerald-800">Payment Successful</p>
                  </div>
                  {solanaDirectTxHash && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                        <p className="min-w-0 flex-1 truncate font-mono text-xs text-gray-600">{solanaDirectTxHash}</p>
                        <button onClick={() => { navigator.clipboard.writeText(solanaDirectTxHash!); setSolanaDirHashCopied(true); setTimeout(() => setSolanaDirHashCopied(false), 2000) }}>
                          {solanaDirHashCopied ? <CheckCheck className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 text-gray-400" />}
                        </button>
                      </div>
                      <a href={`${meta.explorerUrl}/tx/${solanaDirectTxHash}`} target="_blank" rel="noopener noreferrer"
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all active:scale-[0.98]">
                        <ExternalLink className="h-4 w-4" />
                        View on {meta.explorerName}
                      </a>
                    </div>
                  )}
                </div>
              ) : solanaDirectStatus === 'relaying' ? (
                <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3.5">
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-500" />
                  <p className="text-sm font-medium text-blue-700">Sweeping payment to recipient…</p>
                </div>
              ) : solanaDirectStatus === 'error' ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                    <div>
                      <p className="text-sm font-semibold text-red-800">Sweep Failed</p>
                      <p className="mt-0.5 text-xs text-red-600">{solanaDirectError}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setSolanaDirectStatus('waiting'); setSolanaDirectError(null) }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 transition-all active:scale-[0.98]"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2.5 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2.5">
                    <div className="relative flex h-2.5 w-2.5 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    </div>
                    <p className="text-[11px] font-medium text-emerald-700">Monitoring for {meta.asset} — detects in under 3 seconds</p>
                  </div>
                  <p className="text-center text-xs text-gray-500">Send USDC on Solana to this address</p>
                  <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5">
                    <p className="min-w-0 flex-1 break-all font-mono text-xs text-gray-800">{solanaVaultAddr}</p>
                    <button
                      onClick={() => { navigator.clipboard.writeText(solanaVaultAddr!); setSolanaAddrCopied(true); setTimeout(() => setSolanaAddrCopied(false), 2500) }}
                      className="ml-2 shrink-0 flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-all active:scale-90"
                    >
                      {solanaAddrCopied
                        ? <><CheckCheck className="h-3.5 w-3.5 text-emerald-500" /> Copied!</>
                        : <><Copy className="h-3.5 w-3.5" /> Copy</>}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tx finalizing indicator — wallet mode only, after tx submitted */}
          {payMode === 'wallet' && evmTxHash && !isEvmConfirmed && chain !== 'starknet' && (
            <div className="flex items-center gap-2.5 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2.5">
              <div className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </div>
              <p className="text-[11px] font-medium text-emerald-700">Transaction Found! Finalizing…</p>
              <Radio className="ml-auto h-3 w-3 text-emerald-400" />
            </div>
          )}

          {/* Missing Starknet address */}
          {missingStark && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
              <div>
                <p className="text-sm font-semibold text-amber-800">Receiver has not set a Starknet address</p>
                <p className="mt-0.5 text-xs text-amber-700">
                  Pay via{' '}
                  <button onClick={() => handleChainSwitch('base')} className="font-semibold underline underline-offset-2">Base</button>
                  {' '}or{' '}
                  <button onClick={() => handleChainSwitch('hashkey')} className="font-semibold underline underline-offset-2">HashKey</button>.
                </p>
              </div>
            </div>
          )}

          {/* Missing Solana address */}
          {missingSolana && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
              <div>
                <p className="text-sm font-semibold text-amber-800">Receiver has not set a Solana address</p>
                <p className="mt-0.5 text-xs text-amber-700">
                  Pay via{' '}
                  <button onClick={() => handleChainSwitch('base')} className="font-semibold underline underline-offset-2">Base</button>
                  {' '}or another supported chain.
                </p>
              </div>
            </div>
          )}

          {/* Wrong network */}
          {isEvmChain && isConnected && !isCorrectNetwork && !missingStark && payMode === 'wallet' && (() => {
            const currentName = CHAIN_DISPLAY_NAMES[chainId] ?? `Chain ${chainId}`
            return (
              <div className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white dark:border-white/10 dark:bg-white/[0.03]">
                {/* Accent line */}
                <div className="h-[2px] w-full" style={{ background: `linear-gradient(90deg, transparent 0%, ${meta.accentColor}80 30%, ${meta.accentColor} 50%, ${meta.accentColor}80 70%, transparent 100%)` }} />

                <div className="px-4 pb-4 pt-3.5">
                  {/* Chain transition row */}
                  <div className="mb-3 flex items-center gap-2">
                    {/* Current (wrong) chain */}
                    <div className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-100/80 px-2.5 py-1 dark:border-white/10 dark:bg-white/[0.06]">
                      <span className="h-1.5 w-1.5 rounded-full bg-gray-400 dark:bg-gray-500" />
                      <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">{currentName}</span>
                    </div>

                    {/* Arrow */}
                    <div className="flex items-center gap-0.5 text-gray-300 dark:text-white/20">
                      <div className="h-px w-3 bg-current" />
                      <ArrowRight className="h-3 w-3" />
                    </div>

                    {/* Target (correct) chain */}
                    <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1"
                      style={{ backgroundColor: `${meta.accentColor}18`, border: `1px solid ${meta.accentColor}35` }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.accentColor }} />
                      <span className="text-[11px] font-semibold" style={{ color: meta.accentColor }}>{meta.label}</span>
                    </div>
                  </div>

                  <p className="mb-3 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                    Your wallet is connected to <span className="font-medium text-gray-700 dark:text-gray-300">{currentName}</span>. This payment requires{' '}
                    <span className="font-medium text-gray-700 dark:text-gray-300">{meta.label}</span>.
                  </p>

                  <button
                    onClick={() => switchChain({ chainId: targetChainId })}
                    disabled={isSwitching}
                    className="flex items-center gap-1.5 text-xs font-semibold transition-opacity hover:opacity-70 disabled:opacity-50"
                    style={{ color: meta.accentColor }}>
                    {isSwitching
                      ? <><Loader2 className="h-3 w-3 animate-spin" /> Switching…</>
                      : <><RefreshCw className="h-3 w-3" /> Switch to {meta.label}</>}
                  </button>
                </div>
              </div>
            )
          })()}

          {/* Send error */}
          {payMode === 'wallet' && isSendError && (
            <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-800">Transaction Failed</p>
                <p className="mt-0.5 text-xs text-red-600">
                  {friendlyErrorMsg(sendErrorMsg ?? 'An unknown error occurred')}
                </p>
                <button onClick={() => { resetEvmSend(); setStarkError(null) }}
                  className="mt-2 text-xs font-bold text-red-700 hover:text-red-900">Try again</button>
              </div>
            </div>
          )}

          {/* ── Primary CTA (wallet mode only) ────────────────────────── */}
          {payMode === 'wallet' && missingStark ? (
            <button disabled className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-gray-100 px-6 py-4 text-sm font-semibold text-gray-400">
              <AlertTriangle className="h-4 w-4" />
              No Starknet Address Available
            </button>
          ) : payMode === 'wallet' && missingSolana ? (
            <button disabled className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-gray-100 px-6 py-4 text-sm font-semibold text-gray-400">
              <AlertTriangle className="h-4 w-4" />
              No Solana Address Available
            </button>
          ) : payMode === 'wallet' && chain === 'solana' ? (
            !solanaWalletAddr ? (
              <div className="space-y-2">
                <button
                  onClick={connectSolana}
                  disabled={isSolanaConnecting}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#14F195] px-6 py-4 text-sm font-semibold text-gray-900 transition-all hover:bg-[#00E589] active:scale-[0.98] disabled:opacity-60"
                >
                  {isSolanaConnecting
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Connecting…</>
                    : <><Wallet className="h-4 w-4" /> Connect Solana Wallet</>}
                </button>
                <p className="text-center text-xs text-gray-400">Phantom, Solflare & other Solana wallets</p>
              </div>
            ) : (
              <button
                onClick={handlePay}
                disabled={isSolanaPending || isSolanaConfirming || (isEventMode && !attendeeName.trim()) || flexPayDisabled}
                className={cn(
                  'flex w-full items-center justify-center gap-2 rounded-xl px-6 py-4 text-sm font-semibold transition-all',
                  isSolanaPending || isSolanaConfirming
                    ? 'cursor-not-allowed bg-gray-100 text-gray-500'
                    : 'bg-[#14F195] text-gray-900 hover:bg-[#00E589] shadow-button active:scale-[0.98]',
                )}
              >
                {isSolanaPending     ? <><Loader2 className="h-4 w-4 animate-spin" /> Confirm in Wallet…</>
                : isSolanaConfirming ? <><Loader2 className="h-4 w-4 animate-spin" /> Confirming on Chain…</>
                : <><Zap className="h-4 w-4" /> Pay {formatAmount(effectiveAmt, 6)} USDC on Solana</>}
              </button>
            )
          ) : payMode === 'wallet' && chain === 'starknet' ? (
            !starkAccount ? (
              <div className="space-y-2">
                <button onClick={connectStarknet} disabled={isStarkConnecting || !window.starknet}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#6236FF] px-6 py-4 text-sm font-semibold text-white transition-all hover:bg-[#5025EE] active:scale-[0.98] disabled:opacity-60">
                  {isStarkConnecting ? <><Loader2 className="h-4 w-4 animate-spin" /> Connecting…</> : <><Wallet className="h-4 w-4" /> Connect Starknet Wallet</>}
                </button>
                <p className="text-center text-xs text-gray-400">ArgentX, Braavos & other Starknet wallets</p>
              </div>
            ) : (
              <button onClick={handlePay} disabled={isStarkPending || isStarkConfirming || (isEventMode && !attendeeName.trim()) || flexPayDisabled}
                className={cn(
                  'flex w-full items-center justify-center gap-2 rounded-xl px-6 py-4 text-sm font-semibold transition-all',
                  isStarkPending || isStarkConfirming ? 'cursor-not-allowed bg-gray-100 text-gray-500'
                    : 'bg-[#6236FF] text-white hover:bg-[#5025EE] shadow-button active:scale-[0.98]',
                )}>
                {isStarkPending     ? <><Loader2 className="h-4 w-4 animate-spin" /> Confirm in Wallet…</>
                : isStarkConfirming ? <><Loader2 className="h-4 w-4 animate-spin" /> Confirming on Chain…</>
                : <><Zap className="h-4 w-4" /> Pay {formatAmount(effectiveAmt, 6)} USDC on Starknet</>}
              </button>
            )
          ) : payMode === 'wallet' && !isConnected ? (
            <div className="flex justify-center">
              <ConnectButton label="Connect Wallet to Pay" />
            </div>
          ) : payMode === 'wallet' && !isCorrectNetwork ? (
            <button onClick={() => switchChain({ chainId: targetChainId })} disabled={isSwitching}
              className="flex w-full items-center justify-center gap-2 rounded-xl px-6 py-4 text-sm font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-70"
              style={{ backgroundColor: meta.accentColor }}>
              {isSwitching
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Switching…</>
                : <><RefreshCw className="h-4 w-4" /> Switch to {meta.label}</>}
            </button>
          ) : payMode === 'wallet' ? (
            <button onClick={handlePay} disabled={isWalletPending || isConfirming || (isEventMode && !attendeeName.trim()) || flexPayDisabled}
              className={cn(
                'flex w-full items-center justify-center gap-2 rounded-xl px-6 py-4 text-sm font-semibold transition-all',
                isWalletPending || isConfirming ? 'cursor-not-allowed bg-gray-100 text-gray-500'
                  : 'bg-black text-white shadow-button hover:bg-gray-800 hover:shadow-md active:scale-[0.98]',
              )}>
              {isSignPending        ? <><Loader2 className="h-4 w-4 animate-spin" /> Sign Permit in Wallet…</>
              : ghoRelayPending     ? <><Loader2 className="h-4 w-4 animate-spin" /> Relaying via HashPayLink…</>
              : isEvmWalletPending  ? <><Loader2 className="h-4 w-4 animate-spin" /> Confirm in Wallet…</>
              : isConfirming        ? <><Loader2 className="h-4 w-4 animate-spin" /> Confirming on Chain…</>
              : isSweeping          ? <><Loader2 className="h-4 w-4 animate-spin" /> Routing payment…</>
              : <><Zap className="h-4 w-4" /> Pay {formatAmount(effectiveAmt, meta.decimals)} {meta.asset} on {meta.label}</>}
            </button>
          ) : null /* direct mode — no CTA button, address panel above handles it */ }

          <p className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
            <ShieldCheck className="h-3.5 w-3.5" />
            Trustless · Non-custodial · Open source
          </p>
        </div>
      </div>

      {/* Pending tx banner */}
      {txHash && !isConfirmed && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 animate-slide-up">
          <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-blue-500" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-blue-800">Transaction Submitted</p>
            <p className="truncate font-mono text-xs text-blue-600">{txHash}</p>
          </div>
          <a href={`${meta.explorerUrl}/tx/${txHash}`} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4 text-blue-400 hover:text-blue-700 transition-colors" />
          </a>
        </div>
      )}

      {/* Manual check button */}
      {showCheckButton && !manualPayDetected && chain !== 'starknet' && chain !== 'solana' && payMode === 'wallet' && (
        <div className="mt-4 flex justify-center">
          <button
            onClick={handleManualCheck}
            disabled={isManualChecking}
            className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isManualChecking && 'animate-spin')} />
            {isManualChecking ? 'Checking…' : 'Check Payment Status'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Row helper ───────────────────────────────────────────────────────────────
function Row({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between bg-gray-50/60 px-4 py-3">
      <span className="text-sm text-gray-500">{label}</span>
      {typeof value === 'string' ? (
        <span className={cn('text-sm text-gray-800', mono ? 'font-mono text-xs' : 'font-medium')}>{value}</span>
      ) : value}
    </div>
  )
}
