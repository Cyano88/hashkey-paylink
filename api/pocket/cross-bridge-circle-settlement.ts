import {createCrossBridgeJournalSettlement,type CrossBridgeJournalSettlementDependencies} from './cross-bridge-journal-settlement.js'
import {readCrossBridgeCircleSourceState} from './cross-bridge-circle-source.js'
import {appendPocketMoneyLedgerEvent} from './money-ledger.js'
import {CROSS_BRIDGE_RELAY_CHAINS} from './cross-bridge-chains.js'

/** Circle source adapter over the existing shared operation journal. Source
 * execution, Relay identity and finalized destination receipt are independent
 * gates. No wallet authorization is needed once the source hash is recorded. */
export function createCrossBridgeCircleSettlement(options:{env?:NodeJS.ProcessEnv;fetcher?:typeof fetch;overrides?:Partial<CrossBridgeJournalSettlementDependencies>}={}){
 const env=options.env??process.env,fetcher=options.fetcher??fetch
 return createCrossBridgeJournalSettlement({
  now:Date.now,
  source:(record,review)=>readCrossBridgeCircleSourceState(review,record.sourceHash),
  provider:async record=>{
   const q=record.plan.route,key=(env.RELAY_API_KEY||'').trim()
   if(q.provider==='lifi'){
    const params=new URLSearchParams({txHash:record.sourceHash,fromChain:String(CROSS_BRIDGE_RELAY_CHAINS[q.source].id),toChain:String(CROSS_BRIDGE_RELAY_CHAINS[q.destination].id),bridge:q.lifi.tool})
    const response=await fetcher('https://li.quest/v1/status?'+params,{headers:env.LIFI_API_KEY?{'x-lifi-api-key':env.LIFI_API_KEY}:{},redirect:'error',signal:AbortSignal.timeout(12000)})
    if(!response.ok)throw Error('Jumper delivery is still being verified.')
    return {status:await response.json(),requests:{}}
   }
   if(!key)throw Error('Bridge provider recovery is unavailable.')
   const get=async(path:string)=>{
    const response=await fetcher('https://api.relay.link'+path,{headers:{'x-api-key':key},redirect:'error',signal:AbortSignal.timeout(12000)})
    if(!response.ok)throw Error('Bridge delivery is still being verified.')
    return response.json()
   }
   const [status,requests]=await Promise.all([
    get('/intents/status/v3?requestId='+encodeURIComponent(q.requestId)),
    get('/requests/v3?'+new URLSearchParams({id:q.requestId,orderId:q.orderId,limit:'1'})),
   ])
   return {status,requests}
  },
  ledger:appendPocketMoneyLedgerEvent,
  ...options.overrides,
 })
}
