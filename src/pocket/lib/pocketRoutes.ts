export const POCKET_MOVE_VIEWS = ['usdc', 'bank', 'pos'] as const
export type PocketMoveView = typeof POCKET_MOVE_VIEWS[number]

export const POCKET_BILL_VIEWS = ['airtime', 'data', 'tv', 'electricity'] as const
export type PocketBillView = typeof POCKET_BILL_VIEWS[number]

export const POCKET_ACTIVITY_VIEWS = ['all', 'purchases', 'bank', 'pos', 'collections'] as const
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
  | { section: 'home'; view: 'overview' | 'deposit' | 'swap' }
  | { section: 'profile'; view: 'details' | 'verify-name' }
  | { section: 'notifications'; view: 'inbox' }
  | { section: 'move'; view: PocketMoveView }
  | { section: 'bills'; view: PocketBillView }
  | { section: 'activity'; view: PocketActivityView }
  | { section: 'assistant'; view: 'circle-pocket' }

export const POCKET_ROUTES = {
  root: '/',
  home: '/home',
  deposit: '/home/deposit',
  swap: '/home/swap',
  profile: '/profile',
  verifyName: '/profile/verify-name',
  notifications: '/notifications',
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
  purchasesActivity: '/activity/purchases',
  collectionsActivity: '/activity/collections',
  assistant: '/assistant',
} as const

function cleanPathname(pathname: string) {
  const rawPath = pathname.split(/[?#]/, 1)[0] || '/'
  const withLeadingSlash = rawPath.startsWith('/') ? rawPath : `/${rawPath}`
  return withLeadingSlash.length > 1 ? withLeadingSlash.replace(/\/+$/, '') : '/'
}

export function resolvePocketRoute(pathname: string): PocketRouteState | null {
  const path = cleanPathname(pathname)
  if (path === POCKET_ROUTES.home) return { section: 'home', view: 'overview' }
  if (path === POCKET_ROUTES.deposit) return { section: 'home', view: 'deposit' }
  if (path === POCKET_ROUTES.swap) return { section: 'home', view: 'swap' }
  if (path === POCKET_ROUTES.profile) return { section: 'profile', view: 'details' }
  if (path === POCKET_ROUTES.verifyName) return { section: 'profile', view: 'verify-name' }
  if (path === POCKET_ROUTES.notifications) return { section: 'notifications', view: 'inbox' }
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
  if (path === POCKET_ROUTES.billsActivity || path === POCKET_ROUTES.purchasesActivity) return { section: 'activity', view: 'purchases' }
  if (path === POCKET_ROUTES.collectionsActivity) return { section: 'activity', view: 'collections' }
  if (path === POCKET_ROUTES.assistant) return { section: 'assistant', view: 'circle-pocket' }
  return null
}

export function pocketPathFor(state: PocketRouteState) {
  if (state.section === 'home') return state.view === 'deposit' ? POCKET_ROUTES.deposit : state.view === 'swap' ? POCKET_ROUTES.swap : POCKET_ROUTES.home
  if (state.section === 'profile') return state.view === 'verify-name' ? POCKET_ROUTES.verifyName : POCKET_ROUTES.profile
  if (state.section === 'notifications') return POCKET_ROUTES.notifications
  if (state.section === 'move') return POCKET_ROUTES[state.view]
  if (state.section === 'bills') return POCKET_ROUTES[state.view]
  if (state.section === 'assistant') return POCKET_ROUTES.assistant
  if (state.view === 'all') return POCKET_ROUTES.activity
  return state.view === 'bank'
    ? POCKET_ROUTES.bankActivity
    : state.view === 'pos'
      ? POCKET_ROUTES.posActivity
      : state.view === 'purchases'
        ? POCKET_ROUTES.purchasesActivity
        : POCKET_ROUTES.collectionsActivity
}

export function pocketUrl(path: string) {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${POCKET_ORIGIN}${normalized}`
}

export function pocketLegacyEntryUrl(state: PocketRouteState) {
  const params = new URLSearchParams({ product: 'circle-pocket' })
  if (state.section === 'home') params.set('pocket', 'home')
  if (state.section === 'profile') params.set('pocket', 'profile')
  if (state.section === 'notifications') params.set('pocket', 'notifications')
  if (state.section === 'move') params.set('pocket', `move:${state.view}`)
  if (state.section === 'bills') params.set('pocket', `bills:${state.view}`)
  if (state.section === 'activity') params.set('pocket', `activity:${state.view}`)
  if (state.section === 'assistant') params.set('agent', 'hash')
  return `/?${params.toString()}`
}
