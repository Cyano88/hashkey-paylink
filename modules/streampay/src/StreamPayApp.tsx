import { BrowserRouter, Navigate, Route, Routes, useParams, useSearchParams } from 'react-router-dom'
import { StreamPayLayout } from './components/StreamPayLayout'
import { StreamView }      from './components/StreamView'
import { CreatorPage }     from './components/creator/CreatorPage'
import { StreamGate }      from './components/creator/StreamGate'

// ── Payroll page — resolves vault from path param OR query string ─────────────
function StreamPage() {
  const { vaultAddress } = useParams<{ vaultAddress?: string }>()
  const [params]         = useSearchParams()
  const vault = (vaultAddress ?? params.get('vault') ?? undefined) as `0x${string}` | undefined
  return <StreamView vaultAddress={vault} />
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function StreamPayApp() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<StreamPayLayout />}>
          {/* Payroll / Time-Sovereign flows */}
          <Route index                           element={<StreamPage />} />
          <Route path="stream"                   element={<StreamPage />} />
          <Route path="stream/:vaultAddress"     element={<StreamPage />} />
          {/* Creator / Event-Sovereign flows */}
          <Route path="creator"                  element={<CreatorPage />} />
          <Route path="gate"                     element={<StreamGate />} />
          {/* Fallback */}
          <Route path="*"                        element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
