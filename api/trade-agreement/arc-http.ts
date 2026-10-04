import {createHash} from 'node:crypto'
import type {Request,Response} from 'express'
import {createPublicClient,defineChain,getAddress,http,keccak256,stringToHex,type Address,type Hex} from 'viem'
import {assertLiveDeveloperRequest} from '../developer-environment.js'
import {resolveDeveloperApiKeyPolicy,resolveArcTradeProjectPolicy as resolveDeveloperProjectPolicy} from '../developer-projects.js'
import {hasRenderDurableStore,readDurableJson,mutateDurableJson} from '../render-durable-store.js'
import {verifiedPrivyUser} from '../privy-circle-link.js'
import {createCircleArcUserContractChallenge,readCircleArcUserChallenge,readCircleArcUserTransaction} from '../circle-solana-email.js'
import {agreementPrivyAuthority} from '../xstocks-agreement/authority.js'
import {ARC_AGREEMENT_NETWORK} from '../arc-agreement-config.js'
import {TRADE_ACTION_LABELS,type TradeXLayerAction} from '../../src/lib/xstocksAgreement/protocol.js'
import {arcTradeAvailability,parseArcTradeCheckout,prepareArcTradeBinding,type ArcTradeTerms} from './arc.js'
import {prepareArcTradeAction,type ArcTradeBinding,type ArcTradeStatus} from './arc-planner.js'
import {ARC_TRADE_EXECUTION_POLICY,verifyArcTradeExecutionAccount,type ArcTradeExecutionPolicy,type ArcTradeExecutionReader} from './arc-execution.js'
import {createArcTradeExecutionStore,type ArcTradeExecutionEntry} from './arc-execution-store.js'
import {verifyArcTradeWallet,type ArcTradeWallet} from './arc-wallet.js'
import {arcTradeProviderReference} from './arc-provider.js'
import {recordArcTradeReceipt,type ArcTradeReceipt} from './receipt.js'

