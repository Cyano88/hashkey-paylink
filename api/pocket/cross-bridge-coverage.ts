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
export async function crossBridgeCollectedCoverage(wallet?:string):Promise<BscCollectedCoverage[]>{
 const journal=await readDurableJson<CrossBridgeJournal>(crossBridgeJournalKey()),now=Date.now()
 const records=Object.values(journal?.crossBridge??{}).filter(r=>['bsc','xlayer'].includes(r.source)&&Number(r.createdAt)>=now-28*86400000&&(!wallet||r.walletAddress.toLowerCase()===wallet.toLowerCase())&&!['prepared','cancelled','not_submitted'].includes(r.state))
 const output:BscCollectedCoverage[]=[]
 for(const r of records){
  if(typeof r.quoteToken!=='string'||!r.sourceHash||!['submitted','source_confirmed','completed','refunded','source_failed'].includes(r.state))throw Error('Bridge fees are still being verified.')
  const review=await openCrossBridgeReview(r.quoteToken,r.ownerId,{recovery:true}),state=await readCrossBridgePrivySource(review,r.sourceHash as Hex,r.userOperationHash as Hex|undefined)
  let coverageUsdMicros=0n
  if(state==='confirmed'){const prices=await readCrossBridgePrices(review.quote.input.source,review.quote.input.from);coverageUsdMicros=BigInt(review.quote.reimbursementUnits)*prices.assetPrice.scaled8*95n/(10n**BigInt(review.route.tokenIn.decimals)*10000n)}
  output.push({walletId:review.quote.wallets.source.walletId,at:Number(r.createdAt),hash:r.sourceHash,coverageUsdMicros})
 }
 return output
}
