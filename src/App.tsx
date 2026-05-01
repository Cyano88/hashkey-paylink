import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './Layout'
import CreateLink from './pages/CreateLink'
import PaymentPage from './pages/PaymentPage'
import Dashboard from './pages/Dashboard'
import EventDashboard from './pages/EventDashboard'
import { SolanaProvider } from './lib/SolanaContext'
import StreamPayApp from '../modules/streampay/src/StreamPayApp'

// ── Hostname-based app routing ────────────────────────────────────────────────
// The same Render service hosts both apps. The active hostname determines
// which React app is mounted. Add ?app=streampay to any localhost URL for
// local Streampay development without changing DNS.
const { hostname, search } = window.location
const IS_STREAMPAY =
  hostname === 'streampay.xyz'                           ||  // production domain
  hostname.endsWith('.streampay.xyz')                    ||  // subdomains
  hostname.includes('streampay')                         ||  // onrender.com service named streampay-*
  new URLSearchParams(search).get('app') === 'streampay'    // localhost dev toggle

export default function App() {
  // Streampay domain → mount the Streampay sub-app (full separate router)
  if (IS_STREAMPAY) return <StreamPayApp />

  // Default → Hash PayLink
  return (
    <SolanaProvider>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<CreateLink />} />
          <Route path="pay" element={<PaymentPage />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="event" element={<EventDashboard />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
    </SolanaProvider>
  )
}
