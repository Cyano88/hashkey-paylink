import type {PocketCheckoutRoute} from '../../lib/pocketCheckoutRouting'
export function fundingRouteNeedsReview(reviewed:PocketCheckoutRoute|null,fresh:PocketCheckoutRoute){
 if(fresh.kind!=='bridge')return false
 return reviewed?.kind!=='bridge'||reviewed.source!==fresh.source||reviewed.destination!==fresh.destination||reviewed.amountUnits!==fresh.amountUnits||fresh.totalSourceUnits>reviewed.totalSourceUnits
}
