import {keccak256,parseAbi,parseAbiItem,decodeEventLog,type Hex,type PublicClient} from 'viem'
import {GiftError,type GiftRecord,type GiftObservation} from './types.js'
const abi=parseAbi([
 'function gifts(bytes32) view returns(address sender,address claimSigner,uint128 amount,uint64 expiresAt,uint8 status)',
 'function usdc() view returns(address)','function treasury() view returns(address)','function PLATFORM_FEE_BPS() view returns(uint256)',
])
export async function observeGift(client:PublicClient,record:GiftRecord,receiptHint?:Hex):Promise<GiftObservation>{
 const d=record.deployment
 if(!Number.isSafeInteger(d.confirmations)||d.confirmations<1)throw new GiftError(503,'Gift network verification is unavailable.')
 if(await client.getChainId()!==d.chainId)throw new GiftError(503,'Gift network verification is unavailable.')
 const head=await client.getBlockNumber({cacheTime:0}),blockNumber=head-BigInt(d.confirmations-1)
 if(blockNumber<0n)throw new GiftError(503,'Gift confirmation is not available yet.')
 const block=await client.getBlock({blockNumber})
 const [code,token,treasury,bps,gift]=await Promise.all([
  client.getCode({address:d.escrow,blockNumber}),
  client.readContract({address:d.escrow,abi,functionName:'usdc',blockNumber}),
  client.readContract({address:d.escrow,abi,functionName:'treasury',blockNumber}),
  client.readContract({address:d.escrow,abi,functionName:'PLATFORM_FEE_BPS',blockNumber}),
  client.readContract({address:d.escrow,abi,functionName:'gifts',args:[record.giftId],blockNumber}),
 ])
 const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase()
 if(!code||keccak256(code)!==d.runtimeHash||!same(token,d.token)||!same(treasury,d.treasury)||bps!==25n)throw new GiftError(503,'Gift contract verification failed.')
 const [sender,signer,amount,expiresAt,status]=gift
 if(status>3)throw new GiftError(503,'Gift state is invalid.')
 if(status!==0&&(!same(sender,record.senderAddress)||!same(signer,record.claimSigner)||amount!==BigInt(record.amountUnits)||expiresAt!==BigInt(record.expiresAt)))throw new GiftError(503,'Gift funding does not match its details.')
 let claimRecipient: GiftObservation['claimRecipient'], settlementHash:Hex|undefined
 if(status===2){
  const event=parseAbiItem('event GiftClaimed(bytes32 indexed giftId,address indexed recipient,uint256 amount)')
  const logs=await client.getLogs({address:d.escrow,event,args:{giftId:record.giftId},fromBlock:blockNumber>1999n?blockNumber-1999n:0n,toBlock:blockNumber,strict:true})
  const match=logs.find(log=>log.args.amount===BigInt(record.amountUnits)&&!log.removed)
  if(match){const mined=await client.getBlock({blockNumber:match.blockNumber});if(mined.hash===match.blockHash){claimRecipient=match.args.recipient;settlementHash=match.transactionHash}}
  if(!claimRecipient&&receiptHint){
   const receipt=await client.getTransactionReceipt({hash:receiptHint}).catch(()=>undefined)
   if(receipt?.status==='success'&&receipt.blockNumber<=blockNumber){
    const mined=await client.getBlock({blockNumber:receipt.blockNumber})
    if(mined.hash===receipt.blockHash)for(const log of receipt.logs){
     if(!same(log.address,d.escrow))continue
     try{const decoded=decodeEventLog({abi:[event],data:log.data,topics:log.topics});if(decoded.args.giftId===record.giftId&&decoded.args.amount===BigInt(record.amountUnits)){claimRecipient=decoded.args.recipient;settlementHash=receipt.transactionHash}}catch{/* Other contract events. */}
    }
   }
  }
 }
 // Detect a reorg across the individual RPC reads before accepting this snapshot.
 const current=await client.getBlock({blockNumber})
 if(!block.hash||current.hash!==block.hash)throw new GiftError(503,'Gift confirmation changed. Try again shortly.')
 return {state:(['unfunded','available','claimed','refunded'] as const)[status],blockNumber,blockHash:block.hash,timestamp:block.timestamp,claimRecipient,settlementHash}
}
