import {Connection,Transaction} from '@solana/web3.js'
import bs58 from 'bs58'
import {assertSolanaBridgeMessage,type SolanaBridgeApproval} from './solana-bridge-approval.js'

const MAINNET='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'
type Rpc=Pick<Connection,'getGenesisHash'|'getTransaction'|'getSlot'|'getBlockSignatures'>
/** Exact finalized source evidence only; this never proves destination delivery. */
export async function readSolanaCctpSource(approved:SolanaBridgeApproval,signedTransaction:string,rpcOverride?:Rpc){
 const signed=Transaction.from(Buffer.from(signedTransaction,'base64'))
 assertSolanaBridgeMessage(signed,approved,true)
 if(!signed.signature)throw Error('Missing Solana bridge signature.')
 const hash=bs58.encode(signed.signature),message=signed.serializeMessage()
 const signatures=signed.signatures.map(s=>s.signature?bs58.encode(s.signature):'')
 const rpc=rpcOverride??new Connection((await import('../relay-solana.js')).getRpc(),{commitment:'finalized',disableRetryOnRateLimit:true,fetch:async(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(10000),redirect:'error'})})
 if(await rpc.getGenesisHash()!==MAINNET)throw Error('Bridge RPC is not Solana mainnet.')
 const receipt=await rpc.getTransaction(hash,{commitment:'finalized',maxSupportedTransactionVersion:0})
 if(!receipt)return null
 const validate=(value:typeof receipt)=>{
  if(!value.meta||!Object.hasOwn(value.meta,'err')||!Number.isSafeInteger(value.slot)||value.slot<0||!Buffer.from(value.transaction.message.serialize()).equals(message)||JSON.stringify(value.transaction.signatures)!==JSON.stringify(signatures))throw Error('Finalized bridge transaction does not match saved evidence.')
  const err=value.meta.err
  if(err!==null&&!(typeof err==='string'||typeof err==='object'&&err!==null&&!Array.isArray(err)&&Object.keys(err).length>0))throw Error('Bridge execution outcome is unavailable.')
  return JSON.stringify({slot:value.slot,err:value.meta.err})
 }
 const fingerprint=validate(receipt)
 if(await rpc.getSlot('finalized')<receipt.slot)throw Error('Bridge source is not finalized.')
 const block=await rpc.getBlockSignatures(receipt.slot,'finalized')
 if(!block||bs58.decode(block.blockhash).length!==32||block.signatures.filter(s=>s===hash).length!==1)throw Error('Bridge source block membership is unavailable.')
 const fresh=await rpc.getTransaction(hash,{commitment:'finalized',maxSupportedTransactionVersion:0})
 if(!fresh||validate(fresh)!==fingerprint)throw Error('Bridge source evidence changed.')
 const freshBlock=await rpc.getBlockSignatures(receipt.slot,'finalized')
 if(!freshBlock||freshBlock.blockhash!==block.blockhash||freshBlock.signatures.filter(s=>s===hash).length!==1||await rpc.getGenesisHash()!==MAINNET)throw Error('Bridge source canonicality changed.')
 return {outcome:receipt.meta!.err===null?'source_confirmed' as const:'source_failed' as const,txHash:hash,slot:String(receipt.slot),blockHash:block.blockhash}
}
