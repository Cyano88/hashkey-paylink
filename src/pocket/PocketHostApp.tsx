import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Layout from '../Layout'
import { SolanaProvider } from '../lib/SolanaContext'
import CirclePocketApp from './CirclePocketApp'
import PocketNativeBridge from './components/PocketNativeBridge'

const PocketReceiptPage = lazy(() => import('../pages/X402Receipt'))

export default function PocketHostApp() {
  return (
    <SolanaProvider>
      <BrowserRouter>
        <PocketNativeBridge />
        <Routes>
          <Route element={<Layout />}>
            <Route path="receipt/:activityId" element={<Suspense fallback={null}><PocketReceiptPage /></Suspense>} />
            <Route path="*" element={<CirclePocketApp />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </SolanaProvider>
  )
}
