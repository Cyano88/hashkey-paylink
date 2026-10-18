import {createPublicKey,verify} from 'node:crypto'
import {PublicKey,TransactionInstruction,TransactionMessage,VersionedTransaction,type Connection} from '@solana/web3.js'
import {inspectNativeSolanaSwapEnvelope} from './native-solana-swap-envelope.js'
import type {SolanaSwapInstruction} from './native-solana-swap-inspection.js'

type Input=Parameters<typeof inspectNativeSolanaSwapEnvelope>[0]
type Rpc=Pick<Connection,'getGenesisHash'|'getMinimumBalanceForRentExemption'|'getAddressLookupTable'|'getLatestBlockhash'|'getFeeForMessage'|'getMultipleAccountsInfoAndContext'|'simulateTransaction'>
function fail():never{throw Error('SOL swap could not be verified. Refresh the estimate.')}
const MAINNET='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'
const positive=(value:number|null):value is number=>Number.isSafeInteger(value)&&value!>0

/** Transaction-only RPC preflight. Never used for displayed wallet balances.
 * A successful simulation is NOT approval: account effects and fee policy must
 * still be validated before issuing an executable Circle quote.
 */
export async function preflightNativeSolanaSwap(input:Input,instructions:SolanaSwapInstruction[],lookupAddresses:string[],policy:{maximumPriorityFeeLamports:string;maximumNetworkFeeLamports:string},rpc:Rpc,approved?:{transaction:string;lastValidBlockHeight:number}){
 if(!/^\d+$/.test(policy.maximumNetworkFeeLamports)||!Array.isArray(lookupAddresses)||lookupAddresses.length>8||new Set(lookupAddresses).size!==lookupAddresses.length)fail()
 if(await rpc.getGenesisHash()!==MAINNET)fail()
 const rent=await rpc.getMinimumBalanceForRentExemption(165,'confirmed');if(!positive(rent))fail()
 const inspected=inspectNativeSolanaSwapEnvelope(input,instructions,{tokenAccountRentLamports:String(rent),maximumPriorityFeeLamports:policy.maximumPriorityFeeLamports})
 const tables=[]
 for(const address of lookupAddresses){
  const key=new PublicKey(address),result=await rpc.getAddressLookupTable(key,{commitment:'confirmed'})
  if(!result.value||!result.value.key.equals(key)||!result.value.isActive())fail()
  tables.push(result.value)
 }
 const saved=approved?VersionedTransaction.deserialize(Buffer.from(approved.transaction,'base64')):null
 const block=saved?{blockhash:saved.message.recentBlockhash,lastValidBlockHeight:approved!.lastValidBlockHeight}:await rpc.getLatestBlockhash('confirmed')
 if(!positive(block.lastValidBlockHeight))fail()
 const message=new TransactionMessage({payerKey:new PublicKey(input.wallet),recentBlockhash:block.blockhash,instructions:instructions.map(i=>new TransactionInstruction({programId:new PublicKey(i.programId),data:Buffer.from(i.data,'base64'),keys:i.accounts.map(a=>({pubkey:new PublicKey(a.pubkey),isSigner:a.isSigner,isWritable:a.isWritable}))}))}).compileToV0Message(tables)
 if(message.header.numRequiredSignatures!==1||message.staticAccountKeys[0].toBase58()!==input.wallet)fail()
 const transaction=new VersionedTransaction(message),raw=transaction.serialize();if(raw.length>1232)fail()
 if(approved&&Buffer.from(raw).toString('base64')!==approved.transaction)fail()
 const fee=(await rpc.getFeeForMessage(message,'confirmed')).value
 if(!positive(fee)||BigInt(fee)>BigInt(policy.maximumNetworkFeeLamports)||BigInt(fee)<BigInt(inspected.priorityFeeLamports))fail()
 const keys=message.getAccountKeys({addressLookupTableAccounts:tables})
 const writable=Array.from({length:keys.length},(_,index)=>({index,key:keys.get(index)!})).filter(({index})=>message.isAccountWritable(index)).map(({key})=>key)
 if(!writable.length||writable.length>64)fail()
 const before=await rpc.getMultipleAccountsInfoAndContext(writable,{commitment:'confirmed'})
 if(!positive(before.context.slot)||before.value.length!==writable.length)fail()
 const simulated=await rpc.simulateTransaction(transaction,{commitment:'confirmed',sigVerify:false,replaceRecentBlockhash:false,minContextSlot:before.context.slot,accounts:{encoding:'base64',addresses:writable.map(k=>k.toBase58())}})
 if(simulated.value.err||simulated.context.slot<before.context.slot||!simulated.value.accounts||simulated.value.accounts.length!==writable.length||!positive(simulated.value.unitsConsumed??null))fail()
 return {executionAvailable:false as const,requiresEffectValidation:true as const,intent:{...input},writableAddresses:writable.map(key=>key.toBase58()),inspection:inspected,transaction:Buffer.from(raw).toString('base64'),wallet:input.wallet,lastValidBlockHeight:block.lastValidBlockHeight,networkFeeLamports:String(fee),snapshotSlot:before.context.slot,simulationSlot:simulated.context.slot,unitsConsumed:simulated.value.unitsConsumed,accounts:writable.map((key,index)=>({address:key.toBase58(),before:before.value[index],after:simulated.value.accounts![index]}))}
}

/** Bind Circle's eventual signature to the exact reviewed message, including LUT
 * references, recent blockhash, instructions, account privileges and fee payer.
 * Caller must supply a trusted stored quote, never a second client payload.
 */
export function verifyNativeSolanaSwapSignature(approvedRaw:string,signedRaw:string,wallet:string){
 const parse=(raw:string)=>{
  if(typeof raw!=='string'||raw.length>1644)fail()
  const bytes=Buffer.from(raw,'base64');if(bytes.length>1232||bytes.toString('base64')!==raw)fail()
  const tx=VersionedTransaction.deserialize(bytes)
  if(!Buffer.from(tx.serialize()).equals(bytes)||tx.message.version!==0||tx.message.header.numRequiredSignatures!==1||tx.signatures.length!==1||tx.message.staticAccountKeys[0].toBase58()!==wallet)fail()
  return tx
 }
 const approved=parse(approvedRaw),signed=parse(signedRaw)
 if(approved.signatures.some(s=>s.some(b=>b!==0))||!Buffer.from(approved.message.serialize()).equals(Buffer.from(signed.message.serialize())))fail()
 const publicKey=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),new PublicKey(wallet).toBuffer()]),format:'der',type:'spki'})
 if(!verify(null,signed.message.serialize(),publicKey,signed.signatures[0]))fail()
 return signed
}
