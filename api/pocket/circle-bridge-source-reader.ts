import type {Hex} from 'viem'
import {inboundChains} from './inbound-bridge-networks.js'
import {readBridgeProofEvmRpc} from '../evm-read.js'
import {proveCircleKitSource,type CircleKitSourceExpectation,type CircleKitSourceReceipt} from './circle-bridge-source-proof.js'
import type {NativeCallTrace} from './native-send-quote.js'

type Rpc=(input:{method:string;params:unknown[]})=>Promise<unknown>
type RecordValue=Record<string,unknown>
const pending=():never=>{throw Object.assign(Error('Circle bridge source finality is still being verified.'),{status:409,code:'circle_bridge_evidence_pending'})}
const record=(value:unknown):RecordValue=>{if(!value||typeof value!=='object'||Array.isArray(value))return pending();return value as RecordValue}
const hash=(value:unknown):string=>{if(typeof value!=='string'||!/^0x[0-9a-f]{64}$/i.test(value))return pending();return value.toLowerCase()}
const quantity=(value:unknown):bigint=>{if(typeof value!=='string'||!/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(value))return pending();return BigInt(value)}
const block=(value:unknown)=>{const b=record(value);return {raw:b,hash:hash(b.hash),number:quantity(b.number)}}
function receipt(value:unknown,txHash:string){
 const r=record(value),blockHash=hash(r.blockHash),blockNumber=quantity(r.blockNumber),index=quantity(r.transactionIndex)
 if(r.status!=='0x1'||hash(r.transactionHash)!==txHash||!Array.isArray(r.logs))pending()
 const seen=new Set<string>()
 const logs=(r.logs as unknown[]).map(value=>{
  const l=record(value),logIndex=quantity(l.logIndex).toString()
  if(l.removed!==false||hash(l.blockHash)!==blockHash||quantity(l.blockNumber)!==blockNumber||hash(l.transactionHash)!==txHash||quantity(l.transactionIndex)!==index||seen.has(logIndex))pending()
  seen.add(logIndex)
  if(typeof l.address!=='string'||!/^0x[0-9a-f]{40}$/i.test(l.address)||typeof l.data!=='string'||!/^0x(?:[0-9a-f]{2})*$/i.test(l.data)||!Array.isArray(l.topics))pending()
  return {address:l.address as string,data:l.data as Hex,topics:(l.topics as unknown[]).map(t=>hash(t) as Hex),removed:false}
 })
 const proof:CircleKitSourceReceipt={status:'success',transactionHash:txHash,logs}
 return {blockHash,blockNumber,index,proof,fingerprint:JSON.stringify([blockHash,String(blockNumber),String(index),logs])}
}
/** Internal read-only verifier for an already authenticated, sealed expectation.
 * Requires finalized-tag and callTracer support; never falls back to latest or
 * provider status. This proves source debit/fees, NOT destination settlement. */
export async function readCircleKitSourceProof(expected:CircleKitSourceExpectation,rpcOverride?:Rpc){
 const source=expected.batch.source,txHash=hash(expected.txHash)
 if(!['base','arbitrum','ethereum','polygon','arc'].includes(source))pending()
 const rpc=rpcOverride??(({method,params})=>readBridgeProofEvmRpc(source,method,params))
 const call=async(method:string,params:unknown[])=>{
  try{return await rpc({method,params})}catch{throw Object.assign(Error('Circle bridge source RPC evidence is unavailable. Try again.'),{status:503,code:'circle_bridge_source_unavailable'})}
 }
 const chainId=BigInt(inboundChains[source].id)
 if(quantity(await call('eth_chainId',[]))!==chainId)pending()
 const r=receipt(await call('eth_getTransactionReceipt',[txHash]),txHash)
 const height='0x'+r.blockNumber.toString(16)
 const [canonical,finalized]=await Promise.all([call('eth_getBlockByNumber',[height,false]).then(block),call('eth_getBlockByNumber',['finalized',false]).then(block)])
 const included=(b:ReturnType<typeof block>)=>{if(b.number!==r.blockNumber||b.hash!==r.blockHash||!Array.isArray(b.raw.transactions)||r.index>=BigInt(b.raw.transactions.length)||hash(b.raw.transactions[Number(r.index)])!==txHash)pending()}
 included(canonical)
 if(finalized.number<r.blockNumber||(finalized.number===r.blockNumber&&finalized.hash!==r.blockHash))pending()
 const trace=record(await call('debug_traceTransaction',[txHash,{tracer:'callTracer'}])) as NativeCallTrace
 const proof=await proveCircleKitSource(expected,r.proof,trace)
 // A reorg/provider inconsistency during a slow trace must not be certified.
 const [chainAfter,receiptAfter,blockAfter,anchorAfter,finalAfter]=await Promise.all([
  call('eth_chainId',[]),call('eth_getTransactionReceipt',[txHash]),call('eth_getBlockByNumber',[height,false]).then(block),
  call('eth_getBlockByNumber',['0x'+finalized.number.toString(16),false]).then(block),call('eth_getBlockByNumber',['finalized',false]).then(block),
 ])
 if(quantity(chainAfter)!==chainId||receipt(receiptAfter,txHash).fingerprint!==r.fingerprint)pending()
 included(blockAfter)
 if(anchorAfter.number!==finalized.number||anchorAfter.hash!==finalized.hash||finalAfter.number<finalized.number||(finalAfter.number===finalized.number&&finalAfter.hash!==finalized.hash))pending()
 return {...proof,source,blockHash:r.blockHash,blockNumber:String(r.blockNumber),finalizedBlockHash:finalAfter.hash,finalizedBlockNumber:String(finalAfter.number)}
}
