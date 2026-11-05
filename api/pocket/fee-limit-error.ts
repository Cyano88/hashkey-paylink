/** A policy ceiling is not a missing balance, route, price or RPC failure. */
export function pocketFeeLimitError(network:string,feeUnits:bigint,maximumUnits:bigint){
 return Object.assign(Error('Network fees are high. Try this route again shortly.'),{status:409,code:'pocket_fee_limit',feeCheck:{reason:'fee_limit',network,feeUnits:String(feeUnits),maximumUnits:String(maximumUnits)}})
}
