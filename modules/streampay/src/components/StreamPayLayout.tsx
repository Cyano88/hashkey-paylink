import { Outlet } from 'react-router-dom'

export function StreamPayLayout() {
  return (
    // Rule 1: Safety Container — mandatory edge gap, consistent background, centered column
    <div className="min-h-screen w-full bg-gray-50 font-inter flex flex-col items-center p-4 md:p-8">

      <main className="flex-1 w-full flex flex-col items-center justify-center py-4 md:py-6">
        <Outlet />
      </main>

      <footer className="w-full max-w-[480px] mx-auto py-4 flex flex-col items-center gap-3">
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
