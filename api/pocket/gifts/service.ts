import {createHash,randomBytes,randomUUID} from 'node:crypto'
import {formatUnits,getAddress,isAddress,recoverTypedDataAddress,type Address,type Hex} from 'viem'
import {giftUnits} from '../../../src/pocket/features/gifts/pocketGift.js'
import {giftClaimTypedData} from '../../../src/pocket/features/gifts/pocketGiftSigning.js'
import {prepareGiftFunding} from '../../../src/pocket/features/gifts/pocketGiftFunding.js'
import {GiftError,publicGift,type GiftAttempt,type GiftDeployment,type GiftIdentity,type GiftNetwork,type GiftObservation,type GiftRecord} from './types.js'
import type {GiftStore} from './store.js'
export type GiftDependencies={
 store:GiftStore;now?:()=>number;fundingEnabled?(network:GiftNetwork):boolean;
 deployment(network:GiftNetwork):GiftDeployment|undefined;
 wallet(userId:string,network:GiftNetwork):Promise<{address:Address;id:string}|undefined>;
 readFundingAttempt?(input:{record:GiftRecord;userToken:string}):Promise<{status:'failed'|'pending';txHash?:Hex}>;
 publishReceipts?(record:GiftRecord):Promise<void>;
 observe(record:GiftRecord,receiptHint?:Hex):Promise<GiftObservation>;
 challenge(input:{record:GiftRecord;kind:'funding'|'claim'|'refund';attempt:GiftAttempt;userToken:string;walletId:string}):Promise<{challengeId:string;transactionId:string}>;
}
export function createGiftService(deps:GiftDependencies){
 const now=deps.now??Date.now,seconds=()=>BigInt(Math.floor(now()/1000))
 const get=async(id:string)=>{const r=await deps.store.read(id);if(!r)throw new GiftError(404,'Gift not found.');return r}
 const linked=async(userId:string,network:GiftNetwork)=>{const wallet=await deps.wallet(userId,network);if(!wallet||!isAddress(wallet.address)||!wallet.id)throw new GiftError(409,'Finish setting up your Pocket wallet first.');return {...wallet,address:getAddress(wallet.address)}}
 const refresh=async(id:string,receiptHint?:Hex)=>{
  const before=await get(id),observation=await deps.observe(before,receiptHint)
  const saved=await deps.store.update(id,current=>{
   if(!current)throw new GiftError(404,'Gift not found.')
   if(current.observedBlock&&observation.blockNumber<BigInt(current.observedBlock))return current
   if(current.observedBlock===String(observation.blockNumber)&&current.observedBlockHash&&current.observedBlockHash!==observation.blockHash)throw new GiftError(503,'Gift confirmation changed. Try again shortly.')
   if((current.state==='claimed'||current.state==='refunded')&&current.state!==observation.state)throw new GiftError(503,'Gift confirmation needs reconciliation.')
   return {...current,evidenceScanBlock:observation.evidenceScanBlock&&BigInt(observation.evidenceScanBlock)>BigInt(current.evidenceScanBlock||'0')?observation.evidenceScanBlock:current.evidenceScanBlock,fundingHash:observation.fundingHash??current.fundingHash,fundingAt:observation.fundingAt??current.fundingAt,refundHash:observation.refundHash??current.refundHash,refundAt:observation.refundAt??current.refundAt,settlementAt:observation.settlementAt??current.settlementAt,state:observation.state,claimRecipient:observation.claimRecipient??current.claimRecipient,settlementHash:observation.settlementHash??current.settlementHash,observedBlock:String(observation.blockNumber),observedTimestamp:String(observation.timestamp),observedBlockHash:observation.blockHash,updatedAt:now()}
  })
  await deps.publishReceipts?.(saved)
  return saved
 }
 const authorize=async(identity:GiftIdentity,id:string,kind:'funding'|'claim'|'refund',userToken:string,claim?:{signature:Hex;deadline:string})=>{
  const existing=await get(id)
  if(kind==='funding'&&deps.fundingEnabled&&!deps.fundingEnabled(existing.deployment.network))throw new GiftError(503,'Gift funding is not available yet.')
  const record=await refresh(id),wallet=await linked(identity.userId,record.deployment.network)
  if(kind!=='claim'&&(record.ownerId!==identity.userId||wallet.address.toLowerCase()!==record.senderAddress.toLowerCase()||wallet.id!==record.walletId))throw new GiftError(403,'This gift belongs to another account.')
  if(kind==='funding'?record.state!=='unfunded':record.state!=='available')throw new GiftError(409,'This gift is not available for this action.')
  if(kind==='refund'?BigInt(record.expiresAt)>seconds():BigInt(record.expiresAt)<=seconds())throw new GiftError(409,kind==='refund'?'This gift has not expired.':'This gift has expired.')
  if(kind==='claim'){
   if(!claim||!/^0x[0-9a-fA-F]{130}$/.test(claim.signature)||!/^\d{1,20}$/.test(claim.deadline))throw new GiftError(400,'Invalid gift authorization.')
   const deadline=BigInt(claim.deadline)
   if(deadline<=seconds()||deadline>seconds()+300n||deadline>BigInt(record.expiresAt))throw new GiftError(409,'Refresh your gift authorization.')
   const signer=await recoverTypedDataAddress({...giftClaimTypedData({chainId:record.deployment.chainId,escrow:record.deployment.escrow,giftId:record.giftId,recipient:wallet.address,deadline}),signature:claim.signature}).catch(()=>null)
   if(signer?.toLowerCase()!==record.claimSigner.toLowerCase())throw new GiftError(403,'This gift code does not authorize the claim.')
  }
  let run=false
  const candidate:GiftAttempt={id:randomUUID(),startedAt:now(),userId:identity.userId,walletAddress:wallet.address,phase:'authorizing',...(claim?{signature:claim.signature,deadline:claim.deadline}:{})}
  const saved=await deps.store.update(id,current=>{
   if(!current)throw new GiftError(404,'Gift not found.')
   if(kind==='funding'?current.state!=='unfunded':current.state!=='available')throw new GiftError(409,'This gift is no longer available.')
   const existing=current[kind]
   if(existing&&existing.phase!=='failed'&&!(kind==='claim'&&existing.deadline&&BigInt(current.observedTimestamp??'0')>BigInt(existing.deadline))){
    if(existing.userId!==identity.userId||existing.walletAddress.toLowerCase()!==wallet.address.toLowerCase())throw new GiftError(409,'A gift claim is already awaiting confirmation.')
    if(existing.phase!=='authorization_unknown'&&!(existing.phase==='authorizing'&&now()-existing.startedAt>=30000))return current
    // Retry only the same provider request and bound payload. Never rotate the idempotency key after a timeout.
    if(existing.deadline&&BigInt(existing.deadline)<=seconds())throw new GiftError(409,'Your previous claim needs reconciliation before another attempt.')
    run=true;return {...current,[kind]:{...existing,phase:'authorizing',startedAt:now()},updatedAt:now()}
   }
   run=true;return {...current,[kind]:candidate,updatedAt:now()}
  })
  if(!run)return {gift:publicGift(saved,now()),approval:saved[kind]!}
  const attempt=saved[kind]!
  try{
   const approval=await deps.challenge({record:saved,kind,attempt,userToken,walletId:wallet.id})
   if(!approval.challengeId)throw Error('Missing challenge')
   const next=await deps.store.update(id,current=>{if(!current||current[kind]?.id!==attempt.id)throw new GiftError(409,'Gift authorization changed.');return {...current,[kind]:{...current[kind]!,...approval,phase:'awaiting_approval'},updatedAt:now()}})
   return {gift:publicGift(next,now()),approval:next[kind]!}
  }catch{
   const recovered=await deps.store.update(id,current=>{if(!current||current[kind]?.id!==attempt.id)throw new GiftError(409,'Gift authorization changed.');if(current[kind]?.phase==='awaiting_approval'&&current[kind]?.challengeId)return current;return {...current,[kind]:{...current[kind]!,phase:'authorization_unknown'},updatedAt:now()}})
   if(recovered[kind]?.phase==='awaiting_approval'&&recovered[kind]?.challengeId)return {gift:publicGift(recovered,now()),approval:recovered[kind]!}
   throw new GiftError(503,'Wallet approval could not be confirmed. Retry to recover the same attempt.')
  }
 }
 return {
  async recoverFunding(identity:GiftIdentity,id:string,userToken:string){
   const before=await get(id)
   if(before.ownerId!==identity.userId)throw new GiftError(403,'This gift belongs to another account.')
   const wallet=await linked(identity.userId,before.deployment.network)
   if(wallet.id!==before.walletId||wallet.address.toLowerCase()!==before.senderAddress.toLowerCase())throw new GiftError(403,'Open the original gift wallet.')
   if(!before.funding?.challengeId||!deps.readFundingAttempt)return {retryAllowed:false,gift:publicGift(await refresh(id),now())}
   const provider=await deps.readFundingAttempt({record:before,userToken})
   const record=await refresh(id,provider.txHash)
   if(provider.status!=='failed'||provider.txHash||record.state!=='unfunded'||BigInt(record.expiresAt)<=seconds())return {retryAllowed:false,gift:publicGift(record,now())}
   let retryAllowed=false
   const saved=await deps.store.update(id,current=>{
    if(!current)throw new GiftError(404,'Gift not found.')
    if(current.state!=='unfunded'||current.funding?.id!==before.funding!.id)return current
    retryAllowed=true
    return {...current,funding:{...current.funding,phase:'failed'},updatedAt:now()}
   })
   return {retryAllowed,gift:publicGift(saved,now())}
  },
  configuration(){return {sendEnabled:Boolean(deps.deployment('base'))&&(deps.fundingEnabled?.('base')??true),claimEnabled:Boolean(deps.deployment('base')),network:'base' as const}},
  async ownerStatus(identity:GiftIdentity,id:string){const before=await get(id);if(before.ownerId!==identity.userId)throw new GiftError(403,'This gift belongs to another account.');const record=await refresh(id);return {gift:publicGift(record,now()),fundingExpired:record.state==='unfunded'&&BigInt(record.observedTimestamp||'0')>=BigInt(record.expiresAt),funding:{principal:record.amountUnits,platformFee:record.feeUnits,totalDebit:String(BigInt(record.amountUnits)+BigInt(record.feeUnits))}}},
  async create(identity:GiftIdentity,input:{requestId:string;network:GiftNetwork;amount:string;claimSigner:Address;expiresAt:string;message?:string}){
   if(!['base','arbitrum','arc','ethereum','polygon'].includes(input.network)||typeof input.amount!=='string'||typeof input.claimSigner!=='string'||typeof input.message!=='undefined'&&typeof input.message!=='string')throw new GiftError(400,'Invalid gift details.')
   if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId)||!isAddress(input.claimSigner)||input.claimSigner==='0x0000000000000000000000000000000000000000')throw new GiftError(400,'Invalid gift details.')
   if(deps.fundingEnabled&&!deps.fundingEnabled(input.network))throw new GiftError(503,'Gift funding is not available yet.')
   const deployment=deps.deployment(input.network)
   if(!deployment)throw new GiftError(503,'Gifts are not available on this network yet.')
   if(!/^\d{1,20}$/.test(input.expiresAt))throw new GiftError(400,'Choose a valid expiry.')
   const expiry=BigInt(input.expiresAt)
   if(expiry<=seconds()||expiry>seconds()+30n*86400n)throw new GiftError(400,'Choose an expiry within 30 days.')
   const wallet=await linked(identity.userId,input.network),message=(input.message??'').trim()
   if(message.length>160||/[\u0000-\u0008\u000b-\u001f]/.test(message))throw new GiftError(400,'Keep your message within 160 characters.')
   let amount:string
   try{amount=formatUnits(giftUnits(input.amount),6)}catch{throw new GiftError(400,'Enter a valid USDC gift amount.')}
   const id='g_'+createHash('sha256').update(JSON.stringify([identity.userId,input.requestId.toLowerCase()])).digest('base64url').slice(0,22)
   const binding=createHash('sha256').update(JSON.stringify([deployment,wallet,amount,input.claimSigner.toLowerCase(),input.expiresAt,message])).digest('hex')
   const salt=('0x'+randomBytes(32).toString('hex')) as Hex
   const plan=prepareGiftFunding({sender:wallet.address,escrow:deployment.escrow,token:deployment.token,claimSigner:input.claimSigner,salt,amount,expiresAt:expiry,now:seconds()})
   const handle=/^[a-z0-9]{3,20}$/i.test(identity.handle)?'@'+identity.handle:'A Pocket user'
   const record=await deps.store.update(id,current=>{
    if(current){if(current.ownerId!==identity.userId||current.binding!==binding)throw new GiftError(409,'This gift attempt already has different details.');return current}
    return {version:1,id,binding,ownerId:identity.userId,senderHandle:handle,senderAddress:wallet.address,walletId:wallet.id,deployment,giftId:plan.giftId,salt,claimSigner:getAddress(input.claimSigner),amount,amountUnits:String(plan.principal),feeUnits:String(plan.platformFee),expiresAt:input.expiresAt,message,state:'unfunded',createdAt:now(),updatedAt:now()}
   })
   return {gift:publicGift(record,now()),funding:{principal:record.amountUnits,platformFee:record.feeUnits,totalDebit:String(BigInt(record.amountUnits)+BigInt(record.feeUnits))}}
  },
  async view(id:string){return publicGift(await refresh(id),now())},
  async claimDetails(identity:GiftIdentity,id:string){const record=await refresh(id);if(record.state!=='available'||BigInt(record.expiresAt)<=seconds())throw new GiftError(409,'This gift is not available to claim.');const wallet=await linked(identity.userId,record.deployment.network);return {chainId:record.deployment.chainId,escrow:record.deployment.escrow,giftId:record.giftId,recipient:wallet.address,deadline:String(BigInt(record.expiresAt)<seconds()+300n?BigInt(record.expiresAt):seconds()+300n)}},
  async claimStatus(identity:GiftIdentity,id:string,receiptHint?:Hex){
   if(receiptHint&&!/^0x[0-9a-fA-F]{64}$/.test(receiptHint))throw new GiftError(400,'Invalid transaction reference.')
   const record=await refresh(id,receiptHint),wallet=await linked(identity.userId,record.deployment.network)
   if(record.state==='claimed')return {status:record.claimRecipient?(record.claimRecipient.toLowerCase()===wallet.address.toLowerCase()?'confirmed':'claimed_elsewhere'):'confirming',transactionHash:record.claimRecipient?.toLowerCase()===wallet.address.toLowerCase()?record.settlementHash:undefined}
   return {status:publicGift(record,now()).status}
  },
  authorize,refresh,
 }
}
