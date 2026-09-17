import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import DocsLayout       from '../pages/docs/DocsLayout'
import DocsHome         from '../pages/docs/DocsHome'
import GettingStarted   from '../pages/docs/GettingStarted'
import PaymentLinks     from '../pages/docs/PaymentLinks'
import Chains           from '../pages/docs/Chains'
import ZeroGStorage     from '../pages/docs/ZeroGStorage'
import AccessMode       from '../pages/docs/AccessMode'
import ApiReference     from '../pages/docs/ApiReference'
import SDKDocs          from '../pages/docs/SDKDocs'
import SecurityDocs     from '../pages/docs/SecurityDocs'
import WalletsDocs      from '../pages/docs/WalletsDocs'
import EnvironmentDocs  from '../pages/docs/EnvironmentDocs'
import TermsDocs        from '../pages/docs/TermsDocs'
import PrivacyDocs      from '../pages/docs/PrivacyDocs'
import AccountDeletionDocs from '../pages/docs/AccountDeletionDocs'

export default function DocsApp() {
  return <BrowserRouter><Routes>
    <Route index element={<Navigate to="/docs" replace />} />
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
          <Route path="streampay"          element={<StandaloneHashPayStreamRedirect />} />
          <Route path="streampay/*"        element={<StandaloneHashPayStreamRedirect />} />
          <Route path="security"           element={<SecurityDocs />} />
          <Route path="wallets"            element={<WalletsDocs />} />
          <Route path="environment"        element={<EnvironmentDocs />} />
          <Route path="terms"              element={<TermsDocs />} />
          <Route path="privacy"            element={<PrivacyDocs />} />
          <Route path="account-deletion"   element={<AccountDeletionDocs />} />
        </Route>

    <Route path="*" element={<Navigate to="/docs" replace />} />
  </Routes></BrowserRouter>
}

function StandaloneHashPayStreamRedirect() {
  useEffect(() => {
    window.location.replace('https://hashpaystream.app/docs')
  }, [])
  return <main className="grid min-h-screen place-items-center bg-white text-sm font-semibold text-gray-500 dark:bg-gray-950 dark:text-gray-400">Opening HashPayStream...</main>
}
