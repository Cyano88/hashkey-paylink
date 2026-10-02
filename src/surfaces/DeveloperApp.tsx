import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import DeveloperLayout from './DeveloperLayout'
import ExternalRedirect from './ExternalRedirect'
const DeveloperPortalPage = lazy(() => import('../pages/DeveloperPortalPage'))
const OperationsWorkspacePage = lazy(() => import('../pages/OperationsWorkspacePage'))

const DeveloperCliAccessPage = lazy(() => import('../pages/DeveloperCliAccessPage'))

export default function DeveloperApp() {
  return <BrowserRouter><Suspense fallback={<p className="p-6 text-sm">Opening developer portal…</p>}><Routes>
    <Route path="docs/*" element={<ExternalRedirect origin="https://docs.hashpaylink.com" />} />
    <Route element={<DeveloperLayout />}>
      <Route index element={<DeveloperPortalPage />} />
      <Route path="cli/authorize" element={<DeveloperCliAccessPage />} />
      <Route path="developers" element={<DeveloperPortalPage />} />
      <Route path="admin" element={<OperationsWorkspacePage />} />
      <Route path="admin/workspaces/:workspaceId" element={<OperationsWorkspacePage />} />
      <Route path="admin/workspaces/:workspaceId/:section" element={<OperationsWorkspacePage />} />
      <Route path="admin/transactions" element={<Navigate to="/admin/workspaces/pocket/transactions" replace />} />
      <Route path="admin/support" element={<Navigate to="/admin/workspaces/pocket/support" replace />} />
      <Route path="admin/*" element={<Navigate to="/admin" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </Routes></Suspense></BrowserRouter>
}
