import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import DeveloperLayout from './DeveloperLayout'
import ExternalRedirect from './ExternalRedirect'
const DeveloperPortalPage = lazy(() => import('../pages/DeveloperPortalPage'))
const DeveloperOperationsPage = lazy(() => import('../pages/DeveloperOperationsPage'))

const DeveloperCliAccessPage = lazy(() => import('../pages/DeveloperCliAccessPage'))

export default function DeveloperApp() {
  return <BrowserRouter><Suspense fallback={<p className="p-6 text-sm">Opening developer portal…</p>}><Routes>
    <Route path="docs/*" element={<ExternalRedirect origin="https://docs.hashpaylink.com" />} />
    <Route element={<DeveloperLayout />}>
      <Route index element={<DeveloperPortalPage />} />
      <Route path="cli/authorize" element={<DeveloperCliAccessPage />} />
      <Route path="developers" element={<DeveloperPortalPage />} />
      <Route path="admin" element={<Navigate to="/admin/developers" replace />} />
      <Route path="admin/developers" element={<DeveloperOperationsPage surface="projects" />} />
      <Route path="admin/agreements" element={<DeveloperOperationsPage surface="agreements" />} />
      <Route path="admin/transactions" element={<DeveloperOperationsPage surface="transactions" />} />
      <Route path="admin/support" element={<DeveloperOperationsPage surface="support" />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </Routes></Suspense></BrowserRouter>
}
