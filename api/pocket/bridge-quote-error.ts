type Route={sourceChainId:number;destinationChainId:number;sourceToken:string;destinationToken:string;bridge:string}
/** Classify only the requested direct route, never unrelated conversion alternatives. */
export function lifiBridgeQuoteError(status:number,body:any,route:Route):never {
 const same=(a:unknown,b:string)=>typeof a==='string'&&a.toLowerCase()===b.toLowerCase()
 const failures=Array.isArray(body?.errors?.failed)?body.errors.failed:[]
 const direct=failures.flatMap((f:any)=>Object.values(f?.subpaths||{}).flat()).filter((f:any)=>{
  const a=f?.action
  return f?.tool===route.bridge&&a?.fromChainId===route.sourceChainId&&a?.toChainId===route.destinationChainId&&same(a.fromToken?.address,route.sourceToken)&&same(a.toToken?.address,route.destinationToken)
 }) as any[]
 if(direct.some(f=>f.code==='FEES_HIGHER_THAN_AMOUNT'))throw Object.assign(Error('This amount is too small to cover the bridge fees. Enter a larger amount.'),{status:422})
 if(status===404&&body?.code===1002)throw Object.assign(Error('No bridge is available for this amount and network pair. Choose another amount or network.'),{status:422})
 if(status===429)throw Object.assign(Error('Bridge service is busy. Please try again shortly.'),{status:429})
 throw Object.assign(Error('Bridge service is temporarily unavailable. Please try again.'),{status:503})
}
