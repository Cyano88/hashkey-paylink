import type { RefObject } from 'react'
import { CheckCheck, Download, ExternalLink, LayoutDashboard, Share2, Sliders } from 'lucide-react'
import { QRCodeCanvas } from 'qrcode.react'
import { cn, truncateAddress } from '../../../lib/utils'

type PocketPayLinkReadyPanelProps = {
  url: string
  copied: boolean
  flexible: boolean
  localCurrency: boolean
  amountLabel: string
  networkLabel: string
  evmAddress?: string
  solanaAddress?: string
  memo: string
  eventMode: boolean
  accessMode: boolean
  dashboardUrl: string
  qrRef: RefObject<HTMLDivElement>
  qrHiResRef: RefObject<HTMLDivElement>
  onReset: () => void
  onDownloadQr: () => void
  onShare: () => void
}

export function PocketPayLinkReadyPanel({
  url,
  copied,
  flexible,
  localCurrency,
  amountLabel,
  networkLabel,
  evmAddress,
  solanaAddress,
  memo,
  eventMode,
  accessMode,
  dashboardUrl,
  qrRef,
  qrHiResRef,
  onReset,
  onDownloadQr,
  onShare,
}: PocketPayLinkReadyPanelProps) {
  return (
    <div className="animate-slide-up space-y-4 border-t border-gray-100 bg-gray-50/70 p-3 dark:border-white/10 dark:bg-white/[0.03] sm:p-4">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-900 bg-gray-950 text-white dark:border-white dark:bg-white dark:text-gray-950">
              <CheckCheck className="h-3.5 w-3.5" />
            </span>
            Link Ready
          </p>
          <button onClick={onReset} className="text-xs font-medium text-gray-400 transition-colors hover:text-gray-700 dark:hover:text-gray-200">
            Start over
          </button>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-white/[0.04] sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Preview</p>
            <div className="flex items-baseline gap-1.5">
              {flexible
                ? <span className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-sm font-semibold text-gray-800 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-100"><Sliders className="h-3.5 w-3.5" />{localCurrency ? 'Flexible NGN' : 'Flexible'}</span>
                : <><span className="text-2xl font-bold text-gray-900 dark:text-white">{amountLabel}</span><span className="text-sm font-medium text-gray-500 dark:text-gray-400">{localCurrency ? 'NGN' : 'USDC'}</span></>
              }
            </div>
            <div className="space-y-1">
              {evmAddress && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <span>{networkLabel}:</span>
                  <span className="font-mono text-gray-700 dark:text-gray-200">{truncateAddress(evmAddress, 8)}</span>
                </div>
              )}
              {solanaAddress && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <span>Solana:</span>
                  <span className="font-mono text-gray-700 dark:text-gray-200">{truncateAddress(solanaAddress, 8)}</span>
                </div>
              )}
              {memo && (
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <span>Payment note: <span className="font-medium text-gray-700 dark:text-gray-200">"{memo}"</span></span>
                </div>
              )}
            </div>
          </div>

          {!eventMode && (
            <div className="flex shrink-0 flex-col items-center gap-1.5 self-center sm:self-auto">
              <div ref={qrRef} className="relative rounded-xl border border-gray-100 bg-white p-1.5 shadow-sm">
                <QRCodeCanvas value={url} size={112} level="H" includeMargin />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="rounded-sm bg-white p-0.5">
                    <img src="/hash-logo.png" alt="" className="h-4 w-4 object-contain" />
                  </div>
                </div>
              </div>
              <button
                onClick={onDownloadQr}
                className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[10px] font-medium text-gray-500 transition-all hover:bg-gray-50 hover:text-gray-700 active:scale-[0.98]"
              >
                <Download className="h-3 w-3" /> Save
              </button>
            </div>
          )}
        </div>

        <div className="grid gap-2.5 sm:grid-cols-[1fr_auto]">
          <button
            onClick={onShare}
            className={cn(
              'flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all active:scale-[0.98]',
              copied
                ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300'
                : 'bg-black text-white hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200',
            )}
          >
            {copied ? <><CheckCheck className="h-4 w-4" /> Copied!</> : <><Share2 className="h-4 w-4" /> Share</>}
          </button>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-all hover:border-gray-300 hover:bg-gray-50 active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200 dark:hover:border-white/20 dark:hover:bg-white/[0.07]"
          >
            <ExternalLink className="h-4 w-4" />
            Test
          </a>
        </div>

        {!eventMode && (
          <a
            href={dashboardUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-all hover:border-gray-300 hover:bg-gray-50 active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200 dark:hover:border-white/20 dark:hover:bg-white/[0.07]"
          >
            <LayoutDashboard className="h-4 w-4" />
            View payments
          </a>
        )}

        {eventMode && (
          <div className="grid gap-2">
            <a
              href={dashboardUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-all hover:border-gray-300 hover:bg-gray-50 active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200 dark:hover:border-white/20 dark:hover:bg-white/[0.07]"
            >
              <LayoutDashboard className="h-4 w-4" />
              View payments
            </a>
          </div>
        )}

        {eventMode && (
          <p className="text-[11px] text-gray-400">
            {accessMode
              ? 'Each payer enters their name — used to generate their personal access link after payment.'
              : 'Each payer must enter their name before paying — their entry will appear live in the dashboard.'}
          </p>
        )}

        <div ref={qrHiResRef} aria-hidden="true"
          style={{ position: 'absolute', left: '-9999px', visibility: 'hidden' }}>
          <QRCodeCanvas value={url} size={1024} level="H" includeMargin />
        </div>
      </div>
    </div>
  )
}
