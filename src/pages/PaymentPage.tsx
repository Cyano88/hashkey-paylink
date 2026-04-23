import { useEffect, useRef, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import {
  useAccount,
  useChainId,
  useSwitchChain,
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
} from 'viem'
import {
  ArrowLeft, CheckCircle2, ExternalLink, AlertCircle, Loader2,
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
import { RpcProvider as StarkRpcProvider } from 'starknet'
import { useStarknet } from '../lib/StarknetContext'
import { computeStarkGhostAddress } from '../lib/starknet-ghost'
import { cn, truncateAddress, formatAmount, memoToHex, copyToClipboard } from '../lib/utils'

const CHAINS: ChainKey[] = ['base', 'starknet', 'hashkey', 'arc']

// ─── Starknet RPC ─────────────────────────────────────────────────────────────
const STARKNET_RPC = 'https://starknet-mainnet.public.blastapi.io'

/** Singleton provider — reused across every poll tick to avoid re-initialisation overhead. */
const STARK_PROVIDER = new StarkRpcProvider({ nodeUrl: STARKNET_RPC })

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
 * Queries USDC balance at a Starknet address using starknet.js RpcProvider.
 * Tries `balanceOf` (Cairo 0 / StarkGate contracts) then `balance_of` (Cairo 1 SNIP-2).
 * Returns the low-felt of the Uint256 result (sufficient for USDC amounts).
 */
async function starkUsdcBalance(tokenAddress: string, accountAddress: string): Promise<bigint> {
  for (const entrypoint of ['balanceOf', 'balance_of']) {
    try {
      const result = await STARK_PROVIDER.callContract({
        contractAddress: tokenAddress,
        entrypoint,
        calldata: [accountAddress],
      })
      // balanceOf/balance_of returns Uint256 [low, high]; USDC amounts fit in low
      return BigInt(result[0] ?? '0x0')
    } catch {
      // Wrong entrypoint name — try the other variant
    }
  }
  throw new Error(`balanceOf failed for token ${tokenAddress}`)
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function PaymentPage() {
  const [searchParams] = useSearchParams()

  const evmParam    = searchParams.get('evm')    ?? searchParams.get('to') ?? ''
  const starkParam  = searchParams.get('stark')  ?? ''
  const amt         = searchParams.get('amt')    ?? ''
  const memo        = searchParams.get('memo')   ?? ''
  const legacyChain = searchParams.get('chain')  as ChainKey | null

  const resolvedStark = starkParam || (legacyChain === 'starknet' ? evmParam : '')
  const resolvedEvm   = legacyChain === 'starknet' ? '' : evmParam

  const [chain, setChain] = useState<ChainKey>(() => {
    if (legacyChain === 'base' || legacyChain === 'starknet' || legacyChain === 'hashkey' || legacyChain === 'arc') return legacyChain
    if (resolvedStark && !resolvedEvm) return 'starknet'
    return 'base'
  })

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

  // ── Direct Send state (shared across Base, Arc, Starknet) ────────────────
  const [payMode,          setPayMode]          = useState<'wallet' | 'direct'>('wallet')
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
  const { openConnectModal }     = useConnectModal()

  const {
    sendTransaction, data: evmTxHash,
    isPending: isEvmWalletPending, isError: isEvmSendError,
    error: evmSendError, reset: resetEvmSend,
  } = useSendTransaction()

  const { isLoading: isEvmConfirming, isSuccess: isEvmConfirmed, isError: isEvmReverted } =
    useWaitForTransactionReceipt({ hash: evmTxHash })

  const { signTypedDataAsync, isPending: isSignPending, reset: resetPermitSign } = useSignTypedData()

  const { writeContract: callSweep, isPending: isSweeping } = useWriteContract()

  const { data: permitNonce } = useReadContract({
    address: chain === 'base' ? CHAIN_META.base.tokenAddress : CHAIN_META.arc.tokenAddress,
    abi: NONCES_ABI,
    functionName: 'nonces',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    chainId: (chain === 'base' ? CHAIN_META.base.chainId : CHAIN_META.arc.chainId) as number,
    query: { enabled: (chain === 'base' || chain === 'arc') && !!address },
  })

  // ── Starknet ──────────────────────────────────────────────────────────────
  const { address: starkAccount, isConnecting: isStarkConnecting, connect: connectStarknet } = useStarknet()
  const [starkTxHash,       setStarkTxHash]      = useState<string | null>(null)
  const [isStarkPending,    setIsStarkPending]    = useState(false)
  const [isStarkConfirming, setIsStarkConfirming] = useState(false)
  const [isStarkConfirmed,  setIsStarkConfirmed]  = useState(false)
  const [starkError,        setStarkError]        = useState<string | null>(null)
  const starkPollAbort = useRef<AbortController | null>(null)

  // ── Derived ───────────────────────────────────────────────────────────────
  const isEvmChain    = chain !== 'starknet'
  const isHskOnly     = legacyChain === 'hashkey'
  const meta          = CHAIN_META[chain]
  const targetChainId =
    chain === 'base'    ? CHAIN_META.base.chainId    :
    chain === 'arc'     ? CHAIN_META.arc.chainId     :
    CHAIN_META.hashkey.chainId
  const isCorrectNetwork = isEvmChain ? chainId === targetChainId : true
  const feeAmount        = (parseFloat(amt) || 0) * (PLATFORM_FEE_BPS / 10_000)

  const activeRecipient = chain === 'starknet' ? resolvedStark : resolvedEvm
  const displayAddress  = (chain !== 'starknet' && routerAddr) ? routerAddr : activeRecipient
  const isRouterAddress = chain !== 'starknet' && !!routerAddr

  const missingStark = chain === 'starknet' && !resolvedStark

  const isValidParams =
    !isNaN(parseFloat(amt)) && parseFloat(amt) > 0 &&
    (isAddress(resolvedEvm) || !!resolvedStark)

  // Whether Direct Send is available for the current chain
  const canDirectSend =
    ((chain === 'base' || chain === 'arc') && isAddress(resolvedEvm) && !!FACTORY_V2_ADDRESSES[chain as 'base' | 'arc']) ||
    (chain === 'starknet' && !!resolvedStark)

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
    if (manualPayDetected || chain === 'starknet' || !resolvedEvm) return

    const evmChain = chain as 'base' | 'hashkey' | 'arc'
    const client   = EVM_CLIENTS[evmChain]

    let unwatchTransfer: (() => void) | undefined
    let unwatchRouted:   (() => void) | undefined
    let hskTimer:        ReturnType<typeof setInterval> | undefined

    if (chain === 'hashkey') {
      let initialBalance: bigint | null = null
      const requestedWei = parseEther(amt || '0')

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
      const requestedUnits = parseUnits(amt || '0', meta.decimals)

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

  // ── Reset payMode when switching to HashKey (no Direct Send available) ───
  useEffect(() => {
    if (chain === 'hashkey') setPayMode('wallet')
  }, [chain])

  // ── V2 EVM: Generate linkId + compute ghost vault address ─────────────────
  useEffect(() => {
    if (payMode !== 'direct') return
    if (chain === 'starknet' || chain === 'hashkey') return
    const factoryAddr = FACTORY_V2_ADDRESSES[chain as 'base' | 'arc']
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

    // Use chain-specific client and factory address
    const client = EVM_CLIENTS[chain as 'base' | 'arc']
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

  // ── V2 EVM: Poll USDC balance at ghost vault; trigger relay on arrival ────
  useEffect(() => {
    if (directStatus !== 'waiting' || !directVault || !directLinkId) return
    if (chain === 'starknet' || chain === 'hashkey') return

    const evmChain = chain as 'base' | 'arc'
    const client   = EVM_CLIENTS[evmChain]
    const token    = CHAIN_META[evmChain].tokenAddress

    const check = async () => {
      if (directRelayedRef.current) return
      try {
        const balance = await client.readContract({
          address:      token,
          abi:          ERC20_BALANCE_OF_ABI,
          functionName: 'balanceOf',
          args:         [directVault],
        })
        if ((balance as bigint) > 0n && !directRelayedRef.current) {
          directRelayedRef.current = true
          if (directPollRef.current) clearInterval(directPollRef.current)
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

  // ── V2 Starknet: Compute ghost OZ account address ─────────────────────────
  useEffect(() => {
    if (payMode !== 'direct' || chain !== 'starknet' || !resolvedStark) return

    const params  = new URLSearchParams(window.location.search)
    const idParam = params.get('id')
    let linkId: string
    if (idParam && /^0x[0-9a-fA-F]{64}$/.test(idParam)) {
      linkId = idParam
    } else {
      const bytes = crypto.getRandomValues(new Uint8Array(32))
      linkId = '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
      params.set('id', linkId)
      window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`)
    }
    setDirectLinkId(linkId)

    try {
      const { address } = computeStarkGhostAddress(linkId, resolvedStark)
      setStarkDirectAddr(address)
      setDirectStatus('waiting')
      directRelayedRef.current = false
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[starknet-ghost] computeStarkGhostAddress failed:', msg)
      setDirectError(`Ghost address error: ${msg.slice(0, 120)}`)
      setDirectStatus('error')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payMode, chain, resolvedStark])

  // ── V2 Starknet: Poll USDC balance at ghost address; trigger relay ────────
  useEffect(() => {
    if (directStatus !== 'waiting' || !starkDirectAddr || !directLinkId) return
    if (chain !== 'starknet') return

    const tokenAddr = CHAIN_META.starknet.tokenAddress

    const check = async () => {
      if (directRelayedRef.current) return
      try {
        const balance = await starkUsdcBalance(tokenAddr, starkDirectAddr)
        console.log('[starknet-poll] ghost balance:', balance.toString(), 'µUSDC at', starkDirectAddr)
        if (balance > 0n && !directRelayedRef.current) {
          directRelayedRef.current = true
          if (directPollRef.current) clearInterval(directPollRef.current)
          setDirectStatus('relaying')
          fetch('/api/relay-starknet', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ linkId: directLinkId, recipientStark: resolvedStark }),
          })
            .then(r => r.json())
            .then((data: { ok: boolean; txHash?: string; error?: string }) => {
              if (data.ok && data.txHash) {
                setDirectTxHash(data.txHash)
                setDirectStatus('success')
                // Surface as detected payment so full success screen renders
                setManualTxHash(data.txHash as `0x${string}`)
                setManualPayDetected(true)
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
      } catch (err) {
        console.error('[starknet-poll] balance check error:', err)
      }
    }

    directPollRef.current = setInterval(check, 3000)
    check()
    return () => { if (directPollRef.current) clearInterval(directPollRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directStatus, starkDirectAddr, directLinkId, chain])

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
    if (manualPayDetected || chain === 'starknet' || !resolvedEvm) return
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
        const requestedWei = parseEther(amt || '0')
        if (bal >= requestedWei * 99n / 100n) {
          setReceivedAmount(bal); setManualTxHash(null); setManualPayDetected(true)
        }
      } else {
        const tokenAddress   = chain === 'base' ? CHAIN_META.base.tokenAddress : CHAIN_META.arc.tokenAddress
        const target         = (routerAddr ?? resolvedEvm) as `0x${string}`
        const requestedUnits = parseUnits(amt || '0', meta.decimals)
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
    setChain(c)
    resetEvmSend()
    resetPermitSign()
    setStarkTxHash(null); setIsStarkPending(false); setIsStarkConfirming(false)
    setIsStarkConfirmed(false); setStarkError(null)
    starkPollAbort.current?.abort()
    setManualPayDetected(false); setManualTxHash(null); setReceivedAmount(null)
    setRouterAddr(null); setRouterDeployed(null); setShowCheckButton(false)
    setSweepState('idle'); setSweepTxHash(null); setSweepBalanceUsdc(null)
    // Reset direct send state
    setDirectLinkId(null); setDirectVault(null); setStarkDirectAddr(null)
    setDirectStatus('idle'); setDirectTxHash(null); setDirectError(null)
    directRelayedRef.current = false
    if (directPollRef.current) { clearInterval(directPollRef.current); directPollRef.current = null }
    if (isConnected && c !== 'starknet') {
      const cid =
        c === 'base'    ? CHAIN_META.base.chainId    :
        c === 'arc'     ? CHAIN_META.arc.chainId     :
        CHAIN_META.hashkey.chainId
      switchChain({ chainId: cid })
    }
  }

  // ── Copy handlers ─────────────────────────────────────────────────────────
  async function handleCopyHash() {
    const hash = chain === 'starknet' ? starkTxHash : evmTxHash
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

  // ── Payment handlers ──────────────────────────────────────────────────────
  async function handlePay() {
    if (!activeRecipient) return
    if (chain === 'base' || chain === 'arc') await handleEvmPermitPay()
    else if (chain === 'starknet') handleStarknetPay()
    else handleHashKeyPay()
  }

  async function handleEvmPermitPay() {
    if (!address) return
    const meta_       = chain === 'arc' ? CHAIN_META.arc : CHAIN_META.base
    const tokenAddress = meta_.tokenAddress
    const deadline     = BigInt(Math.floor(Date.now() / 1000) + 3600)
    const totalUnits   = parseUnits(amt, meta_.decimals)
    const feeBps       = BigInt(PLATFORM_FEE_BPS)
    const feeUnits     = totalUnits * feeBps / 10_000n
    const recipientUnits = totalUnits - feeUnits
    const nonce        = permitNonce ?? 0n
    try {
      const sig = await signTypedDataAsync({
        domain: { name: 'USD Coin', version: '2', chainId: targetChainId, verifyingContract: tokenAddress },
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
      sendTransaction({
        to: MULTICALL3_ADDRESS, value: 0n, chainId: targetChainId,
        data: encodeFunctionData({
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
        }),
      })
    } catch { /* user rejected */ }
  }

  function handleHashKeyPay() {
    const totalNative     = parseEther(amt)
    const feeBps          = BigInt(PLATFORM_FEE_BPS)
    const feeNative       = totalNative * feeBps / 10_000n
    const recipientNative = totalNative - feeNative
    sendTransaction({
      to: MULTICALL3_ADDRESS, value: totalNative, chainId: CHAIN_META.hashkey.chainId,
      data: encodeFunctionData({
        abi: MULTICALL3_AGGREGATE3VALUE_ABI, functionName: 'aggregate3Value',
        args: [[
          { target: activeRecipient as `0x${string}`, allowFailure: false, value: recipientNative,
            callData: (memo.trim() ? memoToHex(memo.trim()) : '0x') as `0x${string}` },
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
      const totalUnits = BigInt(Math.round(parseFloat(amt) * 1e6))
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
  const isConfirmed     = (chain === 'starknet' ? isStarkConfirmed  : isEvmConfirmed) || manualPayDetected
  const txHash          = manualPayDetected ? manualTxHash
                        : chain === 'starknet' ? starkTxHash : evmTxHash
  const isWalletPending = chain === 'starknet' ? isStarkPending    : isEvmWalletPending || isSignPending
  const isConfirming    = chain === 'starknet' ? isStarkConfirming : isEvmConfirming
  const isSendError     = chain !== 'starknet' ? (isEvmSendError || isEvmReverted) : !!starkError
  const sendErrorMsg    = chain === 'starknet' ? starkError
                        : isEvmReverted
                          ? 'Transaction reverted. The permit may have expired or your USDC balance was insufficient.'
                          : (evmSendError?.message ?? 'An unknown error occurred').slice(0, 140)

  // ── Direct Send display address ───────────────────────────────────────────
  const directDisplayAddr = chain === 'starknet' ? starkDirectAddr : directVault

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

    const recipientAmt   = receivedAmount != null
      ? Number(receivedAmount) / Math.pow(10, meta.decimals)
      : null
    const requested = parseFloat(amt)
    const isOver    = recipientAmt != null && recipientAmt > requested * 1.001

    // isRouterAddress already implies chain !== 'starknet'; only exclude hashkey separately
    const showSweepStatus = isRouterAddress && chain !== 'hashkey'
    const sweepLabel =
      sweepState === 'calling'               ? 'Distributing funds…' :
      sweepState === 'done'                  ? 'Funds distributed to recipient ✓' :
      sweepState === 'pending_profitability' ? 'Payment Secured — Optimizing network route for delivery…' :
      sweepState === 'failed'                ? 'Auto-distribution failed' : null

    const requestedUsdc = parseFloat(amt) || 0
    const isBatch = sweepBalanceUsdc != null && sweepBalanceUsdc > requestedUsdc * 1.01

    const primaryExplorerUrl = chain === 'hashkey'
      ? (txHash ? `${meta.explorerUrl}/tx/${txHash}` : null)
      : (sweepTxHash ? `${meta.explorerUrl}/tx/${sweepTxHash}` : txHash ? `${meta.explorerUrl}/tx/${txHash}` : null)

    return (
      <div className="mx-auto max-w-md animate-scale-in">
        <div
          className="overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-card"
          style={{ boxShadow: `0 4px 32px -4px rgba(16,185,129,0.18), ${meta.glowStyle}` }}
        >
          <div className="bg-gradient-to-br from-emerald-50 to-green-50 p-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-sm animate-bounce-in">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">
              {manualPayDetected ? 'Payment Detected!' : 'Payment Sent!'}
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              {recipientAmt != null ? (
                <>
                  <span className="font-semibold text-gray-900">
                    {recipientAmt.toFixed(meta.decimals <= 6 ? 4 : 6)} {meta.asset}
                  </span>
                  {' '}received via payment router
                  {isOver && (
                    <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                      Overpayment processed
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span className="font-semibold text-gray-900">
                    {formatAmount(amt, meta.decimals)} {meta.asset}
                  </span>{' '}
                  {manualPayDetected ? 'received at router' : 'delivered successfully'}
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
              <Row label="Amount"    value={`${formatAmount(amt, meta.decimals)} ${meta.asset}`} mono={false} />
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
          <div className="flex flex-wrap items-center justify-center gap-1 rounded-xl border border-gray-200 bg-gray-100/80 p-1 max-w-xs sm:max-w-none">
            {CHAINS.map((c) => {
              const m          = CHAIN_META[c]
              const isActive   = chain === c
              const hskLocked  = isHskOnly && c !== 'hashkey'
              const unavailable =
                hskLocked ||
                (c === 'starknet' && !resolvedStark) ||
                (c !== 'starknet' && !resolvedEvm)
              const tooltipText = hskLocked
                ? 'HSK-only payment link'
                : 'Recipient address not provided for this chain'
              return (
                <div key={c} className="relative group">
                  <button
                    onClick={() => !unavailable && handleChainSwitch(c)}
                    disabled={unavailable && !isActive}
                    className={cn(
                      'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150',
                      isActive     ? m.toggleActive
                      : unavailable ? 'cursor-not-allowed text-gray-300'
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
            <div className="flex rounded-xl border border-gray-200 bg-gray-100/80 p-0.5 text-xs font-semibold">
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
            </div>
          </div>
        )}

        {/* ── Amount header ─────────────────────────────────────────────── */}
        <div className={cn('border-b border-gray-100 bg-gradient-to-br p-6 text-center mt-4', meta.headerBg)}>
          {chain === 'arc' ? (
            <div className="mb-2 flex flex-wrap items-center justify-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#7C3AED] text-white text-xs font-bold shadow-sm">⬡</span>
              <span className="text-xs font-bold tracking-wide text-violet-700">Arc Economic OS</span>
              <span className="rounded-full border border-violet-200 bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-600">Sub-second finality</span>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-600">Testnet</span>
            </div>
          ) : (
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-gray-400">Payment Request</p>
          )}
          <div className="flex items-baseline justify-center gap-2">
            <span className="text-[2.75rem] font-bold leading-none tracking-tight text-gray-900">{formatAmount(amt, meta.decimals)}</span>
            <span className="text-xl font-semibold text-gray-400">{meta.asset}</span>
          </div>
          {memo && (
            <p className="mt-2.5 text-sm text-gray-500">
              <span className="rounded-full border border-gray-200 bg-white px-3 py-0.5 text-xs font-medium">"{memo}"</span>
            </p>
          )}
        </div>

        <div className="p-6 space-y-5">
          {/* Transaction details */}
          <div className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-100">
            <Row
              label="Network"
              value={
                <span className="flex items-center gap-1.5 text-sm font-medium text-gray-800">
                  <span className={cn('h-2 w-2 rounded-full', meta.dotColor)} />
                  {chain === 'base' ? 'Base Mainnet' : chain === 'starknet' ? 'Starknet Mainnet'
                    : chain === 'arc' ? 'Arc Economic OS' : 'HashKey Chain'}
                </span>
              }
            />
            {chain !== 'starknet' && <Row label="Chain ID" value={String(targetChainId)} mono />}
            <Row label="Engine" value={<span className={cn('text-xs font-medium', meta.badgeText)}>{meta.engineLabel}</span>} />
            <div className="flex items-center justify-between bg-gray-50/60 px-4 py-2 border-t border-dashed border-gray-100">
              <span className="text-[11px] font-normal text-slate-400 tracking-wide">Platform fee (0.5%)</span>
              <span className="font-mono text-[11px] text-slate-400">
                {feeAmount > 0 ? `${feeAmount.toFixed(meta.decimals <= 6 ? 4 : 6)} ${meta.asset}` : '—'}
              </span>
            </div>
            {memo && <Row label="Memo (on-chain)" value={memo.length > 28 ? memo.slice(0, 28) + '…' : memo} />}
          </div>

          {/* ── Direct Send panel (Base / Arc / Starknet) ────────────────── */}
          {payMode === 'direct' && (chain === 'base' || chain === 'arc' || chain === 'starknet') && (
            <div className="space-y-3">
              {/* Loading ghost address */}
              {!directDisplayAddr && directStatus !== 'error' ? (
                <div className="animate-pulse h-14 rounded-xl bg-gray-100" />
              ) : directStatus === 'success' ? (
                /* EVM Direct Send success is surfaced via manualPayDetected → full screen */
                /* For Starknet this branch is unreachable since we set manualPayDetected */
                <div className="space-y-3">
                  <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                    <p className="text-sm font-semibold text-emerald-800">Payment Successful</p>
                  </div>
                  {directTxHash && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                        <p className="min-w-0 flex-1 truncate font-mono text-xs text-gray-600">{directTxHash}</p>
                        <button onClick={() => { navigator.clipboard.writeText(directTxHash!); setDirectHashCopied(true); setTimeout(() => setDirectHashCopied(false), 2000) }}>
                          {directHashCopied ? <CheckCheck className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 text-gray-400" />}
                        </button>
                      </div>
                      <a href={`${meta.explorerUrl}/tx/${directTxHash}`} target="_blank" rel="noopener noreferrer"
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all active:scale-[0.98]">
                        <ExternalLink className="h-4 w-4" />
                        View on {meta.explorerName}
                      </a>
                    </div>
                  )}
                </div>
              ) : directStatus === 'relaying' ? (
                <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3.5">
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-500" />
                  <p className="text-sm font-medium text-blue-700">
                    {chain === 'starknet'
                      ? 'Deploying ghost vault & routing USDC on Starknet…'
                      : 'Relaying payment — broadcasting transaction…'}
                  </p>
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
                    <p className="text-[11px] font-medium text-emerald-700">
                      {chain === 'starknet'
                        ? 'Monitoring for USDC on Starknet — detects in under 3 seconds'
                        : 'Monitoring for USDC — detects in under 3 seconds'}
                    </p>
                  </div>
                  <p className="text-center text-xs text-gray-500">
                    Send exact amount of {meta.asset} on{' '}
                    {chain === 'base' ? 'Base' : chain === 'arc' ? 'Arc' : 'Starknet'}{' '}
                    network to this address
                  </p>
                  <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5">
                    <p className="min-w-0 flex-1 break-all font-mono text-xs text-gray-800">{directDisplayAddr}</p>
                    <button
                      onClick={() => { navigator.clipboard.writeText(directDisplayAddr!); setDirectAddrCopied(true); setTimeout(() => setDirectAddrCopied(false), 2500) }}
                      className="ml-2 shrink-0 flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-all active:scale-90"
                    >
                      {directAddrCopied
                        ? <><CheckCheck className="h-3.5 w-3.5 text-emerald-500" /> Copied!</>
                        : <><Copy className="h-3.5 w-3.5" /> Copy</>}
                    </button>
                  </div>
                  {chain === 'starknet' && (
                    <p className="text-center text-[10px] text-purple-500 font-medium">
                      Ghost OZ Account · USDC auto-routes on arrival · no wallet needed
                    </p>
                  )}
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

          {/* Wrong network */}
          {isEvmChain && isConnected && !isCorrectNetwork && !missingStark && payMode === 'wallet' && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
              <div className="flex-1 space-y-2">
                <p className="text-sm font-semibold text-amber-800">Wrong Network</p>
                <p className="text-xs text-amber-700">Switch to {meta.label} (Chain ID {targetChainId}) to continue.</p>
                <button onClick={() => switchChain({ chainId: targetChainId })} disabled={isSwitching}
                  className="flex items-center gap-1.5 text-xs font-bold text-amber-800 hover:text-amber-900">
                  {isSwitching ? <><Loader2 className="h-3 w-3 animate-spin" /> Switching…</> : <><RefreshCw className="h-3 w-3" /> Switch now</>}
                </button>
              </div>
            </div>
          )}

          {/* Send error */}
          {payMode === 'wallet' && isSendError && (
            <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-800">Transaction Failed</p>
                <p className="mt-0.5 break-all text-xs text-red-600">
                  {(sendErrorMsg ?? 'An unknown error occurred').slice(0, 140)}
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
          ) : payMode === 'wallet' && chain === 'starknet' ? (
            !starkAccount ? (
              <div className="space-y-2">
                <button onClick={connectStarknet} disabled={isStarkConnecting || !window.starknet}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#8B5CF6] px-6 py-4 text-sm font-semibold text-white transition-all hover:bg-[#7C3AED] active:scale-[0.98] disabled:opacity-60">
                  {isStarkConnecting ? <><Loader2 className="h-4 w-4 animate-spin" /> Connecting…</> : <><Wallet className="h-4 w-4" /> Connect Starknet Wallet</>}
                </button>
                <p className="text-center text-xs text-gray-400">ArgentX, Braavos & other Starknet wallets</p>
              </div>
            ) : (
              <button onClick={handlePay} disabled={isStarkPending || isStarkConfirming}
                className={cn(
                  'flex w-full items-center justify-center gap-2 rounded-xl px-6 py-4 text-sm font-semibold transition-all',
                  isStarkPending || isStarkConfirming ? 'cursor-not-allowed bg-gray-100 text-gray-500'
                    : 'bg-[#8B5CF6] text-white hover:bg-[#7C3AED] shadow-button active:scale-[0.98]',
                )}>
                {isStarkPending     ? <><Loader2 className="h-4 w-4 animate-spin" /> Confirm in Wallet…</>
                : isStarkConfirming ? <><Loader2 className="h-4 w-4 animate-spin" /> Confirming on Chain…</>
                : <><Zap className="h-4 w-4" /> Pay {formatAmount(amt, 6)} USDC on Starknet</>}
              </button>
            )
          ) : payMode === 'wallet' && !isConnected ? (
            <div className="flex justify-center">
              <ConnectButton label="Connect Wallet to Pay" />
            </div>
          ) : payMode === 'wallet' && !isCorrectNetwork ? (
            <button onClick={() => switchChain({ chainId: targetChainId })} disabled={isSwitching}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-6 py-4 text-sm font-semibold text-white transition-all hover:bg-amber-600 active:scale-[0.98] disabled:opacity-70">
              {isSwitching ? <><Loader2 className="h-4 w-4 animate-spin" /> Switching…</> : <><RefreshCw className="h-4 w-4" /> Switch to {meta.label}</>}
            </button>
          ) : payMode === 'wallet' ? (
            <button onClick={handlePay} disabled={isWalletPending || isConfirming}
              className={cn(
                'flex w-full items-center justify-center gap-2 rounded-xl px-6 py-4 text-sm font-semibold transition-all',
                isWalletPending || isConfirming ? 'cursor-not-allowed bg-gray-100 text-gray-500'
                  : 'bg-black text-white shadow-button hover:bg-gray-800 hover:shadow-md active:scale-[0.98]',
              )}>
              {isSignPending        ? <><Loader2 className="h-4 w-4 animate-spin" /> Sign Permit in Wallet…</>
              : isEvmWalletPending  ? <><Loader2 className="h-4 w-4 animate-spin" /> Confirm in Wallet…</>
              : isConfirming        ? <><Loader2 className="h-4 w-4 animate-spin" /> Confirming on Chain…</>
              : isSweeping          ? <><Loader2 className="h-4 w-4 animate-spin" /> Routing payment…</>
              : <><Zap className="h-4 w-4" /> Pay {formatAmount(amt, meta.decimals)} {meta.asset} on {meta.label}</>}
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
      {showCheckButton && !manualPayDetected && chain !== 'starknet' && payMode === 'wallet' && (
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
