import {crossBridgeSelectionKey} from './pocketCrossBridgeSelection'
/** One dispatch decision for background checks, explicit retry and cancellation.
 * Unmounted/new routes must never fall through to a legacy payment endpoint. */
export function pocketBridgeRecoveryRoute(q:any):{kind:'api';path:string}|{kind:'sponsored'} {
 if(q?.rail==='cross'){
  const key=crossBridgeSelectionKey({source:q.source,destination:q.destination,from:q.asset,to:q.destinationAsset})
  if(q.selectionKey!==key||q.execution!==(['bsc','xlayer'].includes(q.source)?'privy':'circle'))throw Error('Bridge route identity changed.')
  return {kind:'api',path:'/api/pocket/cross-bridge'}
 }
 if(!q||q.selectionKey||q.tokenIn||q.tokenOut||q.destinationAsset&&q.destinationAsset!==q.asset)throw Error('This bridge route needs a compatible status adapter. Its saved transfer is retained.')
 if(q.asset&&!['USDC','USDT'].includes(q.asset))throw Error('This asset requires its matching bridge adapter.')
 if(q.rail==='bsc')return {kind:'api',path:q.source==='bsc'?'/api/pocket/bsc-outbound-bridge':'/api/pocket/bsc-inbound-bridge'}
 if(q.rail==='xlayer')return q.execution==='privy'&&q.source==='xlayer'?{kind:'sponsored'}:{kind:'api',path:'/api/pocket/xlayer-bridge'}
 if(q.rail!==undefined&&q.rail!==null&&q.rail!=='')throw Error('Unrecognized bridge route. Its saved transfer is retained.')
 if(q.execution==='privy')throw Error('Missing sponsored bridge route. Its saved transfer is retained.')
 if(q.asset&&q.asset!=='USDT')throw Error('Missing bridge route for this asset. Its saved transfer is retained.')
 if(!['base','arbitrum','ethereum','polygon','solana'].includes(q.source))throw Error('Missing bridge route for this network.')
 return {kind:'api',path:'/api/pocket/usdt-bridge'}
}
/** Source/output identities belong to the saved quote, never the current picker. */
export function pocketBridgeOperationAssets(q:any){
 if(q?.rail&&!['bsc','xlayer'].includes(q.rail)&&(!(q.asset||q.tokenIn?.symbol)||!(q.destinationAsset||q.tokenOut?.symbol)))throw Error('Missing bridge asset identity.')
 const source=q.asset||q.tokenIn?.symbol||(['bsc','xlayer'].includes(q.rail)?'USDC':'USDT')
 const destination=q.destinationAsset||q.tokenOut?.symbol||source
 if(q.asset&&q.tokenIn?.symbol&&q.asset!==q.tokenIn.symbol||q.destinationAsset&&q.tokenOut?.symbol&&q.destinationAsset!==q.tokenOut.symbol)throw Error('Bridge asset identity changed.')
 if(![source,destination].every(s=>typeof s==='string'&&/^[A-Za-z][A-Za-z0-9]{0,15}$/.test(s)))throw Error('Missing bridge asset identity.')
 return {source,destination}
}
/** Only an actual completed output is a receipt amount; quote.receive is an estimate. */
export function pocketBridgeReceived(p:any,state:string):string|undefined {
 return state==='completed'&&typeof p.amountOut==='string'&&/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(p.amountOut)&&/[1-9]/.test(p.amountOut)?p.amountOut:undefined
}

/** A status update may enrich a saved operation but cannot turn it into another route. */
export function samePocketBridgeOperationRoute(a:any,b:any):boolean {
 try{
  const x=pocketBridgeOperationAssets(a),y=pocketBridgeOperationAssets(b)
  return a.id===b.id&&a.source===b.source&&a.destination===b.destination&&a.rail===b.rail&&a.execution===b.execution&&x.source===y.source&&x.destination===y.destination&&a.selectionKey===b.selectionKey
 }catch{return false}
}
