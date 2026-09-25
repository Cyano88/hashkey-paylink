import { createHash } from 'node:crypto'
import type { Request, Response } from 'express'
import { decodeFunctionData, encodeFunctionData, getAddress, isAddress, parseAbi, zeroAddress, type Hex, type Address } from 'viem'
import { resolveDeveloperApiKeyPolicy } from './developer-projects.js'
import { assertLiveDeveloperRequest } from './developer-environment.js'
import { hasRenderDurableStore, readDurableJson, mutateDurableJson } from './render-durable-store.js'
const USDC = getAddress('0x3600000000000000000000000000000000000000')
const batchAbi = parseAbi(['function executeBatch((address target,uint256 value,bytes data)[] calls)'])
const transferAbi = parseAbi(['function transfer(address to,uint256 amount)'])
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const fail = (status: number, message: string): never => { throw Object.assign(new Error(message), {status}) }
type Wallet = {id: string; address: string; blockchain: string; accountType: string; state?: string}
type Registry = {wallets: Record<string, string>}
type Provider = (path: string, userToken?: string, body?: Record<string, unknown>) => Promise<Record<string, any>>
async function provider(path: string, userToken?: string, body?: Record<string, unknown>) {
 const key = process.env.CIRCLE_API_KEY?.trim()
 if (!key || /^TEST_/i.test(key)) fail(503, 'Live wallet service is unavailable.')
 const response = await fetch('https://api.circle.com'+path, {method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(15000),headers:{authorization:'Bearer '+key,accept:'application/json','content-type':'application/json',...(userToken?{'x-user-token':userToken}:{})},...(body?{body:JSON.stringify(body)}:{})})
 const data = await response.json().catch(()=>({})) as {data?:Record<string,any>}
 if (!response.ok || !data.data) fail(response.status>=500?503:response.status>=400?response.status:502, 'Circle wallet request failed. Reopen your wallet or try again.')
 return data.data!
}
const defaults = {configuration:()=>({chainId:5042,blockchain:'ARC',appId:process.env.VITE_CIRCLE_USER_WALLET_APP_ID||''}),policy:resolveDeveloperApiKeyPolicy,provider:provider as Provider,hasStore:hasRenderDurableStore,read:readDurableJson<Registry>,mutate:mutateDurableJson<Registry>}
export function createArcWalletHandler(overrides: Partial<typeof defaults> = {}) {
 const d={...defaults,...overrides}
 return async (req: Request,res: Response) => {
  res.setHeader('Cache-Control','no-store')
  try {
   if(req.method!=='POST')fail(405,'Use POST.')
   assertLiveDeveloperRequest(req)
   const policy=await d.policy(req)
   if(!policy||policy.environment!=='live'||policy.checkoutMode!=='human'||!policy.capabilities.includes('arc_agreements'))fail(403,'A scoped live Arc wallet key is required.')
   if(!d.hasStore())fail(503,'Wallet ownership storage is unavailable.')
   const b=req.body??{},path=String(b.path??''),method=b.method??'GET',payload=b.payload??{},token=typeof b.userToken==='string'?b.userToken:''
   if(token.length>8000||!['POST','GET'].includes(method)||!payload||typeof payload!=='object'||Array.isArray(payload))fail(400,'Invalid wallet request.')
   const project=policy!.partnerId,store='hashpaylink:project-arc-wallets:v1:'+project
   const scopedId=(id: unknown)=>{if(typeof id!=='string'||!uuid.test(id))fail(400,'Invalid retry reference.');const h=createHash('sha256').update(project+':'+id).digest('hex');return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-8'+h.slice(17,20)+'-'+h.slice(20,32)}
   const wallets=async()=>{
    if(!token)fail(401,'A Circle user session is required.')
    const data=await d.provider('/v1/w3s/wallets?pageSize=50',token)
    const list=(data.wallets??[]).filter((w:Wallet)=>w.blockchain==='ARC'&&w.accountType==='SCA'&&(!w.state||w.state==='LIVE')&&isAddress(w.address)) as Wallet[]
    await d.mutate(store,current=>({wallets:{...current?.wallets,...Object.fromEntries(list.map(w=>[w.id,getAddress(w.address)]))}}))
    return list
   }
   const owned=async(id:string)=>{const wallet=(await wallets()).find(w=>w.id===id);if(!wallet)fail(403,'This session does not own the Arc wallet.');return wallet!}
   let result: Record<string,any>
   if(method==='GET'&&path==='/configuration') {
    result=d.configuration()
    if(!result.appId)fail(503,'Wallet application is unavailable.')
   } else if(method==='POST'&&path==='/v1/w3s/users/email/token') {
    if(typeof payload.email!=='string'||payload.email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)||typeof payload.deviceId!=='string'||!payload.deviceId||payload.deviceId.length>256)fail(400,'Valid email and registered device are required.')
    result=await d.provider(path,undefined,{idempotencyKey:scopedId(payload.idempotencyKey),email:payload.email,deviceId:payload.deviceId})
   } else if(method==='POST'&&path==='/v1/w3s/users/token/refresh') {
    if(!token||typeof payload.refreshToken!=='string'||!payload.refreshToken||payload.refreshToken.length>8000||typeof payload.deviceId!=='string'||!payload.deviceId||payload.deviceId.length>256)fail(400,'Invalid Circle session.')
    result=await d.provider(path,token,{idempotencyKey:scopedId(payload.idempotencyKey),refreshToken:payload.refreshToken,deviceId:payload.deviceId})
   } else if(method==='POST'&&['/v1/w3s/user/initialize','/v1/w3s/user/wallets'].includes(path)) {
    if(!token||payload.accountType!=='SCA'||JSON.stringify(payload.blockchains)!=='["ARC"]')fail(400,'Only Arc mainnet smart wallets are supported.')
    result=await d.provider(path,token,{idempotencyKey:scopedId(payload.idempotencyKey),accountType:'SCA',blockchains:['ARC'],...(path.endsWith('/wallets')?{metadata:[{name:policy!.merchantName+' Arc'}]}:{})})
   } else if(method==='GET'&&path==='/v1/w3s/wallets?pageSize=50') {
    result={wallets:await wallets()}
   } else if(method==='POST'&&path==='/v1/w3s/user/transactions/contractExecution') {
    const wallet=await owned(String(payload.walletId??''))
    if(!isAddress(payload.contractAddress)||getAddress(payload.contractAddress)!==getAddress(wallet.address)||typeof payload.callData!=='string'||payload.callData.length>3000)fail(400,'Invalid Arc transfer.')
    let recipient: Address,amount: bigint
    try {
     const batch=decodeFunctionData({abi:batchAbi,data:payload.callData as Hex}),calls=batch.args[0]
     if(calls.length!==1||getAddress(calls[0].target)!==USDC||calls[0].value!==0n)throw Error()
     const transfer=decodeFunctionData({abi:transferAbi,data:calls[0].data});[recipient,amount]=transfer.args
     if(recipient===zeroAddress||amount<=0n)throw Error()
    } catch {return fail(400,'Only a single USDC transfer can be prepared.')}
    const callData=encodeFunctionData({abi:batchAbi,functionName:'executeBatch',args:[[{target:USDC,value:0n,data:encodeFunctionData({abi:transferAbi,functionName:'transfer',args:[recipient!,amount!]})}]]})
    if(typeof payload.refId!=='string'||!/^hashpaystream-(?:pocket:[a-f0-9-]{36}|arc-send)$/.test(payload.refId))fail(400,'Invalid transfer reference.')
    result=await d.provider(path,token,{idempotencyKey:scopedId(payload.idempotencyKey),walletId:wallet.id,feeLevel:'HIGH',contractAddress:wallet.address,callData,refId:project+':'+payload.refId})
   } else if(method==='GET'&&/^\/v1\/w3s\/user\/challenges\/[a-f0-9-]{36}$/i.test(path)) {
    if(!token)fail(401,'A Circle user session is required.')
    result=await d.provider(path,token)
   } else if(method==='GET'&&/^\/v1\/w3s\/transactions(?:[/?])/.test(path)) {
    const url=new URL(path,'https://api.circle.com'),prefix=project+':'
    if(url.pathname==='/v1/w3s/transactions') {
     const id=url.searchParams.get('walletIds')||'',registry=await d.read(store)
     if(!registry?.wallets[id])fail(403,'Wallet is not registered to this project.')
     if(url.searchParams.getAll('walletIds').length!==1||[...url.searchParams.keys()].some(k=>url.searchParams.getAll(k).length!==1||!['walletIds','from','pageSize','pageAfter'].includes(k))||url.searchParams.get('pageSize')!=='5'||!Number.isFinite(Date.parse(url.searchParams.get('from')||'')))fail(400,'Invalid transaction lookup.')
     result=await d.provider(path,token||undefined)
     const candidates=await Promise.all((result.transactions??[]).slice(0,5).map(async(tx:any)=>{if(tx.walletId!==id)return null;if(!tx.refId&&uuid.test(tx.id))return (await d.provider('/v1/w3s/transactions/'+tx.id,token||undefined)).transaction;return tx}))
     result={transactions:candidates.filter((tx:any)=>tx?.walletId===id&&tx.blockchain==='ARC'&&tx.refId?.startsWith(prefix)).map((tx:any)=>({...tx,refId:tx.refId.slice(prefix.length)}))}
    } else {
     if(!/^\/v1\/w3s\/transactions\/[a-f0-9-]{36}$/i.test(path))fail(400,'Invalid transaction reference.')
     result=await d.provider(path,token||undefined)
     const tx=result.transaction,registry=await d.read(store)
     if(!tx||!registry?.wallets[tx.walletId]||tx.blockchain!=='ARC'||(tx.refId&&!tx.refId.startsWith(prefix))||(!token&&!tx.refId))fail(403,'Transaction does not belong to this project.')
     result={transaction:{...tx,...(tx.refId?{refId:tx.refId.slice(prefix.length)}:{})}}
    }
   } else fail(400,'Unsupported Arc wallet operation.')
   return res.json({ok:true,data:result})
  } catch(error) {const status=Number((error as {status?:number}).status)||503;return res.status(status).json({ok:false,error:status>=500?'Arc wallet service is temporarily unavailable.':(error as Error).message})}
 }
}
export default createArcWalletHandler()
