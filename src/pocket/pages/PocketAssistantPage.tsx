import { useCallback } from 'react'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import usePocketIdentity from '../hooks/usePocketIdentity'
import PocketSupportView from '../components/PocketSupportView'
import { xStockPath } from '../lib/pocketRail'
import { POCKET_BASE_PATH, POCKET_ROUTES } from '../lib/pocketRoutes'

export default function PocketAssistantPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const requestedReturn = location.state?.supportReturnPath
  const returnPath = [POCKET_BASE_PATH + POCKET_ROUTES.profile, xStockPath('portfolio')].includes(requestedReturn) ? requestedReturn : POCKET_BASE_PATH + POCKET_ROUTES.profile
  const [params] = useSearchParams()
  const { getAccessToken } = usePocketIdentity()
  const call = useCallback(async (body: Record<string, unknown>) => {
    const token = await getAccessToken()
    if (!token) throw new Error('Sign in again to contact Support.')
    const response = await fetch('/api/pocket/support/cases', {method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)})
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Support is reconnecting. Your saved messages are safe; try again shortly.')
    const data = await response.json()
    if (!response.ok || !data.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Support could not load. Please try again.')
    return data
  }, [getAccessToken])
  return <PocketSupportView call={call} initialCaseId={params.get('case') || ''} onClose={() => navigate(returnPath, {replace:true})} />
}
