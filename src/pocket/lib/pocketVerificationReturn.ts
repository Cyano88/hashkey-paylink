import { POCKET_BASE_PATH, POCKET_ROUTES } from './pocketRoutes'
import { xStockPath } from './pocketRail'

// Only app-owned entry points may supply a verification return destination.
export function pocketVerificationReturn(state: unknown, stocks: boolean) {
  const candidate = (state as { bankVerificationFrom?: unknown } | null)?.bankVerificationFrom
  const allowed = [POCKET_ROUTES.bank, POCKET_ROUTES.pos, POCKET_ROUTES.profile].map(path => POCKET_BASE_PATH + path)
  allowed.push(xStockPath('account'))
  if (typeof candidate === 'string' && allowed.includes(candidate.split('?')[0]) && !candidate.includes('#')) return candidate
  return stocks ? xStockPath('account') : POCKET_BASE_PATH + POCKET_ROUTES.profile
}
