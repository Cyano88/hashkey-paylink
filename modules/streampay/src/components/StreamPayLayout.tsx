import { Outlet } from 'react-router-dom'
import { StreamPayHeader } from './StreamPayHeader'

export function StreamPayLayout() {
  return (
    <div className="min-h-screen w-full bg-gray-50 dark:bg-[#111113] font-inter flex flex-col">
      <StreamPayHeader />

      <main className="flex-1 w-full flex flex-col items-center px-4 md:px-8 pb-10">
        <Outlet />
      </main>

      <footer className="w-full max-w-[480px] mx-auto py-6 px-4 flex items-center justify-center">
        <p className="text-[11px] font-medium tracking-widest uppercase text-gray-300 dark:text-gray-600 text-center">
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
    </div>
  )
}
