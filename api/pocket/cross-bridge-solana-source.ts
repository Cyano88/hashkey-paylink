import {solanaBridgeLamports} from './cross-bridge-solana-native.js'
import {Connection,PublicKey,Transaction} from '@solana/web3.js'
import bs58 from 'bs58'
import {getRpc} from '../relay-solana.js'
import {CROSS_BRIDGE_SOLANA_GENESIS} from './cross-bridge-solana-transaction.js'
import type {openCrossBridgeReview} from './cross-bridge-review.js'
type Review=Awaited<ReturnType<typeof openCrossBridgeReview>>
const fail=():never=>{throw Error('Solana bridge source is still being verified.')}
export function validateCrossBridgeSolanaTransaction(review:Review,prepared:string,raw:string,complete:boolean){
 if(review.quote.input.source!=='solana'||review.charged.plan.kind!=='solana')return fail()
 const decode=(value:string)=>{if(typeof value!=='string'||value.length>2400)return fail();const bytes=Buffer.from(value,'base64');if(bytes.length>1232||bytes.toString('base64')!==value)return fail();return Transaction.from(bytes)}
 const approved=decode(prepared),tx=decode(raw),owner=new PublicKey(review.quote.input.sender)
 if(!approved.feePayer||approved.feePayer.equals(owner)||!approved.recentBlockhash)return fail()
 const expected=new Transaction({feePayer:approved.feePayer,recentBlockhash:approved.recentBlockhash}).add(...review.charged.plan.instructions)
 if(!approved.serializeMessage().equals(expected.serializeMessage())||!tx.serializeMessage().equals(approved.serializeMessage())||approved.signatures.length!==2||!approved.signatures[0].signature||!approved.signatures[1].publicKey.equals(owner)||approved.signatures[1].signature)return fail()
 if(!approved.verifySignatures(false)||!tx.verifySignatures(complete)||!tx.signatures[0].signature?.equals(approved.signatures[0].signature))return fail()
 return tx
}
type SourceRpc=Pick<Connection,'getGenesisHash'|'getTransaction'|'getSlot'|'getBlockSignatures'>
export async function readCrossBridgeSolanaSource(review:Review,hash:string,prepared:string,signed:string,rpc:SourceRpc=new Connection(getRpc(),'finalized')){
 const tx=validateCrossBridgeSolanaTransaction(review,prepared,signed,true),plan=review.charged.plan
 if(plan.kind!=='solana'||!tx.signature||bs58.encode(tx.signature)!==hash||await rpc.getGenesisHash()!==CROSS_BRIDGE_SOLANA_GENESIS)return fail()
 const options={commitment:'finalized' as const,maxSupportedTransactionVersion:0},receipt=await rpc.getTransaction(hash,options)
 if(!receipt?.meta||!Number.isSafeInteger(receipt.slot)||receipt.slot<0||receipt.transaction.signatures[0]!==hash||!Buffer.from(receipt.transaction.message.serialize()).equals(tx.serializeMessage()))return fail()
 const finalized=await rpc.getSlot('finalized'),block=await rpc.getBlockSignatures(receipt.slot,'finalized')
 const includes=(b:typeof block)=>b&&new PublicKey(b.blockhash).toBase58()===b.blockhash&&b.signatures.filter(s=>s===hash).length===1
 if(!Number.isSafeInteger(finalized)||finalized<receipt.slot||!includes(block))return fail()
 const [again,blockAgain]=await Promise.all([rpc.getTransaction(hash,options),rpc.getBlockSignatures(receipt.slot,'finalized')])
 if(await rpc.getGenesisHash()!==CROSS_BRIDGE_SOLANA_GENESIS||!again||JSON.stringify(again)!==JSON.stringify(receipt)||!includes(blockAgain)||blockAgain!.blockhash!==block!.blockhash)return fail()
 if(receipt.meta.err)return 'failed' as const
 const keys=receipt.transaction.message.getAccountKeys(),owner=review.quote.input.sender,ownerIndex=Array.from({length:keys.length},(_,i)=>keys.get(i)?.toBase58()).indexOf(owner)
 if(ownerIndex<0)return fail()
 if(review.route.tokenIn.native){
  const vault=plan.instructions[0].keys[3].pubkey.toBase58(),fee=review.quote.reimbursementRecipient,payer=tx.feePayer!.toBase58()
  if(new Set([owner,vault,fee]).size!==3||payer===owner||payer===vault)return fail()
  const cost=solanaBridgeLamports(receipt.meta.fee)
  if(cost<=0n)return fail()
  for(const address of new Set([owner,vault,fee,payer])){
   const index=Array.from({length:keys.length},(_,i)=>keys.get(i)?.toBase58()).indexOf(address)
   if(index<0)return fail()
   const expected=(address===owner?-review.charged.totalUnits:0n)+(address===vault?BigInt(review.quote.input.amountUnits):0n)+(address===fee?BigInt(review.quote.reimbursementUnits):0n)-(address===payer?cost:0n)
   if(solanaBridgeLamports(receipt.meta.postBalances[index])-solanaBridgeLamports(receipt.meta.preBalances[index])!==expected)return fail()
  }
  return 'confirmed' as const
 }
 if(receipt.meta.preBalances[ownerIndex]!==receipt.meta.postBalances[ownerIndex])return fail()
 const expected=[{address:plan.instructions[0].keys[5].pubkey.toBase58(),owner,delta:-review.charged.totalUnits},{address:plan.instructions[0].keys[6].pubkey.toBase58(),owner:plan.instructions[0].keys[3].pubkey.toBase58(),delta:BigInt(review.quote.input.amountUnits)},{address:plan.instructions[1].keys[2].pubkey.toBase58(),owner:review.quote.reimbursementRecipient,delta:BigInt(review.quote.reimbursementUnits)}]
 for(const item of expected){
  const amount=(rows:typeof receipt.meta.preTokenBalances)=>{
   const matches=rows?.filter(row=>keys.get(row.accountIndex)?.toBase58()===item.address)
   if(matches?.length!==1)return fail();const row=matches[0]
   if(row.owner!==item.owner||row.mint!==review.route.tokenIn.address||row.uiTokenAmount.decimals!==6||!/^\d{1,20}$/.test(row.uiTokenAmount.amount))return fail()
   return BigInt(row.uiTokenAmount.amount)
  }
  if(amount(receipt.meta.postTokenBalances)-amount(receipt.meta.preTokenBalances)!==item.delta)return fail()
 }
 return 'confirmed' as const
}