type Role='customer'|'provider'
export type ArcHostedTrade = {
  id:string;partnerId:string;walletAppId:string;digest:string;terms:ArcTradeTerms;
  participants:Record<Role,string>;accepted:Partial<Record<Role,ArcTradeWallet & {at:string}>>;
  binding?:ArcTradeBinding;observed?:Pick<ArcTradeStatus,'observedBlock'|'state'|'escrow'>;
  evidence:Array<{hash:Hex;body:string;role:Role;at:string}>;createdAt:string;receipt?:ArcTradeReceipt;
}
type Deps={
  env:()=>NodeJS.ProcessEnv;hasStore:()=>boolean;now:()=>Date;
  policy:typeof resolveDeveloperApiKeyPolicy;project:typeof resolveDeveloperProjectPolicy;
  identity:(req:Request)=>Promise<string>;wallet:typeof verifyArcTradeWallet;
  availability:typeof arcTradeAvailability;bind:typeof prepareArcTradeBinding;plan:typeof prepareArcTradeAction;
  read:(key:string)=>Promise<ArcHostedTrade|undefined>;
  mutate:(key:string,update:(record:ArcHostedTrade|undefined)=>ArcHostedTrade)=>Promise<ArcHostedTrade>;
  journal:ReturnType<typeof createArcTradeExecutionStore>;
  executionPolicy:()=>ArcTradeExecutionPolicy|null;client:()=>ArcTradeExecutionReader;
  verifyExecutionAccount:typeof verifyArcTradeExecutionAccount;
  createChallenge:typeof createCircleArcUserContractChallenge;readChallenge:typeof readCircleArcUserChallenge;readTransaction:typeof readCircleArcUserTransaction;
  receipt:typeof recordArcTradeReceipt;
}
function client():ArcTradeExecutionReader {
  const url=new URL(process.env.PRIVATE_RPC_URL_ARC_MAINNET||ARC_AGREEMENT_NETWORK.rpcUrl)
  if(url.protocol!=='https:'||url.username||url.password)throw Error('Invalid Arc Trade RPC configuration.')
  const chain=defineChain({id:5042,name:'Arc',nativeCurrency:{name:'USDC',symbol:'USDC',decimals:18},rpcUrls:{default:{http:[url.toString()]}}})
  return createPublicClient({chain,transport:http(url.toString(),{timeout:15000,retryCount:1})}) as unknown as ArcTradeExecutionReader
}
const defaults:Deps={
  env:()=>process.env,hasStore:hasRenderDurableStore,now:()=>new Date(),policy:resolveDeveloperApiKeyPolicy,project:resolveDeveloperProjectPolicy,
  identity:async req=>(await verifiedPrivyUser(req)).userId,wallet:verifyArcTradeWallet,availability:arcTradeAvailability,bind:prepareArcTradeBinding,plan:prepareArcTradeAction,
  read:readDurableJson,mutate:mutateDurableJson,journal:createArcTradeExecutionStore(),executionPolicy:()=>ARC_TRADE_EXECUTION_POLICY,client,
  verifyExecutionAccount:verifyArcTradeExecutionAccount,
  createChallenge:createCircleArcUserContractChallenge,readChallenge:readCircleArcUserChallenge,readTransaction:readCircleArcUserTransaction,
  receipt:recordArcTradeReceipt,
}
function fail(status:number,message:string):never{throw Object.assign(Error(message),{status})}
const sha=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
const key=(id:string)=>`hashpaylink:arc-hosted-trade:v1:${id}`
const starts=new Set<TradeXLayerAction>(['create','accept','approve','fund'])
function id(value:unknown):string{if(typeof value!=='string'||!/^tag_[a-f0-9]{64}$/.test(value))fail(400,'Invalid Trade agreement ID.');return value}
function replay(value:unknown):string{if(typeof value!=='string'||!/^[a-zA-Z0-9:_-]{16,128}$/.test(value))fail(400,'Use a 16-128 character idempotency key.');return value}
function requestId(value:unknown):string{if(typeof value!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value))fail(400,'Invalid Trade action request ID.');return value.toLowerCase()}
function roleFor(record:ArcHostedTrade,userId:string):Role{if(record.participants.customer===userId)return 'customer';if(record.participants.provider===userId)return 'provider';return fail(404,'Agreement not found.')}
function view(record:ArcHostedTrade){return {id:record.id,projectId:record.partnerId,walletAppId:record.walletAppId,checkoutPath:`/agreements/trade/${record.id}`,terms:record.terms,consentHash:record.digest,accepted:Object.fromEntries(Object.entries(record.accepted).map(([role,wallet])=>[role,{address:wallet.address,at:wallet.at}])),binding:record.binding,observed:record.observed,evidence:record.evidence,createdAt:record.createdAt,receipt:record.receipt}}
function executionView(entry:ArcTradeExecutionEntry|undefined,userId:string){return entry?{requestId:entry.requestId,operation:entry.action,status:entry.status,own:entry.participantId===userId,...(entry.participantId===userId?{challengeId:entry.challengeId,transactionHash:entry.transactionHash}:{}),result:entry.result}:undefined}
function errorResponse(res:Response,error:unknown){const status=Number((error as {status?:number})?.status)||500;return res.status(status).json({ok:false,error:status>=500?'Trade service is temporarily unavailable. Retry the same action to recover.':(error as Error).message})}
function activePolicy(policy:Awaited<ReturnType<Deps['project']>>){return !!policy&&policy.environment==='live'&&policy.checkoutMode==='human'&&policy.capabilities.includes('arc_agreements')&&policy.settlementMode==='usdc'}

