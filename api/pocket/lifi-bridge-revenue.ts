import {evmBridgeRevenue} from './bridge-revenue-config.js'
/** Explicit rollout switch; no effect on Circle, Relay or gas reimbursement. */
export function lifiBridgeRevenue(amountUnits:bigint){
 if(process.env.POCKET_BRIDGE_REVENUE_LIFI_ENABLED!=='true')return undefined
 if(!process.env.LIFI_API_KEY?.trim())throw Error('LI.FI bridge revenue requires the configured integration key.')
 return evmBridgeRevenue(amountUnits)
}
export function lifiRevenueFraction(bps:number){return (bps/10000).toFixed(4)}
