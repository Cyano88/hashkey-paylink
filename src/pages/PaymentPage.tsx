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
} from 'wagmi'
import { ConnectButton, useConnectModal } from '@rainbow-me/rainbowkit'
import { parseEther, parseUnits, isAddress, encodeFunctionData, parseSignature } from 'viem'
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  AlertCircle,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Zap,
  Copy,
  CheckCheck,
  Wallet,
  AlertTriangle,
} from 'lucide-react'
import { CHAIN_META, PLATFORM_FEE_BPS, EVM_TREASURY, STARK_TREASURY, type ChainKey } from '../lib/chains'
import { useStarknet } from '../lib/StarknetContext'
import {
  cn,
  truncateAddress,
  formatAmount,
  memoToHex,
  copyToClipboard,
} from '../lib/utils'

const CHAINS: ChainKey[] = ['base', 'starknet', 'hashkey', 'arc']

// ─── Starknet RPC for polling tx status ─────────────────────────────────────
const STARKNET_RPC = 'https://starknet-mainnet.public.blastapi.io'

// ─── Multicall3 — deployed at same address on all EVM chains ────────────────
const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11' as `0x${string}`

// ─── Multicall3 aggregate3 (ERC-20 permit + transferFrom) ───────────────────
const MULTICALL3_AGGREGATE3_ABI = [{
  name: 'aggregate3',
  type: 'function' as const,
  stateMutability: 'payable' as const,
  inputs: [{
    name: 'calls', type: 'tuple[]',
    components: [
      { name: 'target',       type: 'address' },
      { name: 'allowFailure', type: 'bool'    },
      { name: 'callData',     type: 'bytes'   },
    ],
  }],
  outputs: [{
    name: 'returnData', type: 'tuple[]',
    components: [
      { name: 'success',    type: 'bool'  },
      { name: 'returnData', type: 'bytes' },
    ],
  }],
}] as const

// ─── Multicall3 aggregate3Value (native token split, e.g. HSK) ──────────────
const MULTICALL3_AGGREGATE3VALUE_ABI = [{
  name: 'aggregate3Value',
  type: 'function' as const,
  stateMutability: 'payable' as const,
  inputs: [{
    name: 'calls', type: 'tuple[]',
    components: [
      { name: 'target',       type: 'address' },
      { name: 'allowFailure', type: 'bool'    },
      { name: 'value',        type: 'uint256' },
      { name: 'callData',     type: 'bytes'   },
    ],
  }],
  outputs: [{
    name: 'returnData', type: 'tuple[]',
    components: [
      { name: 'success',    type: 'bool'  },
      { name: 'returnData', type: 'bytes' },
    ],
  }],
}] as const

// ─── EIP-2612 permit + ERC-20 transferFrom ABIs ─────────────────────────────
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
  inputs: [{ name: 'owner', type: 'address' }],
  outputs: [{ name: '', type: 'uint256' }],
}] as const

