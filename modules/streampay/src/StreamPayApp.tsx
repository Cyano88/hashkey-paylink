import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { StreamPayLayout } from './components/StreamPayLayout'
import { CreatorAdminPage, CreatorPage } from './components/creator/CreatorPage'
import { StreamGate } from './components/creator/StreamGate'

export default function StreamPayApp() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<StreamPayLayout />}>
          {/* Public test scope: Creator checkout only. Payroll, Arena, and agentic service routes are disabled. */}
          <Route index element={<Navigate to="/creator" replace />} />
          <Route path="stream" element={<Navigate to="/creator" replace />} />
          <Route path="stream/:vaultAddress" element={<Navigate to="/creator" replace />} />
          <Route path="agentic" element={<Navigate to="/creator" replace />} />
          <Route path="arena" element={<Navigate to="/creator" replace />} />
          <Route path="recipient" element={<Navigate to="/creator" replace />} />
          <Route path="creator" element={<CreatorPage />} />
          <Route path="creator-admin" element={<CreatorAdminPage />} />
          <Route path="gate" element={<StreamGate />} />
          <Route path="*" element={<Navigate to="/creator" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
