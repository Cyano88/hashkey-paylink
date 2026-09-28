import {POCKET_BASE_PATH,POCKET_ROUTES} from './pocketRoutes'
import {xStockPath} from './pocketRail'
export function xpayOrigin(state:unknown):'stablecoins'|'xstocks'{return (state as {xpayOrigin?:unknown}|null)?.xpayOrigin==='xstocks'?'xstocks':'stablecoins'}
export function xpayHome(state:unknown){return xpayOrigin(state)==='xstocks'?xStockPath('home'):POCKET_BASE_PATH+POCKET_ROUTES.home}
export function xpayReturnPath(state:unknown,fallback:string){
 const path=(state as {xpayReturnTo?:unknown}|null)?.xpayReturnTo
 const allowed=[POCKET_BASE_PATH+POCKET_ROUTES.xpay,POCKET_BASE_PATH+POCKET_ROUTES.home,...['activity','bankActivity','posActivity','billsActivity','purchasesActivity','collectionsActivity'].map(key=>POCKET_BASE_PATH+POCKET_ROUTES[key as keyof typeof POCKET_ROUTES]),xStockPath('home'),xStockPath('activity')]
 return typeof path==='string'&&(allowed.includes(path)||/^\/xpay\/checkout\/xp_[0-9a-f-]{36}$/.test(path))?path:fallback
}
