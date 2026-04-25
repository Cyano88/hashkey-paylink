import { BrowserRouter, Navigate, Route, Routes, useParams, useSearchParams } from 'react-router-dom'
import { StreamPayLayout } from './components/StreamPayLayout'
import { StreamView }      from './components/StreamView'

// ── Page wrapper — resolves vault from path param OR query string ─────────────
//
// Supported URL patterns:
//   /                          → demo mode (no real vault)
//   /stream                    → demo mode
//   /stream/0x1234...          → specific vault from path
//   /stream?vault=0x1234...    → specific vault from query (for deep links)
//
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
          {/* Root → demo stream */}
          <Route index element={<StreamPage />} />
          {/* Stream routes */}
          <Route path="stream"                  element={<StreamPage />} />
          <Route path="stream/:vaultAddress"    element={<StreamPage />} />
          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
