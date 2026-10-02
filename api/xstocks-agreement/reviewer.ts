import type { Request, Response } from 'express'
import { encodeFunctionData, hashTypedData, keccak256, parseAbi, parseUnits, recoverTypedDataAddress, stringToHex, zeroAddress, type Address, type Hex } from 'viem'
import { verifyOperationsSection } from '../operations-access.js'
import { authorizeOperations } from '../operations-policy.js'
import { hasRenderDurableStore, readDurableJson, mutateDurableJson } from '../render-durable-store.js'
import { prepareTradeXLayerAction, tradeXLayerClient } from './planner.js'
import type { XStocksAgreementRecord } from './http.js'
import { listTradeReviewQueue } from './review-queue.js'

const safeAbi=parseAbi(['function getOwners() view returns(address[])','function getThreshold() view returns(uint256)','function nonce() view returns(uint256)','function VERSION() view returns(string)','function getTransactionHash(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,uint256) view returns(bytes32)','function execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes) returns(bool)'])
const resolveAbi=parseAbi(['function resolveDispute(uint256 buyerAmount,bytes32 evidence)'])
export const safeTypes={SafeTx:[{name:'to',type:'address'},{name:'value',type:'uint256'},{name:'data',type:'bytes'},{name:'operation',type:'uint8'},{name:'safeTxGas',type:'uint256'},{name:'baseGas',type:'uint256'},{name:'gasPrice',type:'uint256'},{name:'gasToken',type:'address'},{name:'refundReceiver',type:'address'},{name:'nonce',type:'uint256'}]} as const
type Decision={id:string;agreementId:string;buyerAmount:string;reason:string;preparedBy:string;createdAt:string;digest:Hex;signatures:Record<string,Hex>}
const failure=(message:string,status=409)=>Object.assign(Error(message),{status})
export function reviewerAmount(value:unknown,decimals:number,total:bigint){
  if(typeof value!=='string'||!/^\d+(\.\d+)?$/.test(value)||((value.split('.')[1]||'').length>decimals))throw failure('Enter an exact buyer allocation.',400)
  const amount=parseUnits(value,decimals);if(amount>total)throw failure('Buyer allocation exceeds the held payment.',400);return amount
}
const defaults={verifyAdmin:(req:Request)=>verifyOperationsSection(req,'trade-disputes'),scope:authorizeOperations,list:listTradeReviewQueue,hasStore:hasRenderDurableStore,read:readDurableJson,mutate:mutateDurableJson,client:()=>tradeXLayerClient(process.env),plan:prepareTradeXLayerAction,now:()=>new Date()}
export function createReviewerHandler(overrides:Partial<typeof defaults>={}){
 const d={...defaults,...overrides}
 return async(req:Request,res:Response)=>{
  res.setHeader('Cache-Control','no-store')
  try{
   if(req.method!=='POST')throw failure('Method not allowed.',405)
   const actor=await d.verifyAdmin(req)
   if(!d.hasStore())throw failure('Review storage is unavailable.',503)
   const {agreementId,action}=req.body??{}
   if(action==='list'){
    const {projectIds}=d.scope(actor,req,'trade-disputes')
    const filter=req.body.filter??'disputed',cursor=req.body.cursor??''
    if(!['disputed','all'].includes(filter)||typeof cursor!=='string'||(cursor!==''&&!/^xag_[a-f0-9]{64}$/.test(cursor)))throw failure('Invalid case list request.',400)
    const page=await d.list(projectIds,filter,cursor)
    if(page.items.some(item=>!projectIds.includes(item.projectId)))throw failure('Case scope could not be verified.',503)
    return res.json({ok:true,...page})
   }
   if(typeof agreementId!=='string'||!/^xag_[a-f0-9]{64}$/.test(agreementId))throw failure('Enter a valid Agreement reference.',400)
   if(!['read','prepare','sign','execution'].includes(action))throw failure('Unknown review action.',400)
   const record=await d.read<XStocksAgreementRecord>('hashpaylink:xstocks-agreement:v1:'+agreementId)
   if(!record?.binding||typeof record.partnerId!=='string'||!/^dev_[a-z0-9]{8,64}$/i.test(record.partnerId)||record.terms.kind!=='trade'||record.binding.custody!=='xstocks-shares-v2')throw failure('This is not a supported stock Trade.',404)
   d.scope(actor,req,'trade-disputes',record.partnerId)
   const binding=record.binding,t=binding.contractTerms,client=d.client()
   // The participant planner verifies the factory runtime, registry and every bound term.
   const status=await d.plan({env:{...process.env,HASHPAYLINK_XSTOCKS_AGREEMENT_PLANNER_ENABLED:'true'},binding,account:t.buyer},client)
   if(status.pending||!status.observedBlock||!status.escrow||status.escrow===zeroAddress)throw failure('Payment state is still being confirmed.')
   const safe=t.arbiter,blockNumber=BigInt(status.observedBlock)
   const readSafe=(functionName:'getOwners'|'getThreshold'|'nonce'|'VERSION',block?:bigint)=>client.readContract({address:safe,abi:safeAbi,functionName,blockNumber:block})
   const [ownersRaw,thresholdRaw,nonceRaw,version]=await Promise.all([readSafe('getOwners',blockNumber),readSafe('getThreshold',blockNumber),readSafe('nonce',blockNumber),readSafe('VERSION',blockNumber)])
   const owners=ownersRaw as Address[],threshold=Number(thresholdRaw),nonce=BigInt(nonceRaw as bigint)
   if(version!=='1.5.0'||threshold!==2||owners.length!==2)throw failure('Reviewer configuration requires a new verification before signing.')
   const latest=await Promise.all([readSafe('getOwners'),readSafe('getThreshold'),readSafe('nonce')])
   if(JSON.stringify(latest,(_,v)=>typeof v==='bigint'?v.toString():v)!==JSON.stringify([owners,BigInt(threshold),nonce],(_,v)=>typeof v==='bigint'?v.toString():v))throw failure('Reviewer wallet is changing. Refresh before continuing.')
   const storageKey='hashpaylink:xstocks-review:v1:'+agreementId
   let decision=await d.read<Decision>(storageKey)
   const build=async(value:Pick<Decision,'buyerAmount'|'reason'>)=>{
    if(status.state!==5)throw failure('Only an active dispute can be resolved.')
    const allocation=reviewerAmount(value.buyerAmount,t.decimals,BigInt(t.amount))
    const evidence=keccak256(stringToHex(JSON.stringify({version:1,agreementId,escrow:status.escrow,chainId:196,buyerAmount:allocation.toString(),reason:value.reason})))
    const data=encodeFunctionData({abi:resolveAbi,functionName:'resolveDispute',args:[allocation,evidence]})
    const message={to:status.escrow!,value:0n,data,operation:0,safeTxGas:0n,baseGas:0n,gasPrice:0n,gasToken:zeroAddress,refundReceiver:zeroAddress,nonce}
    const typedData={domain:{chainId:196,verifyingContract:safe},types:safeTypes,primaryType:'SafeTx' as const,message}
    const digest=hashTypedData(typedData)
    const onchain=await client.readContract({address:safe,abi:safeAbi,functionName:'getTransactionHash',args:[message.to,0n,data,0,0n,0n,0n,zeroAddress,zeroAddress,nonce],blockNumber})
    if(onchain!==digest)throw failure('Reviewer transaction hash does not match the wallet.')
    await client.call({account:safe,to:status.escrow,data,value:0n,blockNumber})
    return {typedData,digest,allocation,evidence,data}
   }
   if(action==='prepare'){
    const reason=typeof req.body.reason==='string'?req.body.reason.trim():''
    if(reason.length<10||reason.length>2000)throw failure('Add a decision reason between 10 and 2000 characters.',400)
    const candidate={buyerAmount:req.body.buyerAmount,reason},prepared=await build(candidate)
    decision=await d.mutate<Decision>(storageKey,current=>{
     if(current&&current.digest!==prepared.digest)throw failure('A different decision is already recorded. Review it before changing the resolution.')
     return current??{id:prepared.digest,agreementId,...candidate,preparedBy:actor.userId,createdAt:d.now().toISOString(),digest:prepared.digest,signatures:{}}
    })
   }
   let prepared:Awaited<ReturnType<typeof build>>|undefined,stale=false
   if(decision&&status.state===5){prepared=await build(decision);stale=prepared.digest!==decision.digest}
   if(action==='sign'||action==='execution'){
    if(!decision||!prepared||stale||req.body.decisionId!==decision.id)throw failure('The reviewed decision changed. Refresh before signing.')
    if(action==='sign'){
     const signature=req.body.signature
     if(typeof signature!=='string'||!/^0x[0-9a-f]{130}$/i.test(signature)||!['1b','1c'].includes(signature.slice(-2).toLowerCase()))throw failure('A standard wallet transaction signature is required.',400)
     const owner=(await recoverTypedDataAddress({...prepared.typedData,signature:signature as Hex})).toLowerCase()
     if(!owners.some(a=>a.toLowerCase()===owner))throw failure('The signature is not from a reviewer owner.',403)
     decision=await d.mutate<Decision>(storageKey,current=>{if(!current||current.digest!==prepared!.digest)throw failure('Decision changed.');return {...current,signatures:{...current.signatures,[owner]:signature as Hex}}})
    }else{
     const verified=[] as {owner:string;signature:Hex}[]
     for(const [owner,signature] of Object.entries(decision.signatures)){
      if(!owners.some(a=>a.toLowerCase()===owner)||(await recoverTypedDataAddress({...prepared.typedData,signature})).toLowerCase()!==owner)throw failure('Stored approval is invalid.')
      verified.push({owner,signature})
     }
     if(verified.length!==threshold)throw failure('Both reviewer approvals are required.')
     const executor=String(req.body.executor||'').toLowerCase()
     if(!owners.some(a=>a.toLowerCase()===executor))throw failure('Connect a reviewer owner to execute.',403)
     const signatures=('0x'+verified.sort((a,b)=>a.owner.localeCompare(b.owner)).map(v=>v.signature.slice(2)).join('')) as Hex
     const m=prepared.typedData.message
     const data=encodeFunctionData({abi:safeAbi,functionName:'execTransaction',args:[m.to,0n,m.data,0,0n,0n,0n,zeroAddress,zeroAddress,signatures]})
     const simulation=await client.simulateContract({address:safe,abi:safeAbi,functionName:'execTransaction',args:[m.to,0n,m.data,0,0n,0n,0n,zeroAddress,zeroAddress,signatures],account:executor as Address})
     if(simulation.result!==true)throw failure('Reviewer execution simulation failed.')
     return res.json({ok:true,transaction:{to:safe,data,value:'0x0',chainId:196},decisionId:decision.id})
    }
   }
   const reply={ok:true,agreement:{id:agreementId,title:record.terms.title,terms:record.terms,evidence:record.evidence},status,reviewer:{address:safe,owners,threshold,nonce:nonce.toString()},decision:decision?{id:decision.id,buyerAmount:decision.buyerAmount,reason:decision.reason,createdAt:decision.createdAt,approvedOwners:Object.keys(decision.signatures),stale}:null,typedData:prepared&&!stale?prepared.typedData:undefined}
   return res.json(JSON.parse(JSON.stringify(reply,(_,v)=>typeof v==='bigint'?v.toString():v)))
  }catch(error){const code=Number((error as {status?:number}).status)||503;return res.status(code).json({ok:false,error:code>=500?'Dispute review is temporarily unavailable. Retry after checking the payment status.':(error as Error).message})}
 }
}
export default createReviewerHandler()
