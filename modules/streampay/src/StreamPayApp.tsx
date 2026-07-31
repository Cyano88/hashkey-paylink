import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { StreamPayLayout } from './components/StreamPayLayout'
import { CreatorAdminPage, CreatorPage } from './components/creator/CreatorPage'
import { StreamGate } from './components/creator/StreamGate'
import AgreementDashboard from './components/agreements/AgreementDashboard'
import X402Receipt from '../../../src/pages/X402Receipt'

export default function StreamPayApp() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<StreamPayLayout />}>
          {/* Arc Agreements is the standalone product. Legacy creator routes remain compatibility-only. */}
          <Route index element={<AgreementDashboard />} />
          <Route path="agreements" element={<AgreementDashboard />} />
          <Route path="stream" element={<Navigate to="/creator" replace />} />
          <Route path="stream/:vaultAddress" element={<Navigate to="/creator" replace />} />
          <Route path="agentic" element={<Navigate to="/creator" replace />} />
          <Route path="arena" element={<Navigate to="/creator" replace />} />
          <Route path="recipient" element={<Navigate to="/creator" replace />} />
          <Route path="creator" element={<CreatorPage />} />
          <Route path="creator-admin" element={<CreatorAdminPage />} />
          <Route path="gate" element={<StreamGate />} />
          <Route path="receipt/:activityId" element={<X402Receipt />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
