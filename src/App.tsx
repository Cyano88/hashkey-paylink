import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Layout from './Layout'
import SurfaceLayout from './surfaces/SurfaceLayout'
import ExternalRedirect from './surfaces/ExternalRedirect'
import FoundationPage from './pages/FoundationPage'
import X402Receipt   from './pages/X402Receipt'
import AgentTerms    from './pages/AgentTerms'
import { SolanaProvider } from './lib/SolanaContext'
import StreamPayApp from '../modules/streampay/src/StreamPayApp'
import PocketLegalDocumentPage from './pocket/pages/PocketLegalDocumentPage'
import CirclePocketApp from './pocket/CirclePocketApp'
import { isPocketHostname, POCKET_ORIGIN } from './pocket/lib/pocketRoutes'

// ── Hostname-based app routing ────────────────────────────────────────────────
// Pocket and legacy compatibility links still share this runtime. The
// standalone HashPayStream product is served independently at hashpaystream.app.
const { hostname, pathname } = window.location
const IS_APP_HOST = hostname === 'app.hashpaylink.com'
const IS_POCKET_HOST = isPocketHostname(hostname)
const isStreamPayRoute =
  pathname === '/stream' ||
  pathname.startsWith('/stream/') ||
  pathname === '/recipient' ||
  pathname === '/creator' ||
  pathname === '/creator-admin' ||
  pathname === '/arena'

export default function App() {
  // Pocket owns clean root-level routes on its dedicated production hostname.
  if (IS_POCKET_HOST) {
    return (
      <SolanaProvider>
        <BrowserRouter>
          <Routes>
            <Route path="docs/account-deletion" element={<PocketLegalDocumentPage document="account-deletion" />} />
            <Route element={<Layout />}>
              <Route path="receipt/:activityId" element={<X402Receipt />} />
              <Route path="*" element={<CirclePocketApp />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </SolanaProvider>
    )
  }

  // Hidden rollback boundary for historical links. No current Hash PayLink
  // navigation exposes this embedded compatibility app.
  if (isStreamPayRoute) return <StreamPayApp />

  const appShellRoutes = (
    <Route element={<SurfaceLayout />}>

      <Route path="pocket/*" element={<PocketLegacyEntry />} />
      <Route path="pay" element={<ExternalRedirect origin="https://app.hashpaylink.com" />} />
      <Route path="pay/c/:checkoutId" element={<ExternalRedirect origin="https://app.hashpaylink.com" />} />
      <Route path="pay/a/:checkoutId" element={<ExternalRedirect origin="https://app.hashpaylink.com" />} />
      <Route path="wallet/swap/:sessionId" element={<ExternalRedirect origin="https://app.hashpaylink.com" />} />
      <Route path="wallet/connect/:connectionId" element={<ExternalRedirect origin="https://app.hashpaylink.com" />} />
      <Route path="agreements/xstocks/:agreementId" element={<ExternalRedirect origin="https://app.hashpaylink.com" />} />
      <Route path="agreements/:agreementId" element={<ExternalRedirect origin="https://app.hashpaylink.com" />} />
      <Route path="admin/*" element={<ExternalRedirect origin="https://developer.hashpaylink.com" />} />
      <Route path="developers" element={<ExternalRedirect origin="https://developer.hashpaylink.com" pathname="/" />} />
      <Route path="p/:network/:amount/:recipient/:memo" element={<ExternalRedirect origin="https://app.hashpaylink.com" />} />
      <Route path="agent-terms" element={<AgentTerms />} />
      <Route path="receipt/:activityId" element={<ExternalRedirect origin="https://app.hashpaylink.com" />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  )

  // Default → Hash PayLink
  return (
    <SolanaProvider>
    <BrowserRouter>
      <Routes>
        <Route path="hashpaystream/docs" element={<StandaloneHashPayStreamRedirect />} />
        <Route path="docs/*" element={<ExternalRedirect origin="https://docs.hashpaylink.com" />} />
        {!IS_APP_HOST && <Route index element={<FoundationPage />} />}
        {appShellRoutes}
      </Routes>
    </BrowserRouter>
    </SolanaProvider>
  )
}

function StandaloneHashPayStreamRedirect() {
  useEffect(() => {
    window.location.replace('https://hashpaystream.app/docs')
  }, [])
  return <main className="grid min-h-screen place-items-center bg-white text-sm font-semibold text-gray-500 dark:bg-gray-950 dark:text-gray-400">Opening HashPayStream...</main>
}

function PocketLegacyEntry() {
  const location = useLocation()
  const local = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
  const relativePath = location.pathname.slice('/pocket'.length) || '/'
  const destination = `${POCKET_ORIGIN}${relativePath}${location.search}${location.hash}`

  useEffect(() => {
    if (!local) window.location.replace(destination)
  }, [destination, local])

  if (local) return <CirclePocketApp />
  return <main className="grid min-h-screen place-items-center bg-[#F5F5F7] text-xs font-semibold text-gray-500 dark:bg-[#0A0A0A] dark:text-gray-400">Opening Pocket…</main>
}
