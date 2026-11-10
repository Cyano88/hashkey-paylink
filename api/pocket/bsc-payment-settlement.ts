import {parseAbi,parseEventLogs,type Hex} from 'viem'
import {bscPaymentAmounts,validateBscPayment,bscPaymentCalls,type BscPaymentQuote} from '../../src/pocket/lib/pocketBscPayment.js'
import {POCKET_BSC} from '../../src/pocket/lib/pocketBsc.js'
import {evmFeeTransfers} from '../../src/lib/platformFees.js'
import {encodeXLayerSponsoredBatch,XLAYER_ENTRY_POINT,type XLayerCostRpc} from './xlayer-sponsored-cost.js'
import {sponsoredSwapOperationProof} from './sponsored-swap-operation-proof.js'
const same=(a:unknown,b:string)=>typeof a==='string'&&a.toLowerCase()===b.toLowerCase()
const hash=(v:unknown):v is Hex=>typeof v==='string'&&/^0x[0-9a-f]{64}$/i.test(v)
const fail=():never=>{throw Error('Payment confirmation is still being verified.')}
const uint=(v:unknown)=>{if(typeof v!=='string'||!/^0x[0-9a-f]{1,64}$/i.test(v))return fail();return BigInt(v)}
const abi=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)'])
export async function readBscPaymentSettlement(q:BscPaymentQuote,txHash:Hex,rpc:XLayerCostRpc,userOperationHash?:Hex):Promise<{status:'pending'|'completed'|'failed'}>{
 validateBscPayment(q,Date.now(),true)
 if(!hash(txHash)||userOperationHash!==undefined&&!hash(userOperationHash)||uint(await rpc('eth_chainId',[]))!==56n)return fail()
 const [tx,r]=await Promise.all([rpc('eth_getTransactionByHash',[txHash]),rpc('eth_getTransactionReceipt',[txHash])])
 if(!tx||!r)return {status:'pending'}
 if(!same(tx.hash,txHash)||!same(r.transactionHash,txHash)||!hash(r.blockHash)||!same(tx.blockHash,r.blockHash)||uint(tx.blockNumber)!==uint(r.blockNumber)||uint(tx.chainId)!==56n||!same(tx.to,XLAYER_ENTRY_POINT)||!same(r.to,XLAYER_ENTRY_POINT)||!Array.isArray(r.logs))return fail()
 const block=await rpc('eth_getBlockByNumber',[r.blockNumber,false])
 if(!block||!same(block.hash,r.blockHash)||uint(block.number)!==uint(r.blockNumber))return fail()
 const blockTime=Number(uint(block.timestamp))*1000
 if(!Number.isSafeInteger(blockTime)||blockTime<q.issuedAt-2000||blockTime>Date.now()+5000)return fail()
 if(uint(await rpc('eth_blockNumber',[]))<uint(r.blockNumber)+14n)return {status:'pending'}
 const calls=encodeXLayerSponsoredBatch(bscPaymentCalls(q,q.issuedAt))
 if(sponsoredSwapOperationProof(tx,r,{owner:q.walletAddress,callData:calls,userOperationHash})==='failed')return {status:'failed'}
 const logs=parseEventLogs({abi,logs:r.logs.filter((l:any)=>same(l.address,POCKET_BSC.assets[q.asset].address))})
 const amounts=bscPaymentAmounts(q)
 const outgoing=logs.filter(l=>same(l.args.from,q.walletAddress))
 const received=logs.filter(l=>same(l.args.to,q.recipient))
 const expectedFees=evmFeeTransfers(q,amounts.platformFee,amounts.networkFee)
 const fees=logs.filter(l=>same(l.args.from,q.walletAddress)&&expectedFees.some(f=>same(l.args.to,f.recipient)))
 const net=(wallet:string)=>logs.reduce((n,l)=>n+(same(l.args.to,wallet)?l.args.value:0n)-(same(l.args.from,wallet)?l.args.value:0n),0n)
 if(outgoing.length!==1+expectedFees.length||received.length!==1||!same(received[0].args.from,q.walletAddress)||received[0].args.value!==amounts.recipient||fees.length!==expectedFees.length||expectedFees.some(f=>!fees.some(l=>same(l.args.to,f.recipient)&&l.args.value===f.units))
 ||net(q.recipient)!==amounts.recipient||net(q.walletAddress)!==-amounts.total)return fail()
 return {status:'completed'}
}
