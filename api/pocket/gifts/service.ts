import {multiGiftClaimTypedData,prepareMultiGiftFunding} from '../../../src/pocket/features/gifts/pocketMultiGift.js'
import {createHash,randomBytes,randomUUID} from 'node:crypto'
import {formatUnits,getAddress,isAddress,recoverTypedDataAddress,type Address,type Hex} from 'viem'
import {giftUnits,giftAssetUnits} from '../../../src/pocket/features/gifts/pocketGift.js'
import {giftClaimTypedData} from '../../../src/pocket/features/gifts/pocketGiftSigning.js'
import {prepareGiftFunding} from '../../../src/pocket/features/gifts/pocketGiftFunding.js'
import {GiftError,publicGift,type GiftAttempt,type GiftDeployment,type GiftIdentity,type GiftNetwork,type GiftObservation,type GiftRecord} from './types.js'
import type {GiftStore} from './store.js'
export type GiftDependencies={
 stockAssets?(identity?:GiftIdentity):import('../../../src/pocket/features/gifts/pocketMultiGift.js').MultiGiftAsset[];
 stockClaimEnabled?():boolean;
 store:GiftStore;now?:()=>number;fundingEnabled?(network:GiftNetwork,identity?:GiftIdentity,amount?:string):boolean;
 accountId?(giftId:Hex,userId:string):Hex;
 signAccountClaim?(data:ReturnType<typeof multiGiftClaimTypedData>):Promise<Hex>;
 deployment(network:GiftNetwork,claims?:number,token?:string):GiftDeployment|undefined;
 wallet(userId:string,network:GiftNetwork):Promise<{address:Address;id:string}|undefined>;
 readFundingAttempt?(input:{record:GiftRecord;userToken:string}):Promise<{status:'failed'|'pending';txHash?:Hex}>;
 publishReceipts?(record:GiftRecord):Promise<void>;
 observe(record:GiftRecord,receiptHint?:Hex):Promise<GiftObservation>;
 challenge(input:{record:GiftRecord;kind:'funding'|'claim'|'refund';attempt:GiftAttempt;userToken:string;walletId:string}):Promise<{challengeId:string;transactionId:string;execution?:GiftAttempt['execution']}>;
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
   return {...current,...(current.deployment.accounting==='shares-v1'?{currentAmountPerClaim:observation.currentAmountPerClaim??current.currentAmountPerClaim,fundedUnits:observation.fundedUnits??current.fundedUnits,fundedFeeUnits:observation.fundedFeeUnits??current.fundedFeeUnits}:{}),...(current.version===2?{claimedCount:observation.claimedCount,refundUnits:observation.refundUnits,settlements:{...current.settlements,...observation.settlements}}:{}),evidenceScanHash:observation.evidenceScanBlock&&BigInt(observation.evidenceScanBlock)>BigInt(current.evidenceScanBlock||'0')?observation.evidenceScanHash:current.evidenceScanHash,evidenceScanBlock:observation.evidenceScanBlock&&BigInt(observation.evidenceScanBlock)>BigInt(current.evidenceScanBlock||'0')?observation.evidenceScanBlock:current.evidenceScanBlock,fundingHash:observation.fundingHash??current.fundingHash,fundingAt:observation.fundingAt??current.fundingAt,refundHash:observation.refundHash??current.refundHash,refundAt:observation.refundAt??current.refundAt,settlementAt:observation.settlementAt??current.settlementAt,state:observation.state,claimRecipient:observation.claimRecipient??current.claimRecipient,settlementHash:observation.settlementHash??current.settlementHash,observedBlock:String(observation.blockNumber),observedTimestamp:String(observation.timestamp),observedBlockHash:observation.blockHash,updatedAt:now()}
  })
  await deps.publishReceipts?.(saved)
  return saved
 }
 const authorize=async(identity:GiftIdentity,id:string,kind:'funding'|'claim'|'refund',userToken:string,claim?:{signature:Hex;deadline:string})=>{
  const existing=await get(id)
  const accountId=existing.version===2&&kind==='claim'?deps.accountId?.(existing.giftId,identity.userId):undefined
  if(existing.version===2&&kind==='claim'&&(!accountId||!deps.signAccountClaim))throw new GiftError(503,'Gift claim authorization unavailable.')
  const attemptOf=(r:GiftRecord)=>accountId?r.claims?.[accountId]:r[kind]
  const withAttempt=(r:GiftRecord,a:GiftAttempt):GiftRecord=>accountId?{...r,claims:{...r.claims,[accountId]:a}}:{...r,[kind]:a}
  if(existing.discardedAt)throw new GiftError(409,'This draft was deleted. Create a new gift.')
  if(kind==='funding'&&deps.fundingEnabled&&!deps.fundingEnabled(existing.deployment.network,identity,existing.amount))throw new GiftError(503,'Gift funding is not available yet.')
  if(kind==='funding'&&existing.deployment.network==='xlayer'){const active=deps.deployment('xlayer',existing.maxClaims,existing.deployment.token);if(!active||active.accounting==='shares-v1'&&active.escrow.toLowerCase()!==existing.deployment.escrow.toLowerCase())throw new GiftError(409,'Create a new stock gift to use the updated contract.')}
  const record=await refresh(id),wallet=await linked(identity.userId,record.deployment.network)
  if(kind!=='claim'&&(record.ownerId!==identity.userId||wallet.address.toLowerCase()!==record.senderAddress.toLowerCase()||wallet.id!==record.walletId))throw new GiftError(403,'This gift belongs to another account.')
  if(kind==='funding'?record.state!=='unfunded':record.state!=='available')throw new GiftError(409,'This gift is not available for this action.')
  if(kind==='refund'?BigInt(record.expiresAt)>seconds():BigInt(record.expiresAt)<=seconds())throw new GiftError(409,kind==='refund'?'This gift has not expired.':'This gift has expired.')
  if(kind==='claim'){
   if(accountId&&record.settlements?.[accountId])throw new GiftError(409,'You already claimed this gift.')
   if(!claim||!/^0x[0-9a-fA-F]{130}$/.test(claim.signature)||!/^\d{1,20}$/.test(claim.deadline))throw new GiftError(400,'Invalid gift authorization.')
   const deadline=BigInt(claim.deadline)
   if(deadline<=seconds()||deadline>seconds()+300n||deadline>BigInt(record.expiresAt))throw new GiftError(409,'Refresh your gift authorization.')
   const signer=await (record.version===2?recoverTypedDataAddress({...multiGiftClaimTypedData({chainId:record.deployment.chainId,escrow:record.deployment.escrow,giftId:record.giftId,recipient:wallet.address,deadline,accountId:accountId!}),signature:claim.signature}):recoverTypedDataAddress({...giftClaimTypedData({chainId:record.deployment.chainId,escrow:record.deployment.escrow,giftId:record.giftId,recipient:wallet.address,deadline}),signature:claim.signature})).catch(()=>null)
   if(signer?.toLowerCase()!==record.claimSigner.toLowerCase())throw new GiftError(403,'This gift code does not authorize the claim.')
  }
  let run=false
  const candidate:GiftAttempt={id:randomUUID(),startedAt:now(),userId:identity.userId,walletAddress:wallet.address,phase:'authorizing',...(accountId?{accountId}:{}),...(claim?{signature:claim.signature,deadline:claim.deadline}:{})}
  const saved=await deps.store.update(id,current=>{
   if(!current)throw new GiftError(404,'Gift not found.')
   if(current.discardedAt)throw new GiftError(409,'This draft was deleted. Create a new gift.')
   if(kind==='funding'?current.state!=='unfunded':current.state!=='available')throw new GiftError(409,'This gift is no longer available.')
   if(accountId&&current.settlements?.[accountId])throw new GiftError(409,'You already claimed this gift.')
   const existing=attemptOf(current)
   if(existing&&existing.phase!=='failed'&&!(kind==='claim'&&existing.deadline&&BigInt(current.observedTimestamp??'0')>BigInt(existing.deadline))){
    if(existing.userId!==identity.userId||existing.walletAddress.toLowerCase()!==wallet.address.toLowerCase())throw new GiftError(409,'A gift claim is already awaiting confirmation.')
    if(existing.phase!=='authorization_unknown'&&!(existing.phase==='authorizing'&&now()-existing.startedAt>=30000))return current
    // Retry only the same provider request and bound payload. Never rotate the idempotency key after a timeout.
    if(existing.deadline&&BigInt(existing.deadline)<=seconds())throw new GiftError(409,'Your previous claim needs reconciliation before another attempt.')
    run=true;return {...withAttempt(current,{...existing,phase:'authorizing',startedAt:now()}),updatedAt:now()}
   }
   run=true;return {...withAttempt(current,candidate),updatedAt:now()}
  })
  if(!run)return {gift:publicGift(saved,now()),approval:attemptOf(saved)!}
  const attempt=attemptOf(saved)!
  try{
   if(accountId&&!attempt.accountSignature)attempt.accountSignature=await deps.signAccountClaim!(multiGiftClaimTypedData({chainId:record.deployment.chainId,escrow:record.deployment.escrow,giftId:record.giftId,accountId,recipient:wallet.address,deadline:BigInt(attempt.deadline!)}))
   if(accountId)await deps.store.update(id,current=>{if(!current||attemptOf(current)?.id!==attempt.id)throw new GiftError(409,'Gift authorization changed.');return withAttempt(current,{...attemptOf(current)!,accountSignature:attempt.accountSignature})})
   const approval=await deps.challenge({record:saved,kind,attempt,userToken,walletId:wallet.id})
   if(!approval.challengeId)throw Error('Missing challenge')
   const next=await deps.store.update(id,current=>{if(!current||attemptOf(current)?.id!==attempt.id)throw new GiftError(409,'Gift authorization changed.');return {...withAttempt(current,{...attemptOf(current)!,...approval,phase:'awaiting_approval'}),updatedAt:now()}})
   return {gift:publicGift(next,now()),approval:attemptOf(next)!}
  }catch{
   const recovered=await deps.store.update(id,current=>{if(!current||attemptOf(current)?.id!==attempt.id)throw new GiftError(409,'Gift authorization changed.');if(attemptOf(current)?.phase==='awaiting_approval'&&attemptOf(current)?.challengeId)return current;return {...withAttempt(current,{...attemptOf(current)!,phase:'authorization_unknown'}),updatedAt:now()}})
   if(attemptOf(recovered)?.phase==='awaiting_approval'&&attemptOf(recovered)?.challengeId)return {gift:publicGift(recovered,now()),approval:attemptOf(recovered)!}
   throw new GiftError(503,'Wallet approval could not be confirmed. Retry to recover the same attempt.')
  }
 }
 return {
  async discardDraft(identity:GiftIdentity,id:string){
   const before=await get(id);if(before.ownerId!==identity.userId)throw new GiftError(403,'This gift belongs to another account.')
   await refresh(id)
   await deps.store.update(id,current=>{if(!current||current.ownerId!==identity.userId)throw new GiftError(403,'This gift belongs to another account.');if(current.state!=='unfunded'||current.fundingHash||current.funding)throw new GiftError(409,'This gift cannot be deleted. Check its payment status.');return {...current,discardedAt:current.discardedAt||now(),updatedAt:now()}})
   return {deleted:true}
  },
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
  configuration(identity?:GiftIdentity){return {stockAssets:deps.stockAssets?.(identity)||[],stockClaimEnabled:deps.stockClaimEnabled?.()??false,stockMaxRecipients:deps.accountId&&deps.signAccountClaim?1000:1,sendEnabled:Boolean(deps.deployment('base'))&&(deps.fundingEnabled?.('base',identity)??true),claimEnabled:Boolean(deps.deployment('base')),network:'base' as const,maxRecipients:deps.deployment('base',2)&&deps.accountId&&deps.signAccountClaim?1000:1}},
  async ownerStatus(identity:GiftIdentity,id:string){const before=await get(id);if(before.ownerId!==identity.userId)throw new GiftError(403,'This gift belongs to another account.');const record=await refresh(id);return {proof:{funding:record.fundingHash,refund:record.refundHash},canDelete:record.state==='unfunded'&&!record.funding&&!record.fundingHash,createdAt:record.createdAt,gift:publicGift(record,now()),fundingExpired:record.state==='unfunded'&&BigInt(record.observedTimestamp||'0')>=BigInt(record.expiresAt),funding:{principal:record.amountUnits,platformFee:record.feeUnits,totalDebit:String(BigInt(record.amountUnits)+BigInt(record.feeUnits))}}},
  async create(identity:GiftIdentity,input:{requestId:string;network:GiftNetwork;amount:string;claimSigner:Address;expiresAt:string;message?:string;claims?:string;token?:string}){
   if(!['base','arbitrum','arc','ethereum','polygon','xlayer'].includes(input.network)||typeof input.amount!=='string'||typeof input.claimSigner!=='string'||typeof input.message!=='undefined'&&typeof input.message!=='string')throw new GiftError(400,'Invalid gift details.')
   if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId)||!isAddress(input.claimSigner)||input.claimSigner==='0x0000000000000000000000000000000000000000')throw new GiftError(400,'Invalid gift details.')
   if(deps.fundingEnabled&&!deps.fundingEnabled(input.network,identity,input.amount))throw new GiftError(503,'Gift funding is not available yet.')
   const count=input.claims===undefined?1:Number(input.claims)
   if(!Number.isSafeInteger(count)||count<1||count>1000)throw new GiftError(400,'Choose between 1 and 1,000 recipients.')
   const deployment=deps.deployment(input.network,count,input.token)
   if((count>1||input.network==='xlayer')&&(!deployment||deployment.protocol!==2||!deps.accountId||!deps.signAccountClaim))throw new GiftError(503,'Multi-recipient gifts are not enabled yet.')
   if(!deployment)throw new GiftError(503,'Gifts are not available on this network yet.')
   if(!/^\d{1,20}$/.test(input.expiresAt))throw new GiftError(400,'Choose a valid expiry.')
   const expiry=BigInt(input.expiresAt)
   if(expiry<=seconds()||expiry>seconds()+30n*86400n)throw new GiftError(400,'Choose an expiry within 30 days.')
   if(input.network==='xlayer'&&(!deployment.asset||deployment.asset.rail!=='xstocks'||deployment.asset.chainId!==196||deployment.asset.token.toLowerCase()!==input.token?.toLowerCase()))throw new GiftError(400,'Choose a supported stock.');
   const asset=deployment.asset,decimals=asset?.decimals??6,isMulti=deployment.protocol===2
   const wallet=await linked(identity.userId,input.network),message=(input.message??'').trim()
   if(message.length>160||/[\u0000-\u0008\u000b-\u001f]/.test(message))throw new GiftError(400,'Keep your message within 160 characters.')
   let amount:string
   try{amount=formatUnits(giftAssetUnits(input.amount,asset),decimals)}catch{throw new GiftError(400,'Enter a valid gift quantity.')}
   const id='g_'+createHash('sha256').update(JSON.stringify([identity.userId,input.requestId.toLowerCase()])).digest('base64url').slice(0,22)
   const binding=createHash('sha256').update(JSON.stringify(count===1?[deployment,wallet,amount,input.claimSigner.toLowerCase(),input.expiresAt,message]:[deployment,wallet,amount,input.claimSigner.toLowerCase(),input.expiresAt,message,count])).digest('hex')
   const salt=('0x'+randomBytes(32).toString('hex')) as Hex
   if(giftAssetUnits(amount,asset)%BigInt(count)!==0n)throw new GiftError(400,'Gift amount must divide equally between recipients.')
   const perClaim=formatUnits(giftAssetUnits(amount,asset)/BigInt(count),decimals)
   const plan=isMulti?(()=>{const p=prepareMultiGiftFunding({sender:wallet.address,escrow:deployment.escrow,asset:asset||{chainId:deployment.chainId,token:deployment.token,decimals:6,symbol:'USDC',rail:'stablecoins'},signer:input.claimSigner,salt,amountPerRecipient:perClaim,recipients:count,expiresAt:expiry,now:seconds()});return {...p,platformFee:p.fee}})():prepareGiftFunding({sender:wallet.address,escrow:deployment.escrow,token:deployment.token,claimSigner:input.claimSigner,salt,amount,expiresAt:expiry,now:seconds()})
   const handle=/^[a-z0-9]{3,20}$/i.test(identity.handle)?'@'+identity.handle:'A Pocket user'
   const record=await deps.store.update(id,current=>{
    if(current){if(current.discardedAt)throw new GiftError(409,'This draft was deleted. Create a new gift.');if(current.ownerId!==identity.userId||current.binding!==binding)throw new GiftError(409,'This gift attempt already has different details.');return current}
    return {version:isMulti?2:1,...(isMulti?{maxClaims:count,amountPerClaim:perClaim,claims:{},settlements:{},claimedCount:0}:{}),id,binding,ownerId:identity.userId,senderHandle:handle,senderAddress:wallet.address,walletId:wallet.id,deployment,giftId:plan.giftId,salt,claimSigner:getAddress(input.claimSigner),amount,amountUnits:String(plan.principal),feeUnits:String(plan.platformFee),expiresAt:input.expiresAt,message,state:'unfunded',createdAt:now(),updatedAt:now()}
   })
   return {gift:publicGift(record,now()),funding:{principal:record.amountUnits,platformFee:record.feeUnits,totalDebit:String(BigInt(record.amountUnits)+BigInt(record.feeUnits))}}
  },
  async view(id:string){return publicGift(await refresh(id),now())},
  async claimDetails(identity:GiftIdentity,id:string){const record=await refresh(id);if(record.state!=='available'||BigInt(record.expiresAt)<=seconds())throw new GiftError(409,'This gift is not available to claim.');const wallet=await linked(identity.userId,record.deployment.network);return {chainId:record.deployment.chainId,escrow:record.deployment.escrow,giftId:record.giftId,recipient:wallet.address,...(record.version===2?{version:2,accountId:deps.accountId!(record.giftId,identity.userId)}:{}),deadline:String(BigInt(record.expiresAt)<seconds()+300n?BigInt(record.expiresAt):seconds()+300n)}},
  async claimStatus(identity:GiftIdentity,id:string,receiptHint?:Hex){
   if(receiptHint&&!/^0x[0-9a-fA-F]{64}$/.test(receiptHint))throw new GiftError(400,'Invalid transaction reference.')
   const record=await refresh(id,receiptHint),wallet=await linked(identity.userId,record.deployment.network)
   if(record.version===2){const account=deps.accountId!(record.giftId,identity.userId),settled=record.settlements?.[account];if(settled)return {status:'confirmed',transactionHash:settled.hash};if(Object.keys(record.settlements||{}).length!==(record.claimedCount||0))return {status:'confirming'};if(record.state==='claimed')return {status:'claimed_elsewhere'};const attempt=record.claims?.[account];return {status:publicGift(record,now()).status,retryAllowed:!!attempt?.deadline&&BigInt(record.observedTimestamp||'0')>BigInt(attempt.deadline)&&BigInt(record.observedTimestamp||'0')<BigInt(record.expiresAt)}}
   if(record.state==='claimed')return {status:record.claimRecipient?(record.claimRecipient.toLowerCase()===wallet.address.toLowerCase()?'confirmed':'claimed_elsewhere'):'confirming',transactionHash:record.claimRecipient?.toLowerCase()===wallet.address.toLowerCase()?record.settlementHash:undefined}
   const status=publicGift(record,now()).status
   const retryAllowed=status==='available'&&record.claim?.userId===identity.userId&&record.claim.walletAddress.toLowerCase()===wallet.address.toLowerCase()&&!!record.claim.deadline&&!!record.observedTimestamp&&BigInt(record.observedTimestamp)>BigInt(record.claim.deadline)&&BigInt(record.observedTimestamp)<BigInt(record.expiresAt)
   return {status,retryAllowed}
  },
  authorize,refresh,
 }
}
