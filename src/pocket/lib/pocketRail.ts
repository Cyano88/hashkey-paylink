import { POCKET_BASE_PATH } from './pocketRoutes'
export type PocketRail = 'stablecoins' | 'xstocks'
export const XSTOCK_VIEWS = ['home', 'market', 'activity', 'portfolio', 'account', 'send', 'receive', 'trade', 'request', 'xpay', 'notifications', 'verify-name'] as const
export type XStockView = typeof XSTOCK_VIEWS[number]
export const xStockPath = (view: XStockView) => `${POCKET_BASE_PATH}/xstocks/${view}`
export const isXStocksPath = (pathname: string) => pathname.startsWith(`${POCKET_BASE_PATH}/xstocks/`)
export const xStockNavPath = (tab: string) => xStockPath(tab === 'bills' ? 'market' : tab === 'profile' ? 'portfolio' : tab === 'activity' ? 'activity' : 'home')
