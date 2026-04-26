import { Outlet } from 'react-router-dom'

export function StreamPayLayout() {
  return (
    <div className="min-h-screen bg-[#F5F5F7] font-inter flex flex-col">
      {/* Safe horizontal padding prevents content touching screen edges on all devices */}
      <main className="flex flex-1 flex-col items-center justify-start px-4 pt-8 pb-6 sm:justify-center sm:py-12">
        <Outlet />
      </main>

      <footer className="py-5 flex flex-col items-center gap-3 px-4">
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
