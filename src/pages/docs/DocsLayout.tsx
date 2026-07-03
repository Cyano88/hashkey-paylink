import { useState } from 'react'
import { Outlet, NavLink, Link } from 'react-router-dom'
import { Menu, X, ExternalLink, Sun, Moon, ChevronRight } from 'lucide-react'
import { useTheme } from '../../lib/ThemeContext'

const NAV = [
  {
    group: 'Introduction',
    items: [
      { label: 'Overview',         path: '/docs',                end: true },
      { label: 'Getting Started',  path: '/docs/getting-started' },
    ],
  },
  {
    group: 'Hash PayLink',
    items: [
      { label: 'Payment Links',       path: '/docs/payment-links' },
      { label: 'Multi-Payer Collection', path: '/docs/multi-payer' },
      { label: 'Flexible Amount',     path: '/docs/flexible-amount' },
      { label: 'QR Codes',            path: '/docs/qr-codes' },
      { label: 'FX Display',          path: '/docs/fx-display' },
    ],
  },
  {
    group: 'Supported Chains',
    items: [
      { label: 'Base',          path: '/docs/chains/base' },
      { label: 'Arbitrum',      path: '/docs/chains/arbitrum' },
      { label: 'Arc Testnet',   path: '/docs/chains/arc' },
      { label: 'Solana',        path: '/docs/chains/solana' },
    ],
  },
  {
    group: '0G Storage',
    items: [
      { label: 'How It Works',      path: '/docs/0g-storage' },
      { label: 'Agent Verification', path: '/docs/0g-storage/agent-verify' },
    ],
  },
  {
    group: 'Access Mode',
    items: [
      { label: 'Overview',         path: '/docs/access-mode' },
      { label: 'API Integration',  path: '/docs/access-mode/api' },
    ],
  },
  {
    group: 'SDK',
    items: [
      { label: '@hashpaylink/sdk', path: '/docs/sdk' },
      { label: 'URL Parameters',   path: '/docs/sdk/url-params' },
    ],
  },
  {
    group: 'HashpayStream',
    items: [
      { label: 'Overview',        path: '/docs/streampay' },
      { label: 'Payroll',         path: '/docs/streampay/payroll' },
      { label: 'Agentic Streams', path: '/docs/streampay/agentic' },
      { label: 'Arena',           path: '/docs/streampay/arena' },
    ],
  },
  {
    group: 'Reference',
    items: [
      { label: 'API Endpoints',          path: '/docs/api' },
      { label: 'Environment Variables',  path: '/docs/environment' },
      { label: 'Security',               path: '/docs/security' },
      { label: 'Wallet Setup',           path: '/docs/wallets' },
      { label: 'Terms',                  path: '/docs/terms' },
      { label: 'Privacy',                path: '/docs/privacy' },
    ],
  },
]

export default function DocsLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { theme, toggle } = useTheme()

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 font-inter">
      {/* Top bar */}
      <header className="sticky top-0 z-50 h-14 border-b border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-gray-950/95 backdrop-blur-sm">
        <div className="flex items-center justify-between h-full px-4 max-w-screen-xl mx-auto">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(o => !o)}
              className="lg:hidden p-1.5 rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <Link to="/" className="flex items-center gap-1.5 group">
              <span className="font-bold text-gray-900 dark:text-white tracking-tight">Hash PayLink</span>
              <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-gray-500 dark:text-gray-400 text-sm font-medium">Docs</span>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggle}
              className="p-1.5 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Toggle dark mode"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <Link
              to="/"
              className="hidden sm:flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Go to app
            </Link>
          </div>
        </div>
      </header>

      <div className="flex max-w-screen-xl mx-auto">
        {/* Sidebar */}
        <aside
          className={`
            fixed lg:sticky top-14 z-40 h-[calc(100vh-3.5rem)]
            w-72 shrink-0 overflow-y-auto
            border-r border-gray-200 dark:border-gray-800
            bg-white dark:bg-gray-950
            transition-transform duration-200
            lg:translate-x-0
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          `}
        >
          <nav className="py-6 px-3 space-y-5">
            {NAV.map((section) => (
              <div key={section.group}>
                <p className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-600">
                  {section.group}
                </p>
                <ul className="space-y-0.5">
                  {section.items.map((item) => (
                    <li key={item.path}>
                      <NavLink
                        to={item.path}
                        end={'end' in item ? item.end : false}
                        onClick={() => setSidebarOpen(false)}
                        className={({ isActive }) =>
                          `flex items-center px-3 py-1.5 rounded-lg text-sm transition-colors ${
                            isActive
                              ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 font-medium'
                              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-900'
                          }`
                        }
                      >
                        {item.label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/20 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Content */}
        <main className="flex-1 min-w-0 px-6 lg:px-16 py-12 max-w-3xl">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
