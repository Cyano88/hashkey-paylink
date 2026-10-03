import {parseUnits} from 'viem'
import type {PocketBridgeQuote} from '../api/pocketBridgeClient'
/** Never execute a worse or different route than the quote the user reviewed. */
export function bridgeQuoteNeedsReview(reviewed:PocketBridgeQuote,fresh:PocketBridgeQuote){
 try{return reviewed.source!==fresh.source||reviewed.destination!==fresh.destination||reviewed.destinationAddress!==fresh.destinationAddress||parseUnits(reviewed.amount,6)!==parseUnits(fresh.amount,6)||parseUnits(fresh.total,6)>parseUnits(reviewed.total,6)||parseUnits(fresh.receive,6)<parseUnits(reviewed.receive,6)}catch{return true}
}
