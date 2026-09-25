import {createHash} from 'node:crypto'
import type {Request,Response} from 'express'
import {PrivyClient} from '@privy-io/server-auth'
import {assertLiveDeveloperRequest} from './developer-environment.js'
import {resolveDeveloperApiKeyPolicy,resolveWalletSwapProjectEnabled} from './developer-projects.js'
import {hasRenderDurableStore,readDurableJson,mutateDurableJson} from './render-durable-store.js'
import {verifiedPrivyUser,circleLinkKey,readCircleLink} from './privy-circle-link.js'
import {agreementPrivyAuthority} from './xstocks-agreement/authority.js'
import {createArcSwapHandler} from './pocket/arc-swap.js'
import {createStockSwapHandler} from './pocket/xstocks-swap.js'
type Rail='arc'|'xlayer'
export type SwapSession={id:string;projectId:string;projectName:string;userId:string;walletAppId:string;rail:Rail;digest:string;createdAt:string}
const hash=(s:string)=>createHash('sha256').update(s).digest('hex'),key=(id:string)=>'hashpaylink:wallet-swap:v1:'+id
function fail(status:number,message:string):never{throw Object.assign(Error(message),{status})}
const view=(r:SwapSession)=>({id:r.id,projectId:r.projectId,projectName:r.projectName,walletAppId:r.walletAppId,rail:r.rail,chainId:r.rail==='arc'?5042:196,checkoutPath:'/wallet/swap/'+r.id})
function enabled(env:NodeJS.ProcessEnv,project:string){return env.HASHPAYLINK_WALLET_SWAP_ENABLED==='true'&&(env.HASHPAYLINK_WALLET_SWAP_PROJECTS||'').split(',').map(x=>x.trim()).includes(project)}
const defaults={env:()=>process.env,policy:resolveDeveloperApiKeyPolicy,projectEnabled:resolveWalletSwapProjectEnabled,identity:verifiedPrivyUser,hasStore:hasRenderDurableStore,read:readDurableJson<SwapSession>,mutate:mutateDurableJson<SwapSession>,
 dispatch:async(record:SwapSession,req:Request,res:Response)=>{
  const owner='developer-swap:'+record.projectId+':'+record.userId
  const identity=async()=>({userId:owner})
  if(record.rail==='arc')return createArcSwapHandler({identity,readLink:async()=>readCircleLink(circleLinkKey(record.userId,'arc'))})(req,res)
  const authority=agreementPrivyAuthority(process.env)
  return createStockSwapHandler({identity,user:async()=>new PrivyClient(authority.appId,authority.env.PRIVY_APP_SECRET!).getUserById(record.userId)})(req,res)
 }}
export function createWalletSwapSessionHandlers(overrides:Partial<typeof defaults>={}){
 const d={...defaults,...overrides}
 const respond=(res:Response,error:unknown)=>{const status=Number((error as {status?:number}).status)||503;return res.status(status).json({ok:false,error:status>=500?'Swap service is temporarily unavailable.':(error as Error).message})}
 const developer=async(req:Request,res:Response)=>{
  res.setHeader('Cache-Control','no-store')
  try{
   if(req.method!=='POST')fail(405,'Use POST.')
   assertLiveDeveloperRequest(req)
   const policy=await d.policy(req)
   if(!policy||policy.environment!=='live'||policy.checkoutMode!=='human')fail(403,'A live wallet swap key is required.')
   if(!d.hasStore())fail(503,'Durable storage is unavailable.')
   const rail=req.body?.rail as Rail,userId=req.body?.userId,replay=req.headers['idempotency-key']
   if(!['arc','xlayer'].includes(rail)||typeof userId!=='string'||!/^did:privy:[a-zA-Z0-9_-]+$/.test(userId))fail(400,'Choose a supported network and linked wallet account.')
   if(!policy.capabilities.includes(rail==='arc'?'arc_agreements':'xstocks_agreements'))fail(403,'This wallet network is not enabled for your project.')
   if(typeof replay!=='string'||!/^[a-zA-Z0-9:_-]{16,128}$/.test(replay))fail(400,'A 16-128 character idempotency key is required.')
   const authority=agreementPrivyAuthority(d.env()),id='wss_'+hash(JSON.stringify([policy.partnerId,replay]))
   const digest=hash(JSON.stringify([policy.partnerId,authority.appId,userId,rail]))
   const session=await d.mutate(key(id),current=>{
    if(current){if(current.digest!==digest)fail(409,'This retry reference belongs to another wallet session.');return current}
    if(!enabled(d.env(),policy.partnerId))fail(409,'New swap sessions are not enabled for this project.')
    return {id,projectId:policy.partnerId,projectName:policy.merchantName,userId,walletAppId:authority.appId,rail,digest,createdAt:new Date().toISOString()}
   })
   return res.status(201).json({ok:true,session:view(session)})
  }catch(error){return respond(res,error)}
 }
 const participant=async(req:Request,res:Response)=>{
  res.setHeader('Cache-Control','no-store')
  try{
   if(req.method!=='POST')fail(405,'Use POST.')
   assertLiveDeveloperRequest(req)
   if(req.headers['x-api-key'])fail(401,'Sign in with your wallet account.')
   if(!d.hasStore())fail(503,'Durable storage is unavailable.')
   const id=req.body?.sessionId
   if(typeof id!=='string'||!/^wss_[a-f0-9]{64}$/.test(id))fail(400,'Invalid wallet session.')
   const identity=await d.identity(req),session=await d.read(key(id))
   if(!session||session.userId!==identity.userId)fail(404,'Wallet session not found.')
   if(session.walletAppId!==agreementPrivyAuthority(d.env()).appId)fail(409,'Wallet authority changed. Reconnect your account.')
   const available=enabled(d.env(),session.projectId)&&await d.projectEnabled(session.projectId,session.rail)
   if(req.body.action==='read')return res.json({ok:true,enabled:available,session:view(session)})
   if(req.body.action!=='request')fail(400,'Unsupported wallet session action.')
   const method=req.body.method,body=req.body.payload??{},token=req.body.token
   if(!['GET','POST'].includes(method)||!body||typeof body!=='object'||Array.isArray(body)||token!==undefined&&(typeof token!=='string'||token.length>100))fail(400,'Invalid swap request.')
   if(!available&&!(method==='GET'||session.rail==='arc'&&body.action==='status'))fail(409,'New swaps are paused. Existing transaction status remains available.')
   const inner=Object.create(req) as Request
   Object.defineProperties(inner,{method:{value:method},body:{value:body},query:{value:token?{token}:{} }})
   return await d.dispatch(session,inner,res)
  }catch(error){return respond(res,error)}
 }
 return {developer,participant}
}
