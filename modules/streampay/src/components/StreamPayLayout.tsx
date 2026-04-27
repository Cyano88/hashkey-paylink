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
      <footer className="w-full max-w-[480px] mx-auto py-6 px-4 flex items-center justify-center">
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
      </footer>

    </div>
  )
}
