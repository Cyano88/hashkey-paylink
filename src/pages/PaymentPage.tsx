import { useEffect, useState } from 'react'
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
} from 'lucide-react'
import { hashkeyTestnet, EXPLORER_URL } from '../lib/wagmi'
import { cn, truncateAddress, formatHSK, memoToHex, copyToClipboard } from '../lib/utils'

// ─── Component ───────────────────────────────────────────────────────────────
export default function PaymentPage() {
  const [searchParams] = useSearchParams()
  const to = searchParams.get('to') ?? ''
  const amt = searchParams.get('amt') ?? ''
  const memo = searchParams.get('memo') ?? ''

  const [hashCopied, setHashCopied] = useState(false)

  // ── Wagmi hooks
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain, isPending: isSwitching } = useSwitchChain()

  const {
    sendTransaction,
    data: txHash,
    isPending: isWalletPending,
    isError: isSendError,
    error: sendError,
    reset: resetSend,
  } = useSendTransaction()

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash: txHash })

  // ── Derived state
  const isCorrectNetwork = chainId === hashkeyTestnet.id
  const isValidParams =
    isAddress(to) && !isNaN(parseFloat(amt)) && parseFloat(amt) > 0

  // ── Auto-switch to HashKey Testnet on connect
  useEffect(() => {
    if (isConnected && !isCorrectNetwork && !isSwitching) {
      switchChain({ chainId: hashkeyTestnet.id })
    }
  }, [isConnected, isCorrectNetwork, isSwitching, switchChain])

  // ── Handlers
  function handlePay() {
    if (!isValidParams) return
    sendTransaction({
      to: to as `0x${string}`,
      value: parseEther(amt),
      ...(memo.trim() ? { data: memoToHex(memo.trim()) } : {}),
    })
  }

  async function handleCopyHash() {
    if (!txHash) return
    await copyToClipboard(txHash)
    setHashCopied(true)
    setTimeout(() => setHashCopied(false), 2000)
  }

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
                /pay?to=0x…&amp;amt=0.1&amp;memo=Coffee
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
    return (
      <div className="mx-auto max-w-md animate-scale-in">
        <div className="overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-card">
          {/* Hero */}
          <div className="bg-gradient-to-br from-emerald-50 to-green-50 p-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-sm animate-bounce-in">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Payment Sent!</h2>
            <p className="mt-1 text-sm text-gray-600">
              <span className="font-semibold text-gray-900">{formatHSK(amt)} HSK</span>{' '}
              delivered successfully
            </p>
          </div>

          {/* Details */}
          <div className="p-6 space-y-4">
            <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 bg-gray-50/60 overflow-hidden">
              <Row label="Amount" value={`${formatHSK(amt)} HSK`} mono={false} />
              <Row label="Recipient" value={truncateAddress(to, 8)} mono />
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
              href={`${EXPLORER_URL}/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all active:scale-[0.98]"
            >
              <ExternalLink className="h-4 w-4" />
              View on HashKey Explorer
            </a>

            <Link
              to="/"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 transition-all active:scale-[0.98]"
            >
              Create your own payment link
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
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-card">

        {/* Amount header */}
        <div className="border-b border-gray-100 bg-gradient-to-br from-slate-50 to-gray-50 p-6 text-center">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-gray-400">
            Payment Request
          </p>
          <div className="flex items-baseline justify-center gap-2">
            <span className="text-[2.75rem] font-bold leading-none tracking-tight text-gray-900">
              {formatHSK(amt)}
            </span>
            <span className="text-xl font-semibold text-gray-400">HSK</span>
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
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  HashKey Testnet
                </span>
              }
            />
            <Row label="Chain ID" value="133" mono />
            {memo && (
              <Row
                label="Memo (on-chain)"
                value={memo.length > 28 ? memo.slice(0, 28) + '…' : memo}
              />
            )}
          </div>

          {/* Wrong network warning */}
          {isConnected && !isCorrectNetwork && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 animate-fade-in">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
              <div className="flex-1 space-y-2">
                <p className="text-sm font-semibold text-amber-800">Wrong Network</p>
                <p className="text-xs text-amber-700">
                  Switch to HashKey Testnet (Chain ID 133) to continue.
                </p>
                <button
                  onClick={() => switchChain({ chainId: hashkeyTestnet.id })}
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

          {/* Send error */}
          {isSendError && (
            <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 animate-fade-in">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-800">Transaction Failed</p>
                <p className="mt-0.5 break-all text-xs text-red-600">
                  {(sendError?.message ?? 'An unknown error occurred').slice(0, 140)}
                  {(sendError?.message?.length ?? 0) > 140 ? '…' : ''}
                </p>
                <button
                  onClick={resetSend}
                  className="mt-2 text-xs font-bold text-red-700 hover:text-red-900 transition-colors"
                >
                  Try again
                </button>
              </div>
            </div>
          )}

          {/* ── Primary CTA ─────────────────────────────────────────── */}
          {!isConnected ? (
            <div className="space-y-2">
              <div className="flex justify-center">
                <ConnectButton label="Connect Wallet to Pay" />
              </div>
              <p className="text-center text-xs text-gray-400">
                MetaMask, Coinbase Wallet, WalletConnect & more
              </p>
            </div>
          ) : !isCorrectNetwork ? (
            <button
              onClick={() => switchChain({ chainId: hashkeyTestnet.id })}
              disabled={isSwitching}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-6 py-4 text-sm font-semibold text-white transition-all hover:bg-amber-600 active:scale-[0.98] disabled:opacity-70"
            >
              {isSwitching ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Switching Network…</>
              ) : (
                <><RefreshCw className="h-4 w-4" /> Switch to HashKey Testnet</>
              )}
            </button>
          ) : (
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
                <><Zap className="h-4 w-4" /> Pay {formatHSK(amt)} HSK</>
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
            href={`${EXPLORER_URL}/tx/${txHash}`}
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
