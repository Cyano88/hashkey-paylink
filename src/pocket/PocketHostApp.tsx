import PocketGiftRouteLoading from './features/gifts/PocketGiftRouteLoading'
import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { isPocketNativeRuntime } from './lib/pocketRoutes'
import Layout from '../Layout'
import { SolanaProvider } from '../lib/SolanaContext'
import CirclePocketApp from './CirclePocketApp'
import PocketNativeBridge from './components/PocketNativeBridge'

const PocketGiftSendPage = lazy(() => import('./pages/PocketGiftSendPage'))
const PocketGiftClaimEntryPage = lazy(() => import('./pages/PocketGiftClaimEntryPage'))
const PocketRequestLinkPage = lazy(() => import('./pages/PocketRequestLinkPage'))
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
          <Route path="gifts/send" element={<Suspense fallback={<PocketGiftRouteLoading kind="send"/>}><PocketGiftSendPage/></Suspense>}/>
          <Route path="gifts/claim" element={<Suspense fallback={<PocketGiftRouteLoading kind="claim"/>}><PocketGiftClaimEntryPage/></Suspense>}/>
          <Route path="request/:code" element={<Suspense fallback={<main aria-busy="true" aria-label="Opening payment request" className="mx-auto flex min-h-[100dvh] max-w-md flex-col bg-[#F5F5F7] px-6 pt-[calc(var(--pocket-safe-top)+1rem)] dark:bg-black"><h1 className="py-4 text-center text-base font-semibold">Payment request</h1><div className="flex flex-1 flex-col justify-center gap-4"><div className="pocket-shimmer mx-auto h-4 w-28 rounded bg-gray-200 dark:bg-white/10"/><div className="pocket-shimmer mx-auto h-10 w-44 rounded bg-gray-200 dark:bg-white/10"/></div></main>}><PocketRequestLinkPage/></Suspense>}/>
          <Route path="gift/:giftId" element={<Suspense fallback={<PocketGiftRouteLoading kind="preview"/>}><PocketGiftPage/></Suspense>} />
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
