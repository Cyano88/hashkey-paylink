import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import Layout from './Layout'
import FoundationPage from './pages/FoundationPage'
import CreateLink from './pages/CreateLink'
import PaymentPage from './pages/PaymentPage'
import Dashboard from './pages/Dashboard'
import EventDashboard from './pages/EventDashboard'
import AgentWorkspace from './pages/AgentWorkspace'
import TelegramPaymentLinks from './pages/TelegramPaymentLinks'
import NigerianPos from './pages/NigerianPos'
import X402Receipt   from './pages/X402Receipt'
import AgentTerms    from './pages/AgentTerms'
import { SolanaProvider } from './lib/SolanaContext'
import StreamPayApp from '../modules/streampay/src/StreamPayApp'
import DocsLayout       from './pages/docs/DocsLayout'
import DocsHome         from './pages/docs/DocsHome'
import GettingStarted   from './pages/docs/GettingStarted'
import PaymentLinks     from './pages/docs/PaymentLinks'
import Chains           from './pages/docs/Chains'
import ZeroGStorage     from './pages/docs/ZeroGStorage'
import AccessMode       from './pages/docs/AccessMode'
import ApiReference     from './pages/docs/ApiReference'
import SDKDocs          from './pages/docs/SDKDocs'
import StreamPayDocs    from './pages/docs/StreamPayDocs'
import SecurityDocs     from './pages/docs/SecurityDocs'
import WalletsDocs      from './pages/docs/WalletsDocs'
import EnvironmentDocs  from './pages/docs/EnvironmentDocs'
import TermsDocs        from './pages/docs/TermsDocs'
import PrivacyDocs      from './pages/docs/PrivacyDocs'

// ── Hostname-based app routing ────────────────────────────────────────────────
// The same Render service hosts both apps. The active hostname determines
// which React app is mounted. Add ?app=streampay to any localhost URL for
// local Streampay development without changing DNS.
const { hostname, pathname, search } = window.location
const IS_APP_HOST = hostname === 'app.hashpaylink.com'
const isStreamPayRoute =
  pathname === '/stream' ||
  pathname.startsWith('/stream/') ||
  pathname === '/recipient'
const IS_STREAMPAY =
  hostname === 'streampay.xyz'                           ||  // production domain
  hostname.endsWith('.streampay.xyz')                    ||  // subdomains
  hostname.includes('streampay')                         ||  // onrender.com service named streampay-*
  isStreamPayRoute                                       ||  // StreamPay share links on hashpaylink.com
  new URLSearchParams(search).get('app') === 'streampay'    // localhost dev toggle

export default function App() {
  // Streampay domain → mount the Streampay sub-app (full separate router)
  if (IS_STREAMPAY) return <StreamPayApp />

  const appShellRoutes = (
    <Route element={<Layout />}>
      {IS_APP_HOST && <Route index element={<CreateLink />} />}
      <Route path="app" element={<CreateLink />} />
      <Route path="create" element={<CreateLink />} />
      <Route path="polymarket" element={<CreateLink initialProduct="polymarket" />} />
      <Route path="pay" element={<PaymentPage />} />
      <Route path="p/:network/:amount/:recipient/:memo" element={<ShortPayRedirect />} />
      <Route path="dashboard" element={<Dashboard />} />
      <Route path="event" element={<EventDashboard />} />
      <Route path="agent" element={<AgentWorkspace />} />
      <Route path="telegram/payment-links" element={<TelegramPaymentLinks />} />
      <Route path="pos/ng" element={<NigerianPos />} />
      <Route path="agent-terms" element={<AgentTerms />} />
      <Route path="receipt/:activityId" element={<X402Receipt />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  )

  // Default → Hash PayLink
  return (
    <SolanaProvider>
    <BrowserRouter>
      <Routes>
        <Route path="docs" element={<DocsLayout />}>
          <Route index element={<DocsHome />} />
          <Route path="getting-started"    element={<GettingStarted />} />
          <Route path="payment-links"      element={<PaymentLinks />} />
          <Route path="multi-payer"        element={<PaymentLinks />} />
          <Route path="flexible-amount"    element={<PaymentLinks />} />
          <Route path="qr-codes"           element={<PaymentLinks />} />
          <Route path="fx-display"         element={<PaymentLinks />} />
          <Route path="chains/*"           element={<Chains />} />
          <Route path="0g-storage"         element={<ZeroGStorage />} />
          <Route path="0g-storage/*"       element={<ZeroGStorage />} />
          <Route path="access-mode"        element={<AccessMode />} />
          <Route path="access-mode/*"      element={<AccessMode />} />
          <Route path="api"                element={<ApiReference />} />
          <Route path="sdk"                element={<SDKDocs />} />
          <Route path="sdk/*"              element={<SDKDocs />} />
          <Route path="streampay"          element={<StreamPayDocs />} />
          <Route path="streampay/*"        element={<StreamPayDocs />} />
          <Route path="security"           element={<SecurityDocs />} />
          <Route path="wallets"            element={<WalletsDocs />} />
          <Route path="environment"        element={<EnvironmentDocs />} />
          <Route path="terms"              element={<TermsDocs />} />
          <Route path="privacy"            element={<PrivacyDocs />} />
        </Route>
        {!IS_APP_HOST && <Route index element={<FoundationPage />} />}
        {appShellRoutes}
      </Routes>
    </BrowserRouter>
    </SolanaProvider>
  )
}

function ShortPayRedirect() {
  const { network = 'base', amount = '', recipient = '', memo = '' } = useParams()
  const params = new URLSearchParams()
  if (amount && amount !== '-') {
    params.set('a', amount)
  } else {
    params.set('f', '1')
  }
  params.set('src', 't')
  params.set('n', network)
  if (recipient.startsWith('0x')) {
    params.set('e', recipient)
  } else {
    params.set('s', recipient)
  }
  if (memo && memo !== '-') params.set('m', memo)
  const sourceParams = new URLSearchParams(window.location.search)
  for (const key of ['v', 'id']) {
    const value = sourceParams.get(key)
    if (value) params.set(key, value)
  }
  return <Navigate to={`/pay?${params.toString()}`} replace />
}