export function createArcTradeHandlers(overrides:Partial<Deps>={}){
  const d={...defaults,...overrides}
  async function enabled(projectId:string){return d.availability(d.env(),projectId).enabled&&!!d.executionPolicy()&&activePolicy(await d.project(projectId,'live'))}
  async function observe(record:ArcHostedTrade,account:Address,operation?:TradeXLayerAction,evidence?:unknown,settlement?:unknown){
    if(!record.binding)fail(409,'Both participants must accept the Trade terms first.')
    const env={...d.env()}
    if(!await enabled(record.partnerId))env.HASHPAYLINK_TRADE_ARC_ENABLED='false'
    const status=await d.plan({env,projectId:record.partnerId,binding:record.binding,account,action:operation,evidence,settlement})
    const next=await d.mutate(key(record.id),current=>{
      if(!current||current.digest!==record.digest||current.binding?.termsHash!==record.binding?.termsHash)fail(409,'Agreement changed. Refresh.')
      if(status.pending)return current
      if(current.observed?.state!==undefined && status.state===undefined && status.observedBlock)fail(409,'The known escrow is missing from the confirmed chain view.')
      if(status.observedBlock){
        if(!/^[0-9]+$/.test(status.observedBlock))fail(502,'Invalid confirmed Trade block.')
        const previous=current.observed
        if(previous?.observedBlock && (BigInt(status.observedBlock)<BigInt(previous.observedBlock)
          ||(status.observedBlock===previous.observedBlock&&(status.state!==previous.state||status.escrow!==previous.escrow))))fail(409,'Payment details are updating. Refresh.')
        current={...current,observed:{observedBlock:status.observedBlock,state:status.state,escrow:status.escrow}}
      }
      if(operation&&['dispatch','refund','dispute','proposeSettlement'].includes(operation)){
        if(typeof evidence!=='string'||evidence.trim().length<10||evidence.length>2000)fail(400,'Add a note of 10 to 2000 characters.')
        const body=evidence.trim(),hash=keccak256(stringToHex(body)),role=account===current.accepted.customer?.address?'customer':'provider'
        if(!current.evidence.some(note=>note.hash===hash&&note.role===role)){
          if(current.evidence.length>=128)fail(409,'Evidence limit reached. Contact support.')
          current={...current,evidence:[...current.evidence,{hash,body,role,at:d.now().toISOString()}]}
        }
      }
      return current
    })
    return {record:next,status}
  }
  const developer=async(req:Request,res:Response)=>{
    res.setHeader('Cache-Control','no-store')
    try{
      if(!['GET','POST'].includes(req.method))fail(405,'Method not allowed.')
      assertLiveDeveloperRequest(req)
      if(!d.hasStore())fail(503,'Durable storage is unavailable.')
      const policy=await d.policy(req)
      if(!activePolicy(policy))fail(403,'A live Arc Agreement project key is required.')
      const projectId=policy!.partnerId
      if(req.method==='GET'&&req.query.purpose==='availability')return res.json({ok:true,paymentRail:'arc',chainId:5042,enabled:await enabled(projectId)})
      if(req.method==='GET'){
        const agreementId=req.query.idempotencyKey!==undefined?'tag_'+sha([projectId,replay(req.query.idempotencyKey)]):id(req.query.id)
        let record=await d.read(key(agreementId))
        if(!record||record.partnerId!==projectId)fail(404,'Agreement not found.')
        if(req.query.reconcile!==undefined&&req.query.reconcile!=='true')fail(400,'Choose a valid refresh option.')
        let status:ArcTradeStatus|undefined
        if(req.query.reconcile==='true'&&record.binding&&record.accepted.customer){const next=await observe(record,record.accepted.customer.address);record=next.record;status=next.status}
        const expiry=status&&!status.pending&&status.fundingExpired===true&&status.state===undefined&&record.observed?.state===undefined
          &&status.escrow==='0x0000000000000000000000000000000000000000'&&/^[1-9][0-9]*$/.test(status.observedBlock??'')
          ?{fundingExpired:true,escrow:status.escrow,observedBlock:status.observedBlock}:{}
        return res.json({ok:true,agreement:view(record),observation:{pending:!!status?.pending,checkedAt:d.now().toISOString(),...expiry},...(status?{status:{...status,transaction:undefined}}:{})})
      }
      if(req.body?.action!==undefined)fail(400,'Developer keys may create drafts only.')
      if((req.body?.checkoutMode??'human')!=='human')fail(400,'Arc Trade requires human checkout.')
      if(!await enabled(projectId))fail(409,'New Arc Trade agreements are not enabled.')
      const authority=agreementPrivyAuthority(d.env()),terms=parseArcTradeCheckout(req.body??{})
      const customer=req.body?.customerUserId,provider=req.body?.providerUserId
      if(typeof customer!=='string'||typeof provider!=='string'||!/^did:privy:[a-zA-Z0-9_-]{1,140}$/.test(customer)||!/^did:privy:[a-zA-Z0-9_-]{1,140}$/.test(provider)
        ||customer===provider)fail(400,'Choose two distinct Privy participants.')
      const agreementId='tag_'+sha([projectId,replay(req.headers['idempotency-key'])]),participants={customer,provider}
      const digest=sha({projectId,walletAppId:authority.appId,terms,participants})
      const record=await d.mutate(key(agreementId),current=>{
        if(current){if(current.partnerId!==projectId||current.digest!==digest)fail(409,'Idempotency key already used with different terms.');return current}
        return {id:agreementId,partnerId:projectId,walletAppId:authority.appId,digest,terms,participants,accepted:{},evidence:[],createdAt:d.now().toISOString()}
      })
      return res.status(201).json({ok:true,agreement:view(record)})
    }catch(error){return errorResponse(res,error)}
  }
  const participant=async(req:Request,res:Response)=>{
    res.setHeader('Cache-Control','no-store')
    try{
      if(req.method!=='POST')fail(405,'Method not allowed.')
      assertLiveDeveloperRequest(req)
      if(req.headers['x-api-key']||!/^Bearer\s+\S+$/i.test(String(req.headers.authorization??'')))fail(401,'Sign in with your participant account.')
      if(!d.hasStore())fail(503,'Durable storage is unavailable.')
      const userId=await d.identity(req),agreementId=id(req.body?.agreementId)
      let record=await d.read(key(agreementId))
      if(!record)fail(404,'Agreement not found.')
      const role=roleFor(record,userId),authority=agreementPrivyAuthority(d.env())
      if(record.walletAppId!==authority.appId)fail(409,'The Agreement wallet app changed. Contact support.')
      const action=req.body?.action
      if(!['read','accept_terms','prepare','challenge','recover'].includes(action))fail(400,'Choose a supported participant action.')
      const fundingEnabled=await enabled(record.partnerId)
      if(action==='read'){
        const execution=await d.journal.latest(record.id,record.partnerId)
        if(!record.receipt&&execution?.status==='confirmed'&&execution.transactionHash&&['release','refund','missedDispatch','inspectionRelease','acceptSettlement'].includes(execution.action)){
          try{record={...record,receipt:await d.receipt(record,execution.transactionHash)}}catch{/* Receipt verification is retried on refresh; never infer a payout from SDK completion. */}
        }
        return res.json({ok:true,role,fundingEnabled,agreement:view(record),execution:executionView(execution,userId)})
      }
      const wallet=await d.wallet(userId,req.body?.circleUserToken)
      if(action==='accept_terms'){
        if(!fundingEnabled)fail(409,'New Arc Trade agreements are paused.')
        if(req.body?.consentHash!==record.digest)fail(409,'Review and accept the exact Trade terms.')
        const previous=record
        record=await d.mutate(key(record.id),current=>{
          if(!current||current.digest!==previous.digest)fail(409,'Agreement changed. Refresh.')
          roleFor(current,userId)
          const accepted=current.accepted[role],other=role==='customer'?'provider':'customer'
          if(accepted){if(accepted.id!==wallet.id||accepted.address!==wallet.address)fail(409,'The accepted wallet cannot change.');return current}
          if(current.accepted[other]?.address===wallet.address||current.accepted[other]?.id===wallet.id)fail(409,'Participants must use distinct wallets.')
          const next={...current,accepted:{...current.accepted,[role]:{...wallet,at:d.now().toISOString()}}}
          if(next.accepted.customer&&next.accepted.provider)next.binding=d.bind(next.id,next.terms,next.accepted.customer.address,next.accepted.provider.address,Math.floor(d.now().getTime()/1000))
          return next
        })
        return res.json({ok:true,role,fundingEnabled,agreement:view(record)})
      }
      const accepted=record.accepted[role]
      if(!record.binding||!accepted)fail(409,'Both participants must accept the terms first.')
      if(wallet.id!==accepted.id||wallet.address!==accepted.address)fail(403,'Use the wallet that accepted these Trade terms.')
      if(action==='prepare'){
        if(req.body?.operation!==undefined)fail(400,'Use participant confirmation to start a Trade action.')
        const next=await observe(record,wallet.address)
        return res.json({ok:true,role,fundingEnabled,agreement:view(next.record),status:{...next.status,transaction:undefined}})
      }
      const policy=d.executionPolicy()
      if(!policy)fail(409,'Arc Trade execution is pending verification.')
      const actionRequestId=requestId(req.body?.requestId)
      const identity={agreementId:record.id,projectId:record.partnerId,requestId:actionRequestId}
      let entry=await d.journal.find(record.id,record.partnerId,actionRequestId)
      if(entry&&(entry.participantId!==userId||entry.walletId!==wallet.id||entry.call.account!==wallet.address||entry.termsHash!==record.binding.termsHash))fail(403,'This Trade action belongs to another participant or wallet.')
      if(action==='challenge'){
        const operation=req.body?.operation as TradeXLayerAction
        if(typeof operation!=='string'||!Object.hasOwn(TRADE_ACTION_LABELS,operation))fail(400,'Choose a supported escrow operation.')
        if(entry&&entry.action!==operation)fail(409,'The retry must use the original Trade operation.')
        if(!entry){
          if(starts.has(operation)&&!fundingEnabled)fail(409,'New Arc Trade payments are paused.')
          const reader=d.client()
          if(await reader.getChainId()!==5042)fail(503,'Arc mainnet is unavailable.')
          const head=await reader.getBlockNumber({cacheTime:0})
          const next=await observe(record,wallet.address,operation,req.body?.evidence,req.body?.settlement)
          record=next.record
          if(next.status.pending||!next.status.transaction)fail(409,'Trade state is updating. Refresh before confirming.')
          entry=await d.journal.reserve({...identity,participantId:userId,walletId:wallet.id,termsHash:record.binding!.termsHash,action:operation,call:next.status.transaction,preparedAfterBlock:String(head)})
        }
        if(!entry.challengeId){
          if(starts.has(entry.action)&&!fundingEnabled)fail(409,'New Arc Trade payments are paused. The pending action is retained.')
          await d.verifyExecutionAccount(wallet.address,policy,d.client())
          if(starts.has(entry.action)&&!await enabled(record.partnerId))fail(409,'New Arc Trade payments are paused. The pending action is retained.')
          // Always reuse the reserved payload/key, including after a provider
          // timeout. A new simulation must never replace an unknown submission.
          const challenge=await d.createChallenge({userToken:req.body.circleUserToken,walletId:entry.walletId,walletAddress:entry.call.account,callData:entry.wrappedCall,idempotencyKey:entry.idempotencyKey,refId:`trade:${entry.idempotencyKey}`})
          if(typeof challenge.challengeId!=='string')fail(502,'Circle did not return a confirmation challenge.')
          entry=await d.journal.recordChallenge({...identity,challengeId:challenge.challengeId})
          const providerId=arcTradeProviderReference(challenge,'transactionId')
          if(providerId)entry=await d.journal.recordProviderTransaction({...identity,transactionId:providerId})
        }
        return res.json({ok:true,role,fundingEnabled,agreement:view(record),execution:executionView(entry,userId)})
      }
      if(!entry?.challengeId)fail(409,'Retry the original confirmation request to recover its Circle challenge.')
      const challenge=await d.readChallenge({userToken:req.body.circleUserToken,challengeId:entry.challengeId}) as Record<string,unknown>
      if(challenge.id!==entry.challengeId)fail(409,'Circle challenge does not match this action.')
      const providerId=arcTradeProviderReference(challenge,'transactionId')
      if(entry.transactionId&&providerId&&entry.transactionId!==providerId)fail(409,'Circle transaction changed. Contact support.')
      const transactionId=entry.transactionId??providerId
      if(!transactionId){
        if(['FAILED','EXPIRED','CANCELLED','DENIED'].includes(String(challenge.status??'').toUpperCase()))fail(409,'Circle confirmation did not complete. Contact support to review the pending action.')
        return res.json({ok:true,role,fundingEnabled,agreement:view(record),execution:executionView(entry,userId),pending:true})
      }
      entry=await d.journal.recordProviderTransaction({...identity,transactionId})
      const transaction=await d.readTransaction({userToken:req.body.circleUserToken,transactionId}) as Record<string,unknown>
      if(transaction.walletId!==wallet.id||transaction.blockchain!=='ARC'||(transaction.id!==undefined&&transaction.id!==transactionId))fail(409,'Circle transaction does not match this Arc wallet.')
      const transactionHash=arcTradeProviderReference(transaction,'transactionHash') as Hex|undefined
      if(!transactionHash)return res.json({ok:true,role,fundingEnabled,agreement:view(record),execution:executionView(entry,userId),pending:true})
      entry=await d.journal.recordSubmission({...identity,transactionId,transactionHash})
      try{entry=await d.journal.reconcile({...identity,policy,client:d.client()})}
      catch(error){
        const pending=error as {code?:string;name?:string}
        if(pending.code!=='ARC_TRADE_EXECUTION_PENDING'&&!['TransactionNotFoundError','TransactionReceiptNotFoundError'].includes(pending.name??''))throw error
        return res.json({ok:true,role,fundingEnabled,agreement:view(record),execution:executionView(entry,userId),pending:true})
      }
      const next=await observe(record,wallet.address)
      return res.json({ok:true,role,fundingEnabled,agreement:view(next.record),status:{...next.status,transaction:undefined},execution:executionView(entry,userId)})
    }catch(error){return errorResponse(res,error)}
  }
  return {developer,participant}
}
