import { useEffect, useRef, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import {
  useAccount,
  useChainId,
  useSwitchChain,
  useSendTransaction,
  useWaitForTransactionReceipt,
} from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { parseEther, isAddress } from 'viem'
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
} from 'lucide-react'
import { CHAIN_META, type ChainKey } from '../lib/chains'
import {
  cn,
  truncateAddress,
  formatAmount,
  memoToHex,
  encodeErc20Transfer,
  copyToClipboard,
  isValidRecipient,
} from '../lib/utils'

const CHAINS: ChainKey[] = ['base', 'starknet', 'hashkey']

// ─── Starknet RPC for polling tx status ─────────────────────────────────────
const STARKNET_RPC = 'https://starknet-mainnet.public.blastapi.io'

async function pollStarknetReceipt(txHash: string, signal: AbortSignal): Promise<void> {
  const deadline = Date.now() + 3 * 60_000 // 3-minute max
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
      // Keep polling on transient errors
    }
  }
  if (!signal.aborted) return // treat timeout as accepted (optimistic)
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function PaymentPage() {
  const [searchParams] = useSearchParams()
  const to = searchParams.get('to') ?? ''
  const amt = searchParams.get('amt') ?? ''
  const memo = searchParams.get('memo') ?? ''
  const chainParam = searchParams.get('chain') as ChainKey | null

  // Active chain (pre-selected from URL, user can override)
  const [chain, setChain] = useState<ChainKey>(() => {
    if (chainParam === 'base' || chainParam === 'starknet' || chainParam === 'hashkey')
      return chainParam
    return 'hashkey'
  })

  const [hashCopied, setHashCopied] = useState(false)

  // ── EVM hooks (Base + HashKey) ───────────────────────────────────────────
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain, isPending: isSwitching } = useSwitchChain()

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

  // ── Starknet state ────────────────────────────────────────────────────────
  const [starkAccount, setStarkAccount] = useState<string | null>(null)
  const [starkTxHash, setStarkTxHash] = useState<string | null>(null)
  const [isStarkConnecting, setIsStarkConnecting] = useState(false)
  const [isStarkPending, setIsStarkPending] = useState(false)
  const [isStarkConfirming, setIsStarkConfirming] = useState(false)
  const [isStarkConfirmed, setIsStarkConfirmed] = useState(false)
  const [starkError, setStarkError] = useState<string | null>(null)
  const starkPollAbort = useRef<AbortController | null>(null)

  // ── Derived state ────────────────────────────────────────────────────────
  const isEvmChain = chain !== 'starknet'
  const targetChainId = chain === 'base' ? CHAIN_META.base.chainId : CHAIN_META.hashkey.chainId
  const isCorrectNetwork = isEvmChain ? chainId === targetChainId : true

  const isValidParams =
    isValidRecipient(to, chain) &&
    !isNaN(parseFloat(amt)) &&
    parseFloat(amt) > 0

  const meta = CHAIN_META[chain]

  // ── Reset tx state when chain changes ────────────────────────────────────
  function handleChainSwitch(c: ChainKey) {
    setChain(c)
    resetEvmSend()
    setStarkTxHash(null)
    setIsStarkPending(false)
    setIsStarkConfirming(false)
    setIsStarkConfirmed(false)
    setStarkError(null)
    starkPollAbort.current?.abort()
  }

  // ── Auto-switch EVM network when connected ───────────────────────────────
  useEffect(() => {
    if (isEvmChain && isConnected && !isCorrectNetwork && !isSwitching) {
      switchChain({ chainId: targetChainId })
    }
  }, [isEvmChain, isConnected, isCorrectNetwork, isSwitching, switchChain, targetChainId])

  // ── Starknet connect ─────────────────────────────────────────────────────
  async function connectStarknet() {
    const provider = window.starknet
    if (!provider) {
      setStarkError('No Starknet wallet found. Install ArgentX or Braavos.')
      return
    }
    setIsStarkConnecting(true)
    setStarkError(null)
    try {
      const accounts = await provider.enable()
      setStarkAccount(accounts[0] ?? provider.selectedAddress ?? null)
    } catch {
      setStarkError('Wallet connection rejected.')
    } finally {
      setIsStarkConnecting(false)
    }
  }

  // ── Payment handler ──────────────────────────────────────────────────────
  function handlePay() {
    if (!isValidParams) return

    if (chain === 'base') {
      // ERC-20 USDC transfer via EIP-7702 compatible wallet.
      // Memo bytes are appended to calldata (stored on-chain, ignored by ERC-20 contract).
      const data = encodeErc20Transfer(
        to as `0x${string}`,
        amt,
        CHAIN_META.base.decimals,
        memo,
      )
      sendTransaction({
        to: CHAIN_META.base.tokenAddress,
        data,
        value: 0n,
        // Gas sponsorship via Coinbase Smart Wallet + VITE_COINBASE_PAYMASTER_URL
        // is handled transparently by the wallet when connected with Coinbase Smart Wallet.
      })
    } else if (chain === 'starknet') {
      handleStarknetPay()
    } else {
      // HashKey Chain 177 — native HSK transfer
      sendTransaction({
        to: to as `0x${string}`,
        value: parseEther(amt),
        chainId: CHAIN_META.hashkey.chainId,
        ...(memo.trim() ? { data: memoToHex(memo.trim()) } : {}),
      })
    }
  }

  async function handleStarknetPay() {
    const provider = window.starknet
    if (!provider?.account) {
      setStarkError('Wallet not connected.')
      return
    }
    setIsStarkPending(true)
    setStarkError(null)

    try {
      // Encode USDC amount as uint256 (low 128, high 128)
      const amountUnits = BigInt(Math.round(parseFloat(amt) * 1e6))
      const low = '0x' + (amountUnits & BigInt('0xffffffffffffffffffffffffffffffff')).toString(16)
      const high = '0x0'

      // AVNU Paymaster: Starknet wallets supporting AVNU paymaster will
      // sponsor gas automatically via the paymaster protocol (ERC-4337 on Starknet).
      const result = await provider.account.execute([
        {
          contractAddress: CHAIN_META.starknet.tokenAddress,
          entrypoint: 'transfer',
          calldata: [to, low, high],
        },
      ])

      setStarkTxHash(result.transaction_hash)
      setIsStarkPending(false)
      setIsStarkConfirming(true)

      // Poll for L2 acceptance
      const ctrl = new AbortController()
      starkPollAbort.current = ctrl
      await pollStarknetReceipt(result.transaction_hash, ctrl.signal)
      if (!ctrl.signal.aborted) {
        setIsStarkConfirming(false)
        setIsStarkConfirmed(true)
      }
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

  // ── Unified success / tx state ───────────────────────────────────────────
  const isConfirmed = chain === 'starknet' ? isStarkConfirmed : isEvmConfirmed
  const txHash = chain === 'starknet' ? starkTxHash : evmTxHash
  const isWalletPending = chain === 'starknet' ? isStarkPending : isEvmWalletPending
  const isConfirming = chain === 'starknet' ? isStarkConfirming : isEvmConfirming
  const isSendError = chain !== 'starknet' ? isEvmSendError : !!starkError
  const sendErrorMsg =
    chain === 'starknet'
      ? starkError
      : (evmSendError?.message ?? 'An unknown error occurred').slice(0, 140)

  // ────────────────────────────────────────────────────────────────────────────
  //  INVALID PARAMS STATE
  // ────────────────────────────────────────────────────────────────────────────
  if (!isValidRecipient(to, 'hashkey') && !isValidRecipient(to, 'starknet') && !to) {
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
                /pay?to=0x…&amp;amt=10&amp;chain=base&amp;memo=Coffee
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
    const explorerTxUrl =
      chain === 'starknet'
        ? `${CHAIN_META.starknet.explorerUrl}/tx/${txHash}`
        : `${meta.explorerUrl}/tx/${txHash}`

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
              <Row label="Amount" value={`${formatAmount(amt, meta.decimals)} ${meta.asset}`} mono={false} />
              <Row label="Recipient" value={truncateAddress(to, 8)} mono />
              <Row label="Network" value={meta.label} mono={false} />
              {memo && <Row label="Memo" value={`"${memo}"`} mono={false} />}
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-gray-500">Tx Hash</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-gray-700">
                    {truncateAddress(txHash, 8)}
                  </span>
                  <button onClick={handleCopyHash} className="text-gray-400 hover:text-gray-600 transition-colors">
                    {hashCopied ? (
                      <CheckCheck className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
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
          borderColor: meta.accentColor + '26', // 15% opacity
        }}
      >
        {/* ── Tri-Chain Toggle (top of card) ─────────────────────────── */}
        <div className="flex justify-center pt-5 pb-0 px-6">
          <div className="inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-gray-100/80 p-1">
            {CHAINS.map((c) => {
              const m = CHAIN_META[c]
              const isActive = chain === c
              return (
                <button
                  key={c}
                  onClick={() => handleChainSwitch(c)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150',
                    isActive ? m.toggleActive : 'text-gray-500 hover:text-gray-800',
                  )}
                >
                  <span
                    className={cn(
                      'h-1.5 w-1.5 rounded-full transition-colors',
                      isActive ? 'bg-white/80' : m.dotColor,
                    )}
                  />
                  {m.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Amount header */}
        <div className={cn('border-b border-gray-100 bg-gradient-to-br p-6 text-center mt-4', meta.headerBg)}>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-gray-400">
            Payment Request
          </p>
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
            <Row label="To" value={truncateAddress(to, 8)} mono />
            <Row
              label="Network"
              value={
                <span className="flex items-center gap-1.5 text-sm font-medium text-gray-800">
                  <span className={cn('h-2 w-2 rounded-full', meta.dotColor)} />
                  {chain === 'base' ? 'Base Mainnet' : chain === 'starknet' ? 'Starknet Mainnet' : 'HashKey Chain'}
                </span>
              }
            />
            {chain !== 'starknet' && (
              <Row label="Chain ID" value={String(targetChainId)} mono />
            )}
            <Row
              label="Engine"
              value={
                <span className={cn('text-xs font-medium', meta.badgeText)}>
                  {meta.engineLabel}
                </span>
              }
            />
            {memo && (
              <Row
                label="Memo (on-chain)"
                value={memo.length > 28 ? memo.slice(0, 28) + '…' : memo}
              />
            )}
          </div>

          {/* ── EVM: Wrong network warning ───────────────────────────── */}
          {isEvmChain && isConnected && !isCorrectNetwork && (
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
                  {isSwitching ? (
                    <><Loader2 className="h-3 w-3 animate-spin" /> Switching…</>
                  ) : (
                    <><RefreshCw className="h-3 w-3" /> Switch now</>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ── Starknet: no wallet installed ────────────────────────── */}
          {chain === 'starknet' && !window.starknet && (
            <div className="flex items-start gap-3 rounded-xl border border-purple-200 bg-purple-50 p-4 animate-fade-in">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-purple-500" />
              <div>
                <p className="text-sm font-semibold text-purple-800">No Starknet Wallet</p>
                <p className="text-xs text-purple-700 mt-0.5">
                  Install{' '}
                  <a href="https://www.argent.xyz/argent-x" target="_blank" rel="noopener noreferrer" className="underline">
                    ArgentX
                  </a>{' '}
                  or{' '}
                  <a href="https://www.braavos.app" target="_blank" rel="noopener noreferrer" className="underline">
                    Braavos
                  </a>{' '}
                  to pay with Starknet.
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
                  onClick={() => {
                    resetEvmSend()
                    setStarkError(null)
                  }}
                  className="mt-2 text-xs font-bold text-red-700 hover:text-red-900 transition-colors"
                >
                  Try again
                </button>
              </div>
            </div>
          )}

          {/* ── Primary CTA ─────────────────────────────────────────── */}
          {chain === 'starknet' ? (
            // Starknet flow (independent of wagmi)
            !starkAccount ? (
              <div className="space-y-2">
                <button
                  onClick={connectStarknet}
                  disabled={isStarkConnecting || !window.starknet}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#8B5CF6] px-6 py-4 text-sm font-semibold text-white transition-all hover:bg-[#7C3AED] active:scale-[0.98] disabled:opacity-60"
                >
                  {isStarkConnecting ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Connecting…</>
                  ) : (
                    <><Wallet className="h-4 w-4" /> Connect Starknet Wallet</>
                  )}
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
                {isStarkPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Confirm in Wallet…</>
                ) : isStarkConfirming ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Confirming on Chain…</>
                ) : (
                  <><Zap className="h-4 w-4" /> Pay {formatAmount(amt, 6)} USDC</>
                )}
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
              {isSwitching ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Switching Network…</>
              ) : (
                <><RefreshCw className="h-4 w-4" /> Switch to {meta.label}</>
              )}
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
              {isWalletPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Confirm in Wallet…</>
              ) : isConfirming ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Confirming on Chain…</>
              ) : (
                <><Zap className="h-4 w-4" /> Pay {formatAmount(amt, meta.decimals)} {meta.asset}</>
              )}
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
        <span
          className={cn(
            'text-sm text-gray-800',
            mono ? 'font-mono text-xs' : 'font-medium',
          )}
        >
          {value}
        </span>
      ) : (
        value
      )}
    </div>
  )
}
