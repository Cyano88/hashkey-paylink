import {readCrossBridgePrivySource} from './cross-bridge-privy-source.js'
import {hasRenderDurableStore} from '../render-durable-store.js'
import {consumePocketPaymentApproval} from './payment-security.js'
import {revalidateCrossBridgeWallets} from './cross-bridge-wallets.js'
import {openCrossBridgeReview} from './cross-bridge-review.js'
import {createCrossBridgeOperations,type CrossBridgeOperationDependencies} from './cross-bridge-operations.js'
import {inboundBridgeClient,inboundChains} from './inbound-bridge-networks.js'
import {XLAYER_ENTRY_POINT} from './xlayer-sponsored-cost.js'
import type {Hex} from 'viem'
type Review=Awaited<ReturnType<typeof openCrossBridgeReview>>
const fail=():never=>{throw Error('Sponsored bridge identity could not be verified.')}
const same=(a:unknown,b:string)=>typeof a==='string'&&a.toLowerCase()===b.toLowerCase()
const hash=(v:unknown):v is string=>typeof v==='string'&&/^0x[0-9a-f]{64}$/i.test(v)
const providerId=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9_-]{10,128}$/.test(v)
export function crossBridgePrivyRequest(r:Review,appId:string){
 const q=r.quote,source=q.input.source,plan=r.charged.plan
 if(source!=='bsc'&&source!=='xlayer'||q.wallets.source.provider!=='privy'||plan.kind!=='evm'||!providerId(q.wallets.source.walletId)||! /^[a-zA-Z0-9]{1,128}$/.test(appId))return fail()
 return {version:1 as const,method:'POST' as const,url:'https://api.privy.io/v1/wallets/'+q.wallets.source.walletId+'/rpc',headers:{'privy-app-id':appId,'privy-idempotency-key':q.id,'privy-request-expiry':String(q.expiresAt)},body:{chain_type:'ethereum',method:'wallet_sendCalls',caip2:'eip155:'+inboundChains[source].id,sponsor:true,params:{calls:plan.calls.map(c=>({to:c.target,data:c.data,value:'0x'+c.value.toString(16)}))}}}
}
export function createCrossBridgePrivyRuntime(ownerId:string,preflight:(r:Review)=>Promise<void>,options:{preflightRevalidatesWallets?:boolean;env?:NodeJS.ProcessEnv;fetcher?:typeof fetch;overrides?:Partial<CrossBridgeOperationDependencies>&{durable?:()=>boolean;wallets?:typeof revalidateCrossBridgeWallets;source?:typeof readCrossBridgePrivySource}}={}){
 const env=options.env??process.env,fetcher=options.fetcher??fetch,appId=env.PRIVY_APP_ID||env.VITE_PRIVY_APP_ID||'',secret=env.PRIVY_APP_SECRET||'',o=options.overrides??{}
 if(!ownerId||ownerId.length>256||!appId||!secret||typeof preflight!=='function')throw Error('Authenticated sponsored bridge context is required.')
 const ready=()=>{if(!(o.durable??hasRenderDurableStore)())throw Error('Bridge recovery storage is unavailable.')}
 const wallets=o.wallets??revalidateCrossBridgeWallets,now=o.now??Date.now
 const headers={'privy-app-id':appId,Authorization:'Basic '+Buffer.from(appId+':'+secret).toString('base64')}
 const open=async(token:string,owner:string,recovery:boolean)=>{ready();if(owner!==ownerId)return fail();const r=await (o.open??((t,id,recover)=>openCrossBridgeReview(t,id,{recovery:recover,now:now()})))(token,owner,recovery);crossBridgePrivyRequest(r,appId);return r}
 const service=createCrossBridgeOperations({store:o.store,now,open,approve:o.approve??((owner,approval)=>consumePocketPaymentApproval(approval,owner,now())),
  preflight:async r=>{if(!options.preflightRevalidatesWallets)await wallets(r.quote.wallets);await preflight(r)},
  dispatch:async(r,op,authorization)=>{
   // The reservation is already submitting, but no provider request exists yet.
   // Failure or expiry in these local checks must not become an unknown send.
   let request:ReturnType<typeof crossBridgePrivyRequest>
   try{
    await wallets(r.quote.wallets)
    request=crossBridgePrivyRequest(r,appId)
    if(op.id!==r.quote.id)return fail()
    if(r.quote.expiresAt<=now()+5000)return {definitelyNotSubmitted:true}
   }catch{return {definitelyNotSubmitted:true}}
   const response=await fetcher(request.url,{method:'POST',headers:{...request.headers,...headers,'content-type':'application/json','privy-authorization-signature':authorization},body:JSON.stringify(request.body),redirect:'error',signal:AbortSignal.timeout(30000)})
   const body=await response.json(),data=body?.data
   if(!response.ok)console.warn('pocket_bridge_privy_response',JSON.stringify({id:op.id,source:r.quote.input.source,status:response.status,code:typeof body?.code==='string'&&/^[a-zA-Z0-9_]{1,80}$/.test(body.code)?body.code:'unknown',hasReference:!!(data?.hash||data?.transaction_id||data?.user_operation_hash)}))
   // Only the response to this first dispatch can establish rejection. Status
   // recovery never replays an expired request to infer its earlier outcome.
   if(!response.ok){if((response.status===400&&body?.code==='transaction_broadcast_failure'||response.status>=400&&response.status<500&&body?.code==='request_expired')&&!data?.hash&&!data?.transaction_id&&!data?.user_operation_hash)return {definitelyNotSubmitted:true};return null}
   if(data?.caip2!==request.body.caip2)return fail()
   return {...(hash(data.hash)?{sourceHash:data.hash}:{}),...(providerId(data.transaction_id)?{transactionId:data.transaction_id}:{}),...(hash(data.user_operation_hash)?{userOperationHash:data.user_operation_hash}:{})}
  },
  observe:async(r,op)=>{
   const q=r.quote,request=crossBridgePrivyRequest(r,appId)
   if(op.sourceHash)return {sourceHash:op.sourceHash}
   let userOperationHash=op.userOperationHash
   if(op.transactionId){
    if(!providerId(op.transactionId))return fail()
    const response=await fetcher('https://api.privy.io/v1/transactions/'+op.transactionId,{headers,redirect:'error',signal:AbortSignal.timeout(10000)})
    if(!response.ok)throw Error('Bridge confirmation is still being verified.')
    const tx=await response.json()
    if(tx?.id!==op.transactionId||tx.wallet_id!==q.wallets.source.walletId||tx.caip2!==request.body.caip2||userOperationHash&&tx.user_operation_hash&&!same(tx.user_operation_hash,userOperationHash))return fail()
    if(hash(tx.user_operation_hash))userOperationHash=tx.user_operation_hash
    if(hash(tx.transaction_hash))return {sourceHash:tx.transaction_hash,...(userOperationHash?{userOperationHash}:{})}
   }
   if(userOperationHash){
    const source=q.input.source as 'bsc'|'xlayer',client=inboundBridgeClient(source,env)
    if(await client.getChainId()!==inboundChains[source].id)return fail()
    const receipt:any=await client.request({method:'eth_getUserOperationReceipt' as any,params:[userOperationHash as Hex]} as any)
    if(receipt){if(!same(receipt.userOpHash,userOperationHash)||!same(receipt.sender,q.wallets.source.address)||!same(receipt.entryPoint,XLAYER_ENTRY_POINT)||!same(receipt.receipt?.to,XLAYER_ENTRY_POINT)||!hash(receipt.receipt?.transactionHash))return fail();return {sourceHash:receipt.receipt.transactionHash,userOperationHash}}
    return {userOperationHash}
   }
   // Provider response loss may leave no transaction ID. Discover by the saved
   // Relay order, then prove this exact wallet batch before storing the hash.
   const response=await fetcher('https://api.relay.link/requests/v3?'+new URLSearchParams({id:r.route.requestId,orderId:r.route.orderId,limit:'1'}),{headers:{'x-api-key':env.RELAY_API_KEY||''},redirect:'error',signal:AbortSignal.timeout(10000)})
   if(!response.ok)return null
   const body=await response.json(),records=body?.requests
   if(!Array.isArray(records)||records.length!==1)return null
   const found=records[0],txs=found?.data?.inTxs
   if(!same(found.id,r.route.requestId)||!same(found.protocol?.orderId,r.route.orderId)||found.protocol?.hubType!=='onchain'||!same(found.user,q.input.sender)||(q.input.destination==='solana'?found.recipient!==q.input.recipient:!same(found.recipient,q.input.recipient))||!Array.isArray(txs)||txs.length!==1||txs[0].chainId!==inboundChains[q.input.source as 'bsc'|'xlayer'].id||!hash(txs[0].txHash))return null
   await (o.source??readCrossBridgePrivySource)(r,txs[0].txHash,undefined,{env})
   return {sourceHash:txs[0].txHash}
  },
 })
 return {
  prepare:(token:string,approval:string)=>{ready();return service.prepare(token,ownerId,approval)},
  request:async(id:string)=>{ready();const op=await service.read(ownerId,id);if(op.state!=='prepared')return fail();return crossBridgePrivyRequest(await open(op.quoteToken,ownerId,false),appId)},
  submit:(id:string,authorization:string)=>{ready();return service.submit(ownerId,id,authorization)},
  status:(id:string)=>{ready();return service.status(ownerId,id)},
  read:(id:string)=>{ready();return service.read(ownerId,id)},
  cancel:(id:string)=>{ready();return service.cancel(ownerId,id)},
 }
}