async function pollStarknetReceipt(txHash: string, signal: AbortSignal): Promise<void> {
  const deadline = Date.now() + 3 * 60_000
  while (Date.now() < deadline && !signal.aborted) {
    await new Promise((r) => setTimeout(r, 4000))
    if (signal.aborted) break
    try {
      const res = await fetch(STARKNET_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'starknet_getTransactionReceipt',
          params: [txHash],
          id: 1,
        }),
        signal,
      })
      const json = await res.json()
      const status: string = json?.result?.finality_status ?? ''
      if (status === 'ACCEPTED_ON_L2' || status === 'ACCEPTED_ON_L1') return
      if (json?.result?.execution_status === 'REVERTED') {
        throw new Error('Transaction reverted on Starknet')
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') break
    }
  }
  if (!signal.aborted) return // optimistic accept on timeout
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function PaymentPage() {
  const [searchParams] = useSearchParams()

  // ── Parse URL params — support new ?evm=&stark= and legacy ?to=&chain= ──
  const evmParam   = searchParams.get('evm')   ?? searchParams.get('to') ?? ''
  const starkParam = searchParams.get('stark')  ?? ''
  const amt        = searchParams.get('amt')    ?? ''
  const memo       = searchParams.get('memo')   ?? ''

  // Backward-compat: if old ?chain=starknet&to=0x... treat `to` as stark address
  const legacyChain = searchParams.get('chain') as ChainKey | null
  const resolvedStark = starkParam || (legacyChain === 'starknet' ? evmParam : '')
  const resolvedEvm   = legacyChain === 'starknet' ? '' : evmParam

  // ── Active chain (default: first chain that has an address) ─────────────
  const [chain, setChain] = useState<ChainKey>(() => {
    if (legacyChain === 'base' || legacyChain === 'starknet' || legacyChain === 'hashkey')
      return legacyChain
    if (resolvedEvm)   return 'hashkey'
    if (resolvedStark) return 'starknet'
    return 'hashkey'
  })

  const [hashCopied, setHashCopied] = useState(false)
  const [addrCopied, setAddrCopied] = useState(false)

  // ── EVM hooks (Base + HashKey + Arc) ────────────────────────────────────
  const { isConnected, address } = useAccount()
  const chainId = useChainId()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const { openConnectModal } = useConnectModal()

  const {
    sendTransaction,
    data: evmTxHash,
    isPending: isEvmWalletPending,
    isError: isEvmSendError,
    error: evmSendError,
    reset: resetEvmSend,
  } = useSendTransaction()

  const { isLoading: isEvmConfirming, isSuccess: isEvmConfirmed } =
    useWaitForTransactionReceipt({ hash: evmTxHash })

  // ── EIP-2612 permit signing ──────────────────────────────────────────────
  const {
    signTypedDataAsync,
    isPending: isSignPending,
    reset: resetPermitSign,
  } = useSignTypedData()

  // ── Read current USDC nonce for permit (ERC-20 chains only) ─────────────
  const { data: permitNonce } = useReadContract({
    address: chain === 'base' ? CHAIN_META.base.tokenAddress : CHAIN_META.arc.tokenAddress,
    abi: NONCES_ABI,
    functionName: 'nonces',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    chainId: (chain === 'base' ? CHAIN_META.base.chainId : CHAIN_META.arc.chainId) as number,
    query: { enabled: (chain === 'base' || chain === 'arc') && !!address },
  })

  // ── Starknet state (shared via context + local tx state) ─────────────────
  const { address: starkAccount, isConnecting: isStarkConnecting, connect: connectStarknet } = useStarknet()
  const [starkTxHash,       setStarkTxHash]       = useState<string | null>(null)
  const [isStarkPending,    setIsStarkPending]     = useState(false)
  const [isStarkConfirming, setIsStarkConfirming]  = useState(false)
  const [isStarkConfirmed,  setIsStarkConfirmed]   = useState(false)
  const [starkError,        setStarkError]         = useState<string | null>(null)
  const starkPollAbort = useRef<AbortController | null>(null)

  // ── Fee engine ────────────────────────────────────────────────────────────
  const feeMultiplier  = PLATFORM_FEE_BPS / 10_000          // 0.005
  const feeAmount      = (parseFloat(amt) || 0) * feeMultiplier

  // ── Derived ──────────────────────────────────────────────────────────────
  const isEvmChain    = chain !== 'starknet'
  const targetChainId =
    chain === 'base'    ? CHAIN_META.base.chainId :
    chain === 'arc'     ? CHAIN_META.arc.chainId  :
    CHAIN_META.hashkey.chainId
  const isCorrectNetwork = isEvmChain ? chainId === targetChainId : true
  const meta = CHAIN_META[chain]

  // The recipient for the selected chain
  const activeRecipient = chain === 'starknet' ? resolvedStark : resolvedEvm

  // Safety net: Starknet selected but no stark address was provided
  const missingStark = chain === 'starknet' && !resolvedStark

  // Payer page is "valid" if we have at least one address + valid amount
  const isValidParams =
    !isNaN(parseFloat(amt)) &&
    parseFloat(amt) > 0 &&
    (isAddress(resolvedEvm) || !!resolvedStark)

  // ── Reset tx state on chain switch + auto-connection triggers ────────────
  function handleChainSwitch(c: ChainKey) {
    setChain(c)
    resetEvmSend()
    resetPermitSign()
    setStarkTxHash(null)
    setIsStarkPending(false)
    setIsStarkConfirming(false)
    setIsStarkConfirmed(false)
    setStarkError(null)
    starkPollAbort.current?.abort()

    // Auto-trigger connection if user switches to a chain they aren't on
    if (c === 'starknet' && !starkAccount) {
      connectStarknet()
    } else if (c !== 'starknet' && !isConnected) {
      openConnectModal?.()
    }
  }

  // ── Auto-switch EVM network ───────────────────────────────────────────────
  useEffect(() => {
    if (isEvmChain && isConnected && !isCorrectNetwork && !isSwitching) {
      switchChain({ chainId: targetChainId })
    }
  }, [isEvmChain, isConnected, isCorrectNetwork, isSwitching, switchChain, targetChainId])

  // ── Payment handler ──────────────────────────────────────────────────────
  async function handlePay() {
    if (!activeRecipient) return

    if (chain === 'base' || chain === 'arc') {
      await handleEvmPermitPay()
    } else if (chain === 'starknet') {
      handleStarknetPay()
    } else {
      handleHashKeyPay()
    }
  }

  // ── ERC-20: EIP-2612 Permit + Multicall3 — one signature, one transaction ─
  async function handleEvmPermitPay() {
    if (!address) return
    const meta_ = chain === 'arc' ? CHAIN_META.arc : CHAIN_META.base
    const tokenAddress = meta_.tokenAddress
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600) // 1 hour

    const totalUnits    = parseUnits(amt, meta_.decimals)
    const feeBps        = BigInt(PLATFORM_FEE_BPS)
    const feeUnits      = totalUnits * feeBps / 10_000n
    const recipientUnits = totalUnits - feeUnits
    const nonce         = permitNonce ?? 0n

    try {
      // Step 1 — off-chain permit signature (gasless, just a wallet sign prompt)
      const sig = await signTypedDataAsync({
        domain: {
          name: 'USD Coin',
          version: '2',
          chainId: targetChainId,
          verifyingContract: tokenAddress,
        },
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
        message: {
          owner:    address,
          spender:  MULTICALL3_ADDRESS,
          value:    totalUnits,
          nonce,
          deadline,
        },
      })

      // Step 2 — decompose compact signature into v / r / s
      const { v, r, s } = parseSignature(sig)

      // Step 3 — single multicall3 tx: permit → transferFrom(recipient) → transferFrom(treasury)
      sendTransaction({
        to:      MULTICALL3_ADDRESS,
        value:   0n,
        chainId: targetChainId,
        data: encodeFunctionData({
          abi:          MULTICALL3_AGGREGATE3_ABI,
          functionName: 'aggregate3',
          args: [[
            {
              target:       tokenAddress,
              allowFailure: false,
              callData:     encodeFunctionData({
                abi: ERC20_PERMIT_ABI, functionName: 'permit',
                args: [address, MULTICALL3_ADDRESS, totalUnits, deadline, Number(v), r, s],
              }),
            },
            {
              target:       tokenAddress,
              allowFailure: false,
              callData:     encodeFunctionData({
                abi: ERC20_TRANSFER_FROM_ABI, functionName: 'transferFrom',
                args: [address, activeRecipient as `0x${string}`, recipientUnits],
              }),
            },
            {
              target:       tokenAddress,
              allowFailure: false,
              callData:     encodeFunctionData({
                abi: ERC20_TRANSFER_FROM_ABI, functionName: 'transferFrom',
                args: [address, EVM_TREASURY, feeUnits],
              }),
            },
          ]],
        }),
      })
    } catch {
      // User rejected permit signature — button returns to idle state
    }
  }

  // ── HashKey native HSK: aggregate3Value — one tx, no permit needed ────────
  function handleHashKeyPay() {
    const totalNative    = parseEther(amt)
    const feeBps         = BigInt(PLATFORM_FEE_BPS)
    const feeNative      = totalNative * feeBps / 10_000n
    const recipientNative = totalNative - feeNative

    sendTransaction({
      to:      MULTICALL3_ADDRESS,
      value:   totalNative,
      chainId: CHAIN_META.hashkey.chainId,
      data: encodeFunctionData({
        abi:          MULTICALL3_AGGREGATE3VALUE_ABI,
        functionName: 'aggregate3Value',
        args: [[
          {
            target:       activeRecipient as `0x${string}`,
            allowFailure: false,
            value:        recipientNative,
            callData:     (memo.trim() ? memoToHex(memo.trim()) : '0x') as `0x${string}`,
          },
          {
            target:       EVM_TREASURY,
            allowFailure: false,
            value:        feeNative,
            callData:     '0x',
          },
        ]],
      }),
    })
  }

  async function handleStarknetPay() {
    const provider = window.starknet
    if (!provider?.account) { setStarkError('Wallet not connected.'); return }
    setIsStarkPending(true)
    setStarkError(null)
    try {
      const totalUnits = BigInt(Math.round(parseFloat(amt) * 1e6))
      const feeUnits   = totalUnits * BigInt(PLATFORM_FEE_BPS) / 10_000n
      const recipUnits = totalUnits - feeUnits

      // Encode uint256 as [low_128, high_128] for Starknet
      const toU256 = (n: bigint) => ({
        low:  '0x' + (n & BigInt('0xffffffffffffffffffffffffffffffff')).toString(16),
        high: '0x0',
      })
      const recip = toU256(recipUnits)
      const fee   = toU256(feeUnits)

      // Starknet natively supports multicall — batch both transfers in ONE tx
      const result = await provider.account.execute([
        {
          contractAddress: CHAIN_META.starknet.tokenAddress,
          entrypoint: 'transfer',
          calldata: [resolvedStark, recip.low, recip.high],
        },
        {
          contractAddress: CHAIN_META.starknet.tokenAddress,
          entrypoint: 'transfer',
          calldata: [STARK_TREASURY, fee.low, fee.high],
        },
      ])
      setStarkTxHash(result.transaction_hash)
      setIsStarkPending(false)
      setIsStarkConfirming(true)
      const ctrl = new AbortController()
      starkPollAbort.current = ctrl
      await pollStarknetReceipt(result.transaction_hash, ctrl.signal)
      if (!ctrl.signal.aborted) { setIsStarkConfirming(false); setIsStarkConfirmed(true) }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transaction rejected'
      setStarkError(msg.slice(0, 160))
      setIsStarkPending(false)
      setIsStarkConfirming(false)
    }
  }

  async function handleCopyHash() {
    const hash = chain === 'starknet' ? starkTxHash : evmTxHash
    if (!hash) return
    await copyToClipboard(hash)
    setHashCopied(true)
    setTimeout(() => setHashCopied(false), 2000)
  }

  async function handleCopyAddress() {
    if (!activeRecipient) return
    await copyToClipboard(activeRecipient)
    setAddrCopied(true)
    setTimeout(() => setAddrCopied(false), 3000)
  }

  // ── Unified state aliases ────────────────────────────────────────────────
  const isConfirmed     = chain === 'starknet' ? isStarkConfirmed  : isEvmConfirmed
  const txHash          = chain === 'starknet' ? starkTxHash       : evmTxHash
  const isWalletPending = chain === 'starknet' ? isStarkPending    : isEvmWalletPending || isSignPending
  const isConfirming    = chain === 'starknet' ? isStarkConfirming : isEvmConfirming
  const isSendError     = chain !== 'starknet' ? isEvmSendError    : !!starkError
  const sendErrorMsg    =
    chain === 'starknet'
      ? starkError
      : (evmSendError?.message ?? 'An unknown error occurred').slice(0, 140)

  // ────────────────────────────────────────────────────────────────────────────
  //  INVALID PARAMS STATE
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
            <p className="mt-1 text-sm text-gray-500">
              This link is missing required parameters or contains invalid data.
            </p>
          </div>
          <div className="p-6 text-center">
            <p className="mb-4 text-xs text-gray-400">
              A valid link looks like:{' '}
              <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-600">
                /pay?evm=0x…&amp;amt=10&amp;memo=Coffee
              </code>
            </p>
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-xl bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 transition-all"
            >
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
  if (isConfirmed && txHash) {
    const explorerTxUrl = `${meta.explorerUrl}/tx/${txHash}`

    return (
      <div className="mx-auto max-w-md animate-scale-in">
        <div
          className="overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-card"
          style={{ boxShadow: `0 4px 32px -4px rgba(16,185,129,0.18), ${meta.glowStyle}` }}
        >
          {/* Hero */}
          <div className="bg-gradient-to-br from-emerald-50 to-green-50 p-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-sm animate-bounce-in">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Payment Sent!</h2>
            <p className="mt-1 text-sm text-gray-600">
              <span className="font-semibold text-gray-900">
                {formatAmount(amt, meta.decimals)} {meta.asset}
              </span>{' '}
              delivered successfully
            </p>
          </div>

          {/* Details */}
          <div className="p-6 space-y-4">
            <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 bg-gray-50/60 overflow-hidden">
              <Row label="Amount"    value={`${formatAmount(amt, meta.decimals)} ${meta.asset}`} mono={false} />
              <Row label="Recipient" value={truncateAddress(activeRecipient, 8)} mono />
              <Row label="Network"   value={meta.label} mono={false} />
              {memo && <Row label="Memo" value={`"${memo}"`} mono={false} />}
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-gray-500">Tx Hash</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-gray-700">{truncateAddress(txHash, 8)}</span>
                  <button onClick={handleCopyHash} className="text-gray-400 hover:text-gray-600 transition-colors">
                    {hashCopied
                      ? <CheckCheck className="h-3.5 w-3.5 text-emerald-500" />
                      : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            <a
              href={explorerTxUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all active:scale-[0.98]"
            >
              <ExternalLink className="h-4 w-4" />
              View on {meta.explorerName}
            </a>

            <Link
              to="/"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 transition-all active:scale-[0.98]"
            >
              Create your own Hash PayLink
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // ────────────────────────────────────────────────────────────────────────────
  //  MAIN PAYMENT STATE
  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-md animate-slide-up">
      {/* Back */}
      <Link
        to="/"
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Create a link
      </Link>

      {/* ── Payment card ──────────────────────────────────────────────── */}
      <div
        className="overflow-hidden rounded-2xl border bg-white transition-all duration-300"
        style={{
          boxShadow: `0 4px 24px -4px rgba(0,0,0,0.08), ${meta.glowStyle}`,
          borderColor: meta.accentColor + '26',
        }}
      >
        {/* ── Quad-Chain Toggle — flex-wrap so 4 pills fit on mobile ──── */}
        <div className="flex justify-center pt-5 pb-0 px-4">
          <div className="flex flex-wrap items-center justify-center gap-1 rounded-xl border border-gray-200 bg-gray-100/80 p-1 max-w-xs sm:max-w-none">
            {CHAINS.map((c) => {
              const m = CHAIN_META[c]
              const isActive = chain === c
              const unavailable =
                (c === 'starknet' && !resolvedStark) ||
                (c !== 'starknet' && !resolvedEvm)
              return (
                <div key={c} className="relative group">
                  <button
                    onClick={() => !unavailable && handleChainSwitch(c)}
                    disabled={unavailable && !isActive}
                    className={cn(
                      'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150',
                      isActive
                        ? m.toggleActive
                        : unavailable
                        ? 'cursor-not-allowed text-gray-300'
                        : 'cursor-pointer text-gray-500 hover:text-gray-800',
                    )}
                  >
                    <span className={cn('h-1.5 w-1.5 rounded-full transition-colors',
                      isActive ? 'bg-white/80' : unavailable ? 'bg-gray-200' : m.dotColor,
                    )} />
                    {m.label}
                  </button>
                  {/* Tooltip — only on unavailable pills */}
                  {unavailable && !isActive && (
                    <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 hidden -translate-x-1/2 group-hover:flex flex-col items-center z-20">
                      <div className="whitespace-nowrap rounded-lg bg-gray-900/90 px-2.5 py-1.5 text-[10px] text-white shadow-lg">
                        Recipient address not provided for this chain
                      </div>
                      <div className="border-4 border-transparent border-t-gray-900/90" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Amount header — Arc mode gets special branding */}
        <div className={cn('border-b border-gray-100 bg-gradient-to-br p-6 text-center mt-4', meta.headerBg)}>
          {chain === 'arc' ? (
            <div className="mb-2 flex flex-wrap items-center justify-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#7C3AED] text-white text-xs font-bold shadow-sm">
                ⬡
              </span>
              <span className="text-xs font-bold tracking-wide text-violet-700">
                Arc Economic OS
              </span>
              <span className="rounded-full border border-violet-200 bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-600">
                Sub-second finality
              </span>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-600">
                Testnet
              </span>
            </div>
          ) : (
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-gray-400">
              Payment Request
            </p>
          )}
          <div className="flex items-baseline justify-center gap-2">
            <span className="text-[2.75rem] font-bold leading-none tracking-tight text-gray-900">
              {formatAmount(amt, meta.decimals)}
            </span>
            <span className="text-xl font-semibold text-gray-400">{meta.asset}</span>
          </div>
          {memo && (
            <p className="mt-2.5 text-sm text-gray-500">
              <span className="rounded-full border border-gray-200 bg-white px-3 py-0.5 text-xs font-medium">
                "{memo}"
              </span>
            </p>
          )}
        </div>

        <div className="p-6 space-y-5">
          {/* Transaction details */}
          <div className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-100">
            {/* To — copy button visible regardless of wallet connection */}
            <div className="flex items-center justify-between bg-gray-50/60 px-4 py-3">
              <span className="text-sm text-gray-500">To</span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-xs text-gray-800">
                  {activeRecipient ? truncateAddress(activeRecipient, 8) : '—'}
                </span>
                {activeRecipient && (
                  <button
                    onClick={handleCopyAddress}
                    title="Copy address"
                    className="flex items-center justify-center rounded-md p-1 text-gray-400 transition-all hover:bg-gray-200/70 hover:text-gray-700 active:scale-90"
                  >
                    {addrCopied
                      ? <CheckCheck className="h-3.5 w-3.5 text-emerald-500" />
                      : <Copy className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
            </div>
            <Row
              label="Network"
              value={
                <span className="flex items-center gap-1.5 text-sm font-medium text-gray-800">
                  <span className={cn('h-2 w-2 rounded-full', meta.dotColor)} />
                  {chain === 'base' ? 'Base Mainnet'
                    : chain === 'starknet' ? 'Starknet Mainnet'
                    : chain === 'arc' ? 'Arc Economic OS'
                    : 'HashKey Chain'}
                </span>
              }
            />
            {chain !== 'starknet' && (
              <Row label="Chain ID" value={String(targetChainId)} mono />
            )}
            <Row
              label="Engine"
              value={<span className={cn('text-xs font-medium', meta.badgeText)}>{meta.engineLabel}</span>}
            />
            {/* Platform fee — invoice detail style */}
            <div className="flex items-center justify-between bg-gray-50/60 px-4 py-2 border-t border-dashed border-gray-100">
              <span className="text-[11px] font-normal text-slate-400 tracking-wide">
                Platform fee (0.5%)
              </span>
              <span className="font-mono text-[11px] text-slate-400">
                {feeAmount > 0
                  ? `${feeAmount.toFixed(meta.decimals <= 6 ? 4 : 6)} ${meta.asset}`
                  : '—'}
              </span>
            </div>
            {memo && (
              <Row label="Memo (on-chain)" value={memo.length > 28 ? memo.slice(0, 28) + '…' : memo} />
            )}
          </div>

          {/* ── Vault routing note — fades in after address is copied ─── */}
          {addrCopied && (
            <div className="flex items-start gap-2 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 animate-fade-in">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
              <p className="text-[11px] leading-relaxed text-slate-400 italic">
                Funds sent to this address are automatically routed to the recipient via Hash PayLink's secure vault.
              </p>
            </div>
          )}

          {/* ── ⚠️ Missing Starknet address safety net ─────────────────── */}
          {missingStark && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 animate-fade-in">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
              <div>
                <p className="text-sm font-semibold text-amber-800">
                  Receiver has not set a Starknet address
                </p>
                <p className="mt-0.5 text-xs text-amber-700">
                  Please request a Starknet address from the receiver, or pay via{' '}
                  <button
                    onClick={() => handleChainSwitch('base')}
                    className="font-semibold underline underline-offset-2 hover:text-amber-900"
                  >
                    Base
                  </button>
                  {' '}or{' '}
                  <button
                    onClick={() => handleChainSwitch('hashkey')}
                    className="font-semibold underline underline-offset-2 hover:text-amber-900"
                  >
                    HashKey
                  </button>
                  .
                </p>
              </div>
            </div>
          )}

          {/* ── EVM: Wrong network warning ───────────────────────────── */}
          {isEvmChain && isConnected && !isCorrectNetwork && !missingStark && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 animate-fade-in">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
              <div className="flex-1 space-y-2">
                <p className="text-sm font-semibold text-amber-800">Wrong Network</p>
                <p className="text-xs text-amber-700">
                  Switch to {meta.label} (Chain ID {targetChainId}) to continue.
                </p>
                <button
                  onClick={() => switchChain({ chainId: targetChainId })}
                  disabled={isSwitching}
                  className="flex items-center gap-1.5 text-xs font-bold text-amber-800 hover:text-amber-900 transition-colors"
                >
                  {isSwitching
                    ? <><Loader2 className="h-3 w-3 animate-spin" /> Switching…</>
                    : <><RefreshCw className="h-3 w-3" /> Switch now</>}
                </button>
              </div>
            </div>
          )}

          {/* ── Starknet: no wallet installed ────────────────────────── */}
          {chain === 'starknet' && !resolvedStark && !window.starknet && (
            <div className="flex items-start gap-3 rounded-xl border border-purple-200 bg-purple-50 p-4 animate-fade-in">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-purple-500" />
              <div>
                <p className="text-sm font-semibold text-purple-800">No Starknet Wallet</p>
                <p className="text-xs text-purple-700 mt-0.5">
                  Install{' '}
                  <a href="https://www.argent.xyz/argent-x" target="_blank" rel="noopener noreferrer" className="underline">ArgentX</a>
                  {' '}or{' '}
                  <a href="https://www.braavos.app" target="_blank" rel="noopener noreferrer" className="underline">Braavos</a>
                  {' '}to pay with Starknet.
                </p>
              </div>
            </div>
          )}

          {/* Send error */}
          {isSendError && (
            <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 animate-fade-in">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-800">Transaction Failed</p>
                <p className="mt-0.5 break-all text-xs text-red-600">
                  {(sendErrorMsg ?? 'An unknown error occurred').slice(0, 140)}
                  {(sendErrorMsg?.length ?? 0) > 140 ? '…' : ''}
                </p>
                <button
                  onClick={() => { resetEvmSend(); setStarkError(null) }}
                  className="mt-2 text-xs font-bold text-red-700 hover:text-red-900 transition-colors"
                >
                  Try again
                </button>
              </div>
            </div>
          )}

          {/* ── Primary CTA ─────────────────────────────────────────── */}
          {missingStark ? (
            // Can't pay via Starknet if no stark address — CTA is disabled
            <button
              disabled
              className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-gray-100 px-6 py-4 text-sm font-semibold text-gray-400"
            >
              <AlertTriangle className="h-4 w-4" />
              No Starknet Address Available
            </button>
          ) : chain === 'starknet' ? (
            // Starknet flow
            !starkAccount ? (
              <div className="space-y-2">
                <button
                  onClick={connectStarknet}
                  disabled={isStarkConnecting || !window.starknet}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#8B5CF6] px-6 py-4 text-sm font-semibold text-white transition-all hover:bg-[#7C3AED] active:scale-[0.98] disabled:opacity-60"
                >
                  {isStarkConnecting
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Connecting…</>
                    : <><Wallet className="h-4 w-4" /> Connect Starknet Wallet</>}
                </button>
                <p className="text-center text-xs text-gray-400">
                  ArgentX, Braavos & other Starknet wallets
                </p>
              </div>
            ) : (
              <button
                onClick={handlePay}
                disabled={isStarkPending || isStarkConfirming}
                className={cn(
                  'flex w-full items-center justify-center gap-2 rounded-xl px-6 py-4 text-sm font-semibold transition-all',
                  isStarkPending || isStarkConfirming
                    ? 'cursor-not-allowed bg-gray-100 text-gray-500'
                    : 'bg-[#8B5CF6] text-white hover:bg-[#7C3AED] shadow-button active:scale-[0.98]',
                )}
              >
                {isStarkPending   ? <><Loader2 className="h-4 w-4 animate-spin" /> Confirm in Wallet…</>
                : isStarkConfirming ? <><Loader2 className="h-4 w-4 animate-spin" /> Confirming on Chain…</>
                : <><Zap className="h-4 w-4" /> Pay {formatAmount(amt, 6)} USDC on {meta.label}</>}
              </button>
            )
          ) : !isConnected ? (
            // EVM: not connected
            <div className="space-y-2">
              <div className="flex justify-center">
                <ConnectButton label="Connect Wallet to Pay" />
              </div>
              <p className="text-center text-xs text-gray-400">
                MetaMask, Coinbase Wallet, WalletConnect & more
              </p>
            </div>
          ) : !isCorrectNetwork ? (
            // EVM: wrong network
            <button
              onClick={() => switchChain({ chainId: targetChainId })}
              disabled={isSwitching}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-6 py-4 text-sm font-semibold text-white transition-all hover:bg-amber-600 active:scale-[0.98] disabled:opacity-70"
            >
              {isSwitching
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Switching Network…</>
                : <><RefreshCw className="h-4 w-4" /> Switch to {meta.label}</>}
            </button>
          ) : (
            // EVM: ready to pay
            <button
              onClick={handlePay}
              disabled={isWalletPending || isConfirming}
              className={cn(
                'flex w-full items-center justify-center gap-2 rounded-xl px-6 py-4 text-sm font-semibold transition-all',
                isWalletPending || isConfirming
                  ? 'cursor-not-allowed bg-gray-100 text-gray-500'
                  : 'bg-black text-white shadow-button hover:bg-gray-800 hover:shadow-md active:scale-[0.98]',
              )}
            >
              {isSignPending      ? <><Loader2 className="h-4 w-4 animate-spin" /> Sign Permit in Wallet…</>
              : isEvmWalletPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Confirm in Wallet…</>
              : isConfirming       ? <><Loader2 className="h-4 w-4 animate-spin" /> Confirming on Chain…</>
              : <><Zap className="h-4 w-4" /> Pay {formatAmount(amt, meta.decimals)} {meta.asset} on {meta.label}</>}
            </button>
          )}

          {/* Trust badge */}
          <p className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
            <ShieldCheck className="h-3.5 w-3.5" />
            Trustless · Non-custodial · Open source
          </p>
        </div>
      </div>

      {/* ── Pending tx banner ─────────────────────────────────────────── */}
      {txHash && !isConfirmed && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 animate-slide-up">
          <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-blue-500" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-blue-800">Transaction Submitted</p>
            <p className="truncate font-mono text-xs text-blue-600">{txHash}</p>
          </div>
          <a
            href={`${meta.explorerUrl}/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View on explorer"
          >
            <ExternalLink className="h-4 w-4 text-blue-400 hover:text-blue-700 transition-colors" />
          </a>
        </div>
      )}
    </div>
  )
}

// ─── Helper row component ────────────────────────────────────────────────────
function Row({
  label,
  value,
  mono = false,
}: {
  label: string
  value: React.ReactNode
  mono?: boolean
}) {
  return (
    <div className="flex items-center justify-between bg-gray-50/60 px-4 py-3">
      <span className="text-sm text-gray-500">{label}</span>
      {typeof value === 'string' ? (
        <span className={cn('text-sm text-gray-800', mono ? 'font-mono text-xs' : 'font-medium')}>
          {value}
        </span>
      ) : (
        value
      )}
    </div>
  )
}
