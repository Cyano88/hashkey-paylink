import { CheckCheck, Copy, Mail, MessageCircle, Send, X } from 'lucide-react'
import { cn } from '../lib/utils'

type PayLinkShareSheetProps = {
  open: boolean
  url: string
  copied: boolean
  shareText: string
  title?: string
  subtitle?: string
  emailSubject?: string
  onCopy: () => void | Promise<void>
  onClose: () => void
}

export default function PayLinkShareSheet({
  open,
  url,
  copied,
  shareText,
  title = 'Share payment link',
  subtitle = 'Copy it or send it directly.',
  emailSubject = 'Hash PayLink payment request',
  onCopy,
  onClose,
}: PayLinkShareSheetProps) {
  if (!open || !url) return null

  const absoluteUrl = /^https?:\/\//i.test(url)
    ? url
    : `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`
  const shareMessage = [shareText.trim(), absoluteUrl].filter(Boolean).join('\n\n')
  const encodedShareUrl = encodeURIComponent(absoluteUrl)
  const encodedShareText = encodeURIComponent(shareText.split('\n')[0] || 'Hash PayLink payment request')
  const encodedShareMessage = encodeURIComponent(shareMessage)

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 px-4 pb-5 sm:items-center sm:pb-0"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-gray-100 bg-white p-4 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900">{title}</p>
            <p className="text-xs text-gray-400">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            aria-label="Close share options"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => void onCopy()}
          className={cn(
            'mb-2 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all active:scale-[0.98]',
            copied
              ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'bg-black text-white hover:bg-gray-800',
          )}
        >
          {copied ? <><CheckCheck className="h-4 w-4" /> Copied!</> : <><Copy className="h-4 w-4" /> Copy link</>}
        </button>

        <div className="grid grid-cols-2 gap-2">
          <a
            href={`https://wa.me/?text=${encodedShareMessage}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 hover:border-gray-300 hover:bg-gray-50"
          >
            <MessageCircle className="h-4 w-4" />
            WhatsApp
          </a>
          <a
            href={`https://t.me/share/url?url=${encodedShareUrl}&text=${encodedShareText}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 hover:border-gray-300 hover:bg-gray-50"
          >
            <Send className="h-4 w-4" />
            Telegram
          </a>
          <a
            href={`https://x.com/messages/compose?text=${encodedShareMessage}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 hover:border-gray-300 hover:bg-gray-50"
          >
            <X className="h-4 w-4" />
            X DM
          </a>
          <a
            href={`mailto:?subject=${encodeURIComponent(emailSubject)}&body=${encodedShareMessage}`}
            className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 hover:border-gray-300 hover:bg-gray-50"
          >
            <Mail className="h-4 w-4" />
            Email
          </a>
        </div>

        <p className="mt-5 text-center text-[11px] font-medium text-gray-400">
          Powered by Hash PayLink
        </p>
      </div>
    </div>
  )
}
