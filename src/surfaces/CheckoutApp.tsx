import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { SolanaProvider } from '../lib/SolanaContext'
import SurfaceLayout from './SurfaceLayout'
import ExternalRedirect from './ExternalRedirect'
const PublicPosCheckoutPage = lazy(() => import('../pages/PublicPosCheckoutPage'))
const XPayCheckout = lazy(() => import('../pocket/pages/PocketXPayCheckoutPage'))
const PaymentPage = lazy(() => import('../pages/PaymentPage'))
const HostedCheckoutEntry = lazy(() => import('../pages/HostedCheckoutEntry'))
const AgentCheckoutPage = lazy(() => import('../pages/AgentCheckoutPage'))
const WalletSwapPage = lazy(() => import('../pages/WalletSwapPage'))
const WalletConnectionPage = lazy(() => import('../pages/WalletConnectionPage'))
const XStocksAgreementPage = lazy(() => import('../pages/XStocksAgreementPage'))
const ArcAgreementPayerPage = lazy(() => import('../pages/ArcAgreementPayerPage'))
const X402Receipt = lazy(() => import('../pages/X402Receipt'))
const StreamPayApp = lazy(() => import('../../modules/streampay/src/StreamPayApp'))

function CheckoutHome() {
  return <section className="mx-auto max-w-md py-16 text-center">
    <h1 className="text-xl font-bold">Hash PayLink checkout</h1>
    <p className="mt-3 text-sm text-gray-500">Open your payment link to continue.</p>
  </section>
}
export default function CheckoutApp() {
  // Historical StreamPay links retain their original router and identifiers.
  const path = window.location.pathname
  if (path === '/stream' || path.startsWith('/stream/') || ['/recipient', '/creator', '/creator-admin', '/arena'].includes(path)) {
    return <Suspense fallback={null}><StreamPayApp /></Suspense>
  }
  return <SolanaProvider><BrowserRouter><Suspense fallback={<p className="p-6 text-sm">Opening checkout…</p>}><Routes>
    <Route path="pocket/*" element={<ExternalRedirect origin="https://pocket.hashpaylink.com" stripPrefix="/pocket" />} />
    <Route path="docs/*" element={<ExternalRedirect origin="https://docs.hashpaylink.com" />} />
    <Route path="developers" element={<ExternalRedirect origin="https://developer.hashpaylink.com" pathname="/" />} />
    <Route path="admin/*" element={<ExternalRedirect origin="https://developer.hashpaylink.com" />} />
    <Route element={<SurfaceLayout />}>
      <Route index element={<CheckoutHome />} />
      <Route path="pos/ng" element={<PublicPosCheckoutPage />} />
      <Route path="xpay/:merchantId" element={<XPayCheckout />} />
      <Route path="pay" element={<PaymentPage />} />
      <Route path="pay/c/:checkoutId" element={<HostedCheckoutEntry />} />
      <Route path="pay/a/:checkoutId" element={<AgentCheckoutPage />} />
      <Route path="wallet/swap/:sessionId" element={<WalletSwapPage />} />
      <Route path="wallet/connect/:connectionId" element={<WalletConnectionPage />} />
      <Route path="agreements/xstocks/:agreementId" element={<XStocksAgreementPage />} />
      <Route path="agreements/:agreementId" element={<ArcAgreementPayerPage />} />
      <Route path="receipt/:activityId" element={<X402Receipt />} />
      <Route path="p/:network/:amount/:recipient/:memo" element={<ShortPayRedirect />} />
      <Route path="*" element={<CheckoutHome />} />
    </Route>
  </Routes></Suspense></BrowserRouter></SolanaProvider>
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
