import { Outlet, useLocation } from 'react-router-dom'
import { StreamPayHeader } from './StreamPayHeader'

function isTelegramStreamPay(search: string) {
  const params = new URLSearchParams(search)
  const source = (params.get('src') ?? '').toLowerCase()
  const wallet = (params.get('wallet') ?? params.get('mode') ?? '').toLowerCase()
  return source === 'telegram' || wallet === 'circle'
}

export function StreamPayLayout() {
  const { search } = useLocation()
  const telegramMode = isTelegramStreamPay(search)
  const brandLabel = telegramMode ? 'Powered by Circle' : 'StreamPay'

  return (
    <div className="min-h-screen w-full bg-gray-50 dark:bg-[#111113] font-inter flex flex-col">
      <StreamPayHeader />

      <main className="flex-1 w-full flex flex-col items-center px-4 md:px-8 pb-10">
        <Outlet />
      </main>

      <footer className="w-full max-w-[480px] mx-auto py-6 px-4 flex items-center justify-center">
        <p className="text-[11px] font-medium tracking-widest uppercase text-gray-300 dark:text-gray-600 text-center">
          {brandLabel} &nbsp;|&nbsp; Streaming on Arc &nbsp;|&nbsp;{' '}
          <a
            href="https://hashkey-paylink.onrender.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gray-500 dark:hover:text-gray-400 transition-colors"
          >
            Hash PayLink SDK
          </a>
        </p>
      </footer>
    </div>
  )
}
