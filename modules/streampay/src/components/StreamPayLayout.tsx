import { Outlet } from 'react-router-dom'

/**
 * StreamPayLayout
 *
 * Minimal page wrapper for the Streampay sub-app.
 * The StreamView card carries its own header watermark and footer badge,
 * so this layout intentionally has no nav — just a centered canvas.
 */
export function StreamPayLayout() {
  return (
    <div className="min-h-screen bg-[#F2F3F7] font-inter flex flex-col">
      {/* ── Page canvas ─────────────────────────────────────────────── */}
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-12 sm:py-16">
        <Outlet />
      </main>

      {/* ── Minimal footer ──────────────────────────────────────────── */}
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
