import {readDurableJson} from '../render-durable-store.js'
import {crossBridgeJournalKey} from './cross-bridge-reservation.js'
import type {CrossBridgeJournal} from './cross-bridge-reservation-guard.js'
import {openCrossBridgeReview} from './cross-bridge-review.js'
import {readCrossBridgePrivySource} from './cross-bridge-privy-source.js'
import {readCrossBridgePrices} from './cross-bridge-prices.js'
import type {BscCollectedCoverage} from './bsc-collected-coverage.js'
import type {Hex} from 'viem'
/** Supplement the existing combined invoice with verified new-route fees.
 * Pending or unverifiable effects block new sponsorship; recovery stays open. */
const defaults={read:()=>readDurableJson<CrossBridgeJournal>(crossBridgeJournalKey()),now:Date.now,open:openCrossBridgeReview,source:readCrossBridgePrivySource,prices:readCrossBridgePrices}
const unresolved=():never=>{throw Object.assign(Error('Your previous bridge is still being confirmed. Check Activity.'),{status:409,code:'previous_bridge_pending'})}
function coverageRecords(journal:CrossBridgeJournal|undefined,now:number,wallet?:string){
 return Object.values(journal?.crossBridge??{}).filter(r=>['bsc','xlayer'].includes(r.source)&&Number(r.createdAt)>=now-28*86400000&&(!wallet||r.walletAddress.toLowerCase()===wallet.toLowerCase())&&!['prepared','cancelled','not_submitted'].includes(r.state))
}
/** Cheap early check before requesting a new paid route. Execution still runs
 * the full billing/proof guard; this read never authorizes a transaction. */
export async function assertCrossBridgeCoverageReady(wallet:string,overrides:Partial<Pick<typeof defaults,'read'|'now'>>={},manualException?:string){
 const d={...defaults,...overrides}
 for(const r of coverageRecords(await d.read(),d.now(),wallet)){
  if(manualException&&r.id===manualException)continue
  if(!r.sourceHash||!['submitted','source_confirmed','completed','refunded','source_failed'].includes(r.state))unresolved()
 }
}
export async function crossBridgeCollectedCoverage(wallet?:string,overrides:Partial<typeof defaults>={},manualException?:string):Promise<BscCollectedCoverage[]>{
 const d={...defaults,...overrides},journal=await d.read(),now=d.now()
 const records=coverageRecords(journal,now,wallet)
 const output:BscCollectedCoverage[]=[]
 for(const r of records){
  if(manualException&&r.id===manualException)continue
  if(typeof r.quoteToken!=='string'||!r.sourceHash||!['submitted','source_confirmed','completed','refunded','source_failed'].includes(r.state))return unresolved()
  const review=await d.open(r.quoteToken,r.ownerId,{recovery:true}),state=await d.source(review,r.sourceHash as Hex,r.userOperationHash as Hex|undefined)
  let coverageUsdMicros=0n
  if(state==='confirmed'){const prices=await d.prices(review.quote.input.source,review.quote.input.from);coverageUsdMicros=BigInt(review.quote.reimbursementUnits)*prices.assetPrice.scaled8*95n/(10n**BigInt(review.route.tokenIn.decimals)*10000n)}
  output.push({walletId:review.quote.wallets.source.walletId,at:Number(r.createdAt),hash:r.sourceHash,coverageUsdMicros})
 }
 return output
}
