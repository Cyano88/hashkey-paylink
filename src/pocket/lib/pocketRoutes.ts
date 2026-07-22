export const POCKET_HOME_VIEWS = ['smart-wallet', 'x402'] as const
export type PocketHomeView = typeof POCKET_HOME_VIEWS[number]

export const POCKET_MOVE_VIEWS = ['usdc', 'bank', 'pos'] as const
export type PocketMoveView = typeof POCKET_MOVE_VIEWS[number]

export const POCKET_BILL_VIEWS = ['airtime', 'data', 'tv', 'electricity'] as const
export type PocketBillView = typeof POCKET_BILL_VIEWS[number]

export const POCKET_ACTIVITY_VIEWS = ['all', 'bank', 'pos', 'bills', 'app-pay'] as const
export type PocketActivityView = typeof POCKET_ACTIVITY_VIEWS[number]

export const POCKET_HOSTNAME = 'pocket.hashpaylink.com'
export const POCKET_ORIGIN = `https://${POCKET_HOSTNAME}`
export const HASH_PAYLINK_APP_ORIGIN = 'https://app.hashpaylink.com'

export function isPocketHostname(hostname = typeof window === 'undefined' ? '' : window.location.hostname) {
  return hostname.toLowerCase() === POCKET_HOSTNAME
}

export function pocketBasePathForHostname(hostname: string) {
  return isPocketHostname(hostname) ? '' : '/pocket'
}

export function hashPayLinkAppOriginForOrigin(origin: string) {
  const url = new URL(origin)
  return isPocketHostname(url.hostname) ? HASH_PAYLINK_APP_ORIGIN : url.origin
}

// Pocket owns root-level routes on its production hostname. The legacy
// /pocket prefix remains available on localhost so the full monolith can still
// be tested without custom DNS.
export const POCKET_BASE_PATH = pocketBasePathForHostname(typeof window === 'undefined' ? '' : window.location.hostname)

export type PocketRouteState =
  | { section: 'home'; view: PocketHomeView }
  | { section: 'move'; view: PocketMoveView }
  | { section: 'bills'; view: PocketBillView }
  | { section: 'activity'; view: PocketActivityView }
  | { section: 'assistant'; view: 'circle-pocket' }

export const POCKET_ROUTES = {
  root: '/',
  smartWallet: '/home/smart-wallet',
  x402: '/home/x402',
  usdc: '/move/usdc',
  bank: '/move/bank',
  pos: '/move/pos',
  airtime: '/bills/airtime',
  data: '/bills/data',
  tv: '/bills/tv',
  electricity: '/bills/electricity',
  activity: '/activity',
  bankActivity: '/activity/bank',
  posActivity: '/activity/pos',
  billsActivity: '/activity/bills',
  appPayActivity: '/activity/app-pay',
  assistant: '/assistant',
} as const

function cleanPathname(pathname: string) {
  const rawPath = pathname.split(/[?#]/, 1)[0] || '/'
  const withLeadingSlash = rawPath.startsWith('/') ? rawPath : `/${rawPath}`
  return withLeadingSlash.length > 1 ? withLeadingSlash.replace(/\/+$/, '') : '/'
}

export function resolvePocketRoute(pathname: string): PocketRouteState | null {
  const path = cleanPathname(pathname)
  if (path === '/' || path === POCKET_ROUTES.smartWallet) return { section: 'home', view: 'smart-wallet' }
  if (path === POCKET_ROUTES.x402) return { section: 'home', view: 'x402' }
  if (path === POCKET_ROUTES.usdc) return { section: 'move', view: 'usdc' }
  if (path === POCKET_ROUTES.bank) return { section: 'move', view: 'bank' }
  if (path === POCKET_ROUTES.pos) return { section: 'move', view: 'pos' }
  if (path === POCKET_ROUTES.airtime) return { section: 'bills', view: 'airtime' }
  if (path === POCKET_ROUTES.data) return { section: 'bills', view: 'data' }
  if (path === POCKET_ROUTES.tv) return { section: 'bills', view: 'tv' }
  if (path === POCKET_ROUTES.electricity) return { section: 'bills', view: 'electricity' }
  if (path === POCKET_ROUTES.activity) return { section: 'activity', view: 'all' }
  if (path === POCKET_ROUTES.bankActivity) return { section: 'activity', view: 'bank' }
  if (path === POCKET_ROUTES.posActivity) return { section: 'activity', view: 'pos' }
  if (path === POCKET_ROUTES.billsActivity) return { section: 'activity', view: 'bills' }
  if (path === POCKET_ROUTES.appPayActivity) return { section: 'activity', view: 'app-pay' }
  if (path === POCKET_ROUTES.assistant) return { section: 'assistant', view: 'circle-pocket' }
  return null
}

export function pocketPathFor(state: PocketRouteState) {
  if (state.section === 'home') return state.view === 'x402' ? POCKET_ROUTES.x402 : POCKET_ROUTES.smartWallet
  if (state.section === 'move') return POCKET_ROUTES[state.view]
  if (state.section === 'bills') return POCKET_ROUTES[state.view]
  if (state.section === 'assistant') return POCKET_ROUTES.assistant
  if (state.view === 'all') return POCKET_ROUTES.activity
  return state.view === 'bank'
    ? POCKET_ROUTES.bankActivity
    : state.view === 'pos'
      ? POCKET_ROUTES.posActivity
      : state.view === 'bills'
        ? POCKET_ROUTES.billsActivity
        : POCKET_ROUTES.appPayActivity
}

export function pocketUrl(path: string) {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${POCKET_ORIGIN}${normalized}`
}

export function pocketLegacyEntryUrl(state: PocketRouteState) {
  const params = new URLSearchParams({ product: 'circle-pocket' })
  if (state.section === 'home') params.set('pocket', state.view === 'smart-wallet' ? 'smart' : 'x402')
  if (state.section === 'move') params.set('pocket', `move:${state.view}`)
  if (state.section === 'bills') params.set('pocket', `bills:${state.view}`)
  if (state.section === 'activity') params.set('pocket', `activity:${state.view}`)
  if (state.section === 'assistant') params.set('agent', 'hash')
  return `/?${params.toString()}`
}
