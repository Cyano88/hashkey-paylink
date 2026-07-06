import { Outlet } from 'react-router-dom'
import { ExternalLink, Mail, X } from 'lucide-react'
import { StreamPayHeader } from './StreamPayHeader'
import { StreamAgentHash } from './StreamAgentHash'

export function StreamPayLayout() {
  return (
    <div className="min-h-screen w-full bg-gray-50 dark:bg-[#111113] font-inter flex flex-col">
      <StreamPayHeader />

      <main className="flex-1 w-full flex flex-col items-center px-4 md:px-8 pb-10">
        <Outlet />
      </main>

      <div className="w-full max-w-[480px] mx-auto px-4 pt-3 pb-2">
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <a
            href="mailto:support@hashpaylink.com"
            className="flex items-center gap-1.5 text-xs text-gray-400 transition-colors hover:text-gray-900 dark:hover:text-gray-200"
          >
            <Mail className="h-3.5 w-3.5 shrink-0" />
            Support
          </a>
          <a
            href="https://x.com/Hash_PayLink"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-gray-400 transition-colors hover:text-gray-900 dark:hover:text-gray-200"
          >
            <X className="h-3.5 w-3.5 shrink-0" />
            DM us
          </a>
          <a
            href="https://hashpaylink.com/hashpaystream/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-gray-400 transition-colors hover:text-gray-900 dark:hover:text-gray-200"
          >
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            Docs
          </a>
        </div>
      </div>

      <footer className="w-full max-w-[480px] mx-auto px-4 pb-5">
        <p className="border-t border-gray-100 pt-4 text-center text-[10px] font-medium uppercase tracking-[0.18em] text-gray-300 dark:border-white/10 dark:text-gray-600">
          <a
            href="https://testnet.arcscan.app"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-gray-500 dark:hover:text-gray-400"
          >
            Streaming on Arc
          </a>
        </p>
      </footer>
      <StreamAgentHash />
    </div>
  )
}
