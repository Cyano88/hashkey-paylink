import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { isPocketNativeRuntime } from './lib/pocketRoutes'
import Layout from '../Layout'
import { SolanaProvider } from '../lib/SolanaContext'
import CirclePocketApp from './CirclePocketApp'
import PocketNativeBridge from './components/PocketNativeBridge'

const PocketGiftSendPage = lazy(() => import('./pages/PocketGiftSendPage'))
const PocketGiftClaimEntryPage = lazy(() => import('./pages/PocketGiftClaimEntryPage'))
const PocketGiftPage = lazy(() => import('./pages/PocketGiftPage'))
const UnifiedXPayCheckout = lazy(() => import('./pages/PocketUnifiedXPayPage'))
const XPayCheckout = lazy(() => import('./pages/PocketXPayCheckoutPage'))
const PocketReceiptPage = lazy(() => import('../pages/X402Receipt'))
const PocketLegalDocumentPage = lazy(() => import('./pages/PocketLegalDocumentPage'))

export default function PocketHostApp() {
  return (
    <SolanaProvider>
      <BrowserRouter>
        <PocketNativeBridge />
        <Routes>
          <Route path="gifts/send" element={<Suspense fallback={null}><PocketGiftSendPage/></Suspense>}/>
          <Route path="gifts/claim" element={<Suspense fallback={null}><PocketGiftClaimEntryPage/></Suspense>}/>
          <Route path="gift/:giftId" element={<Suspense fallback={<div role="status" aria-label="Loading gift" className="mx-auto mt-16 h-64 max-w-sm animate-pulse rounded-3xl bg-gray-100 dark:bg-[#171717]"/>}><PocketGiftPage/></Suspense>} />
          {!isPocketNativeRuntime() && <Route path="xpay/checkout/:checkoutId" element={<Suspense fallback={null}><UnifiedXPayCheckout publicCheckout /></Suspense>} />}
          {!isPocketNativeRuntime() && <Route path="xpay/:merchantId" element={<Suspense fallback={null}><XPayCheckout /></Suspense>} />}
          <Route path="docs/terms" element={<Suspense fallback={null}><PocketLegalDocumentPage document="terms" /></Suspense>} />
          <Route path="docs/privacy" element={<Suspense fallback={null}><PocketLegalDocumentPage document="privacy" /></Suspense>} />
          <Route path="docs/account-deletion" element={<Suspense fallback={null}><PocketLegalDocumentPage document="account-deletion" /></Suspense>} />
          <Route element={<Layout />}>
            <Route path="receipt/:activityId" element={<Suspense fallback={null}><PocketReceiptPage /></Suspense>} />
            <Route path="*" element={<CirclePocketApp />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </SolanaProvider>
  )
}
