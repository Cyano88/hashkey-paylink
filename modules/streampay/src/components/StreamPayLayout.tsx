import { Outlet } from 'react-router-dom'

export function StreamPayLayout() {
  return (
    <div className="min-h-screen bg-[#F5F5F7] font-inter flex flex-col">
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-12 sm:py-16">
        <Outlet />
      </main>

      <footer className="py-4 text-center text-[11px] font-medium tracking-widest uppercase text-gray-300">
        Streampay &nbsp;·&nbsp; Arc Network &nbsp;·&nbsp;{' '}
        <a
          href="https://hashkey-paylink.onrender.com"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-gray-500 transition-colors"
        >
          Hash PayLink SDK
        </a>
      </footer>
    </div>
  )
}
