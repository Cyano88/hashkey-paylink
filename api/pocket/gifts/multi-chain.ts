import {keccak256,parseAbi,parseAbiItem,type PublicClient,type Hex} from 'viem'
import {GiftError,type GiftRecord,type GiftObservation} from './types.js'
import {giftAssetUnits} from '../../../src/pocket/features/gifts/pocketGift.js'
import {verifiedHintLogs} from './event-discovery.js'
const abi=parseAbi(['function gifts(bytes32) view returns(address sender,address token,address claimSigner,uint128 amountPerClaim,uint32 maxClaims,uint32 claimed,uint64 expiresAt,uint8 status)','function treasury() view returns(address)','function claimAuthority() view returns(address)','function supportedToken(address) view returns(bool)','function PLATFORM_FEE_BPS() view returns(uint256)'])
export async function observeMultiGift(client:PublicClient,r:GiftRecord,discover?:(height:bigint)=>Promise<Hex[]>):Promise<GiftObservation>{
 const d=r.deployment,same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase()
 if(r.version!==2||d.protocol!==2||!d.claimAuthority||!d.deploymentBlock||!Number.isSafeInteger(d.confirmations)||d.confirmations<2||await client.getChainId()!==d.chainId)throw new GiftError(503,'Multi-recipient gift deployment is unavailable.')
 const head=await client.getBlockNumber({cacheTime:0}),height=head-BigInt(d.confirmations-1)
 if(height<BigInt(d.deploymentBlock))throw new GiftError(503,'Gift deployment is still confirming.')
 // Cached evidence is trusted only while its canonical ancestor remains unchanged.
 if(r.evidenceScanBlock){
  if(!r.evidenceScanHash||(await client.getBlock({blockNumber:BigInt(r.evidenceScanBlock)})).hash!==r.evidenceScanHash)throw new GiftError(503,'Gift evidence changed and needs reconciliation.')
 }
 const block=await client.getBlock({blockNumber:height})
 const priorVerified=!!r.observedBlock&&!!r.observedBlockHash
 if(priorVerified&&(await client.getBlock({blockNumber:BigInt(r.observedBlock!)})).hash!==r.observedBlockHash)throw new GiftError(503,'Gift evidence changed and needs reconciliation.')
 const [code,treasury,authority,supported,fee,gift]=await Promise.all([client.getCode({address:d.escrow,blockNumber:height}),client.readContract({address:d.escrow,abi,functionName:'treasury',blockNumber:height}),client.readContract({address:d.escrow,abi,functionName:'claimAuthority',blockNumber:height}),client.readContract({address:d.escrow,abi,functionName:'supportedToken',args:[d.token],blockNumber:height}),client.readContract({address:d.escrow,abi,functionName:'PLATFORM_FEE_BPS',blockNumber:height}),client.readContract({address:d.escrow,abi,functionName:'gifts',args:[r.giftId],blockNumber:height})])
 if(!code||keccak256(code)!==d.runtimeHash||!same(treasury,d.treasury)||!same(authority,d.claimAuthority)||!supported||fee!==25n)throw new GiftError(503,'Gift deployment verification failed.')
 const [sender,token,signer,per,count,claimed,expiry,status]=gift
 if(status>3||status!==0&&(!same(sender,r.senderAddress)||!same(token,d.token)||!same(signer,r.claimSigner)||per!==giftAssetUnits(r.amountPerClaim!,r.deployment.asset)||count!==r.maxClaims||claimed>count||expiry!==BigInt(r.expiresAt)))throw new GiftError(503,'Gift does not match its funded details.')
 // An absent gift has no prior events: this contract never resets a gift to status zero.
 if(status===0){if(!block.hash||(await client.getBlock({blockNumber:height})).hash!==block.hash)throw new GiftError(503,'Gift confirmation changed.');return {state:'unfunded',blockNumber:height,blockHash:block.hash,timestamp:block.timestamp,evidenceScanBlock:String(height),evidenceScanHash:block.hash,claimedCount:0,settlements:{},refundUnits:'0'}}
 const span=d.network==='xlayer'?99n:1999n
 const start=r.evidenceScanBlock?BigInt(r.evidenceScanBlock)+1n:BigInt(d.deploymentBlock),fromBlock=start>height?height:start,toBlock=fromBlock+span<height?fromBlock+span:height
 const fundingEvent=parseAbiItem('event GiftFunded(bytes32 indexed giftId,address indexed sender,address indexed token,address claimSigner,uint128 amountPerClaim,uint32 maxClaims,uint256 platformFee,uint64 expiresAt)'),claimEvent=parseAbiItem('event GiftClaimed(bytes32 indexed giftId,bytes32 indexed accountId,address indexed recipient,uint256 amount,uint32 claimed)'),refundEvent=parseAbiItem('event GiftRefunded(bytes32 indexed giftId,address indexed sender,uint256 amount)')
 const result:GiftObservation={state:(['unfunded','available','claimed','refunded'] as const)[status],blockNumber:height,blockHash:block.hash!,timestamp:block.timestamp,evidenceScanBlock:String(toBlock),claimedCount:claimed,settlements:priorVerified?{...r.settlements}:{},refundUnits:String(BigInt(count-claimed)*per),...(priorVerified?{fundingHash:r.fundingHash,fundingAt:r.fundingAt,refundHash:r.refundHash,refundAt:r.refundAt}:{})}
 const complete=()=>!!result.fundingHash&&!!result.fundingAt&&Object.keys(result.settlements||{}).length===claimed&&(status!==3||!!result.refundHash&&!!result.refundAt)
 const verifiedTime=async(log:{removed:boolean;blockNumber:bigint;blockHash:Hex})=>{if(log.removed)throw new GiftError(503,'Gift evidence changed.');const b=await client.getBlock({blockNumber:log.blockNumber});if(b.hash!==log.blockHash)throw new GiftError(503,'Gift evidence changed.');return Number(b.timestamp)*1000}
 const consume=async(funds:any[],claims:any[],refunds:any[])=>{
 for(const l of funds){const a=l.args;if(!same(a.sender,r.senderAddress)||!same(a.token,d.token)||!same(a.claimSigner,r.claimSigner)||a.amountPerClaim!==giftAssetUnits(r.amountPerClaim!,r.deployment.asset)||a.maxClaims!==r.maxClaims||a.platformFee!==BigInt(r.feeUnits)||a.expiresAt!==BigInt(r.expiresAt))throw new GiftError(503,'Gift funding evidence mismatch.');result.fundingAt=await verifiedTime(l);result.fundingHash=l.transactionHash}
 for(const l of claims){if(l.args.amount!==per||l.args.claimed>count)throw new GiftError(503,'Gift claim evidence mismatch.');result.settlements![l.args.accountId]={recipient:l.args.recipient,hash:l.transactionHash,at:await verifiedTime(l)}}
 for(const l of refunds){if(!same(l.args.sender,r.senderAddress)||l.args.amount!==BigInt(result.refundUnits!))throw new GiftError(503,'Gift refund evidence mismatch.');result.refundAt=await verifiedTime(l);result.refundHash=l.transactionHash}
 }
 if(!complete()&&discover){const logs=await verifiedHintLogs(client,r,height,[fundingEvent,claimEvent,refundEvent],await discover(height).catch(()=>[]));await consume(logs.filter(l=>l.eventName==='GiftFunded'),logs.filter(l=>l.eventName==='GiftClaimed'),logs.filter(l=>l.eventName==='GiftRefunded'))}
 if(!complete())await consume(...await Promise.all([client.getLogs({address:d.escrow,event:fundingEvent,args:{giftId:r.giftId},fromBlock,toBlock,strict:true}),client.getLogs({address:d.escrow,event:claimEvent,args:{giftId:r.giftId},fromBlock,toBlock,strict:true}),client.getLogs({address:d.escrow,event:refundEvent,args:{giftId:r.giftId},fromBlock,toBlock,strict:true})]))
 const cursorHeight=complete()?height:toBlock
 const cursor=await client.getBlock({blockNumber:cursorHeight});if(!cursor.hash)throw new GiftError(503,'Gift evidence is not confirmed.');result.evidenceScanBlock=String(cursorHeight);result.evidenceScanHash=cursor.hash
 if(!block.hash||(await client.getBlock({blockNumber:height})).hash!==block.hash)throw new GiftError(503,'Gift confirmation changed.')
 return result
}
