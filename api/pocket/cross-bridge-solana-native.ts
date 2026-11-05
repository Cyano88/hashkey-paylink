import type {openCrossBridgeReview} from './cross-bridge-review.js'
import {checkSolanaRelayerBalance} from './solana-relayer-fees.js'
import {PublicKey,SystemProgram,TransactionInstruction,Transaction,VersionedTransaction,type Connection,type Keypair,type AccountInfo} from '@solana/web3.js'
import type {Hex} from 'viem'
import {RELAY_BSC_CHAINS} from './bsc-bridge-provider.js'
/** Pinned settlement-sdk 0.0.146 deposit_native IDL. Never accept provider-selected accounts. */
export function crossBridgeSolanaNativeDeposit(sender:string,amount:bigint,orderId:Hex){
 if(amount<=0n||amount>=2n**64n||!/^0x[0-9a-f]{64}$/i.test(orderId))throw Error('Invalid SOL deposit.')
 const program=new PublicKey(RELAY_BSC_CHAINS.solana.depository),owner=new PublicKey(sender)
 const config=PublicKey.findProgramAddressSync([Buffer.from('relay_depository')],program)[0],vault=PublicKey.findProgramAddressSync([Buffer.from('vault')],program)[0]
 const keys=[config,owner,owner,vault,SystemProgram.programId].map((pubkey,index)=>({pubkey,isSigner:index===1,isWritable:index===1||index===3}))
 const data=Buffer.alloc(48);Buffer.from([13,158,13,223,95,213,28,6]).copy(data);data.writeBigUInt64LE(amount,8);Buffer.from(orderId.slice(2),'hex').copy(data,16)
 return new TransactionInstruction({programId:program,keys,data})
}
export function solanaBridgeLamports(value:unknown){
 if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)throw Error('Invalid SOL balance evidence.')
 return BigInt(value)
}
export function solanaBridgeNativeAccount(info:AccountInfo<Buffer>|null){
 if(!info||info.executable||!info.owner.equals(SystemProgram.programId)||info.data.length!==0)throw Error('Invalid SOL account.')
 return solanaBridgeLamports(info.lamports)
}

/** Native SOL + reimbursement remains one owner-approved sponsored transaction. */
export async function prepareNativeSolanaBridge(review:Awaited<ReturnType<typeof openCrossBridgeReview>>,connection:Connection,relayer:Keypair,now:()=>number){
 const {quote:q,charged}=review,plan=charged.plan
 if(plan.kind!=='solana'||q.input.from!=='SOL'||plan.instructions.length!==2)throw Error('Invalid SOL bridge plan.')
 const owner=new PublicKey(q.input.sender),vault=plan.instructions[0].keys[3].pubkey,fee=new PublicKey(q.reimbursementRecipient)
 if(new Set([owner,vault,fee].map(k=>k.toBase58())).size!==3||relayer.publicKey.equals(owner)||relayer.publicKey.equals(vault))throw Error('Invalid SOL bridge accounts.')
 const addresses=[...new Map([owner,vault,fee,relayer.publicKey].map(k=>[k.toBase58(),k])).values()]
 const before=(await connection.getMultipleAccountsInfo(addresses,'confirmed')).map((account,index)=>!account&&addresses[index].equals(fee)?0n:solanaBridgeNativeAccount(account))
 if(before[addresses.findIndex(k=>k.equals(fee))]===0n&&BigInt(q.reimbursementUnits)<solanaBridgeLamports(await connection.getMinimumBalanceForRentExemption(0)))throw Error('SOL fee-account rent changed. Review again.')
 if(before[0]<charged.totalUnits)throw Object.assign(Error('Insufficient SOL for this bridge and fee.'),{status:422,code:'insufficient_balance'})
 const latest=await connection.getLatestBlockhash('confirmed'),tx=new Transaction({recentBlockhash:latest.blockhash,feePayer:relayer.publicKey}).add(...plan.instructions)
 const cost=(await connection.getFeeForMessage(tx.compileMessage(),'confirmed')).value
 if(cost===null||solanaBridgeLamports(cost)<=0n)throw Error('Invalid SOL network fee.')
 await checkSolanaRelayerBalance(connection,relayer.publicKey,BigInt(cost)+100000n)
 tx.partialSign(relayer)
 const result=await connection.simulateTransaction(new VersionedTransaction(tx.compileMessage()),{sigVerify:false,replaceRecentBlockhash:false,commitment:'confirmed',accounts:{encoding:'base64',addresses:addresses.map(k=>k.toBase58())}})
 if(result.value.err||result.value.accounts?.length!==addresses.length)throw Error('SOL bridge simulation failed.')
 for(let i=0;i<addresses.length;i++){
  const key=addresses[i],delta=(key.equals(owner)?-charged.totalUnits:0n)+(key.equals(vault)?BigInt(q.input.amountUnits):0n)+(key.equals(fee)?BigInt(q.reimbursementUnits):0n)-(key.equals(relayer.publicKey)?BigInt(cost):0n),expected=before[i]+delta,after=result.value.accounts[i]
  if(expected<0n||!after&&expected!==0n)throw Error('SOL bridge balance effects changed.')
  if(after&&(after.data[1]!=='base64'||solanaBridgeNativeAccount({...after,owner:new PublicKey(after.owner),data:Buffer.from(after.data[0],'base64')})!==expected))throw Error('SOL bridge balance effects changed.')
 }
 if(q.expiresAt<=now()||!Number.isSafeInteger(latest.lastValidBlockHeight)||latest.lastValidBlockHeight<=0)throw Error('SOL bridge quote expired.')
 return {transaction:tx.serialize({requireAllSignatures:false,verifySignatures:true}).toString('base64'),lastValidBlockHeight:latest.lastValidBlockHeight,networkFeeLamports:String(cost)}
}
