import { Outlet } from 'react-router-dom'
import { StreamPayHeader } from './StreamPayHeader'

export function StreamPayLayout() {
  return (
    <div className="min-h-screen w-full bg-gray-50 font-inter flex flex-col">

      {/* Global navigation rail */}
      <StreamPayHeader />

      {/* Page content — px-4 safe edge, no vertical centering (header anchors the page) */}
      <main className="flex-1 w-full flex flex-col items-center px-4 md:px-8 pb-10">
        <Outlet />
      </main>

      {/* Footer — constrained to same 480px as cards */}
      <footer className="w-full max-w-[480px] mx-auto py-6 px-4 flex flex-col items-center gap-3">
        <p className="text-[11px] font-medium tracking-widest uppercase text-gray-300 text-center">
          Streampay &nbsp;·&nbsp; Arc Network &nbsp;·&nbsp;{' '}
          <a
            href="https://hashkey-paylink.onrender.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gray-500 transition-colors"
          >
            Hash PayLink SDK
          </a>
        </p>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1">
          <img src="/hash-logo.png" alt="#" className="h-3 w-3 opacity-50" />
          <span className="text-[10px] font-semibold text-gray-400">Powered by Hash PayLink</span>
        </span>
      </footer>

    </div>
  )
}
