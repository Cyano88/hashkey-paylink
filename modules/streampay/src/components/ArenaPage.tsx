import { Link, useLocation } from 'react-router-dom'
import { HashPayLinkBadge } from './CreateStreamForm'

function useAppPath(path: string): string {
  const { search } = useLocation()
  const params = new URLSearchParams(search)
  const app = params.get('app')
  return app ? `${path}?app=${app}` : path
}

export function ArenaPage() {
  const payrollTo = useAppPath('/')

  return (
    <div className="w-full max-w-[520px] mx-auto mt-10">
      <div className="space-y-5">
        <div className="text-center space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">StreamPay Arena</p>
          <h1 className="text-[26px] sm:text-[30px] font-bold tracking-tight text-gray-900 dark:text-gray-100">
            Stream-based game rooms
          </h1>
          <p className="mx-auto max-w-[420px] text-[13px] leading-relaxed text-gray-500 dark:text-gray-400">
            Competitive USDC rooms where funds stream into a prize pool only while a player stays active.
          </p>
        </div>

        <div className="rounded-2xl border border-gray-100 dark:border-white/10 bg-white dark:bg-[#111216] shadow-sm overflow-hidden">
          <div className="p-5 sm:p-7 space-y-5">
            <div className="grid grid-cols-3 gap-2">
              {[
                ['Deposit', 'USDC locked per player'],
                ['Stream', 'Risk increases by round'],
                ['Claim', 'Winners and refunds settle on Arc'],
              ].map(([title, body]) => (
                <div key={title} className="rounded-xl border border-gray-100 dark:border-white/10 bg-gray-50/80 dark:bg-white/5 p-3 text-center">
                  <p className="text-[11px] font-bold text-gray-800 dark:text-gray-100">{title}</p>
                  <p className="mt-1 text-[10px] leading-snug text-gray-400">{body}</p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-blue-100 dark:border-blue-900/30 bg-blue-50/40 dark:bg-blue-950/20 p-4">
              <p className="text-[12px] font-bold text-gray-800 dark:text-gray-100">Build status</p>
              <p className="mt-1 text-[12px] leading-relaxed text-gray-500 dark:text-gray-400">
                Arena is being designed as the next StreamPay mode. Payroll and Agentic Streaming stay live while the room contract, prize math, and refund flow are built.
              </p>
            </div>

            <Link
              to={payrollTo}
              className="flex w-full items-center justify-center rounded-xl bg-gray-900 py-3.5 text-[13px] font-bold text-white transition-transform active:scale-[0.98]"
            >
              Back to Payroll
            </Link>

            <HashPayLinkBadge />
          </div>
        </div>
      </div>
    </div>
  )
}
