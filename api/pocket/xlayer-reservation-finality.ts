import {decodeFunctionData,type Hex} from 'viem'
import {entryPoint07Abi} from 'viem/account-abstraction'
import {inboundBridgeClient} from './inbound-bridge-networks.js'
import {XLAYER_ENTRY_POINT} from './xlayer-sponsored-cost.js'
const same=(a:unknown,b:unknown)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase()
/** Releases only the wallet execution lock, not payment/bridge settlement status. */
export async function xlayerReservationFinalized(record:{hash?:string;wallet:string;bridgeQuoteToken?:string},client:any=inboundBridgeClient('xlayer')):Promise<boolean>{
 if(record.bridgeQuoteToken||!/^0x[0-9a-f]{64}$/i.test(record.hash||''))return false
 try{
 const hash=record.hash as Hex
 const [chain,tx,receipt,finalized]=await Promise.all([client.getChainId(),client.getTransaction({hash}),client.getTransactionReceipt({hash}),client.getBlock({blockTag:'finalized'})])
 if(chain!==196||!same(tx.hash,hash)||!same(receipt.transactionHash,hash)||!same(tx.blockHash,receipt.blockHash)||tx.blockNumber!==receipt.blockNumber||typeof receipt.blockNumber!=='bigint'||typeof finalized.number!=='bigint'||receipt.blockNumber>finalized.number||!['success','reverted'].includes(receipt.status))return false
 let bound=same(tx.from,record.wallet)
 if(same(tx.to,XLAYER_ENTRY_POINT)){
 const decoded=decodeFunctionData({abi:entryPoint07Abi,data:tx.input})
 bound=decoded.functionName==='handleOps'&&decoded.args[0].filter((op:any)=>same(op.sender,record.wallet)).length===1
 }
 if(!bound)return false
 const [block,again]=await Promise.all([client.getBlock({blockNumber:receipt.blockNumber}),client.getTransactionReceipt({hash})])
 return same(block.hash,receipt.blockHash)&&block.transactions.some((t:any)=>same(typeof t==='string'?t:t.hash,hash))&&same(again.transactionHash,hash)&&same(again.blockHash,receipt.blockHash)&&again.blockNumber===receipt.blockNumber&&again.status===receipt.status
 }catch{return false}
}
