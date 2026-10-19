import {decodeFunctionData,parseAbi,parseEventLogs,type Hex} from 'viem'
import {entryPoint07Abi} from 'viem/account-abstraction'
import {stockClient} from '../../src/pocket/lib/pocketXStocksWallet.js'
import {stockTradeProof,nativeTradeLegs} from './stock-trade-notifications.js'
import {XLAYER_ENTRY_POINT} from './xlayer-sponsored-cost.js'
export type SponsoredSwapEvidence={callData:Hex;owner:string;input:string;output?:string;inputUnits:string;minimumOutUnits:string;feeUnits:string}
const events=parseAbi(['event UserOperationEvent(bytes32 indexed userOpHash,address indexed sender,address indexed paymaster,uint256 nonce,bool success,uint256 actualGasCost,uint256 actualGasUsed)'])
const transfers=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)'])
const same=(a:string|undefined|null,b:string)=>typeof a==='string'&&a.toLowerCase()===b.toLowerCase()
export async function readSponsoredSwapOutcome(hash:Hex,e:SponsoredSwapEvidence,client=stockClient):Promise<'completed'|'failed'|'pending'>{
 if(await client.getChainId()!==196)throw Error('Wrong swap chain')
 const [tx,r]=await Promise.all([client.getTransaction({hash}),client.getTransactionReceipt({hash})])
 if(!same(tx.hash,hash)||!same(r.transactionHash,hash)||!same(tx.to,XLAYER_ENTRY_POINT)||!same(tx.blockHash,r.blockHash))throw Error('Swap receipt changed')
 const block=await client.getBlock({blockNumber:r.blockNumber});if(!same(block.hash,r.blockHash))throw Error('Swap block changed')
 const decoded=decodeFunctionData({abi:entryPoint07Abi,data:tx.input})
 if(decoded.functionName!=='handleOps'||decoded.args[0].length!==1)throw Error('Swap operation changed')
 const op=decoded.args[0][0];if(!same(op.sender,e.owner)||!same(op.callData,e.callData))throw Error('Swap calls changed')
 if(r.status==='reverted')return 'failed'
 const event=parseEventLogs({abi:events,logs:r.logs.filter(l=>same(l.address,XLAYER_ENTRY_POINT))})
 if(event.length!==1||!same(event[0].args.sender,e.owner)||event[0].args.nonce!==op.nonce)throw Error('Swap operation receipt unavailable')
 if(!event[0].args.success)return 'failed'
 const proof=stockTradeProof(tx,r)
 if(!proof||proof.owner!==e.owner.toLowerCase()||proof.input!==e.input.toLowerCase()||proof.inputUnits!==e.inputUnits||proof.feeUnits!==e.feeUnits)throw Error('Swap effects unavailable')
 const output=e.output||'native' // Existing durable attempts predate token-output sponsorship.
 if(!same(proof.output,output))throw Error('Swap output changed')
 if(output==='native'){
  const native=nativeTradeLegs(proof,r.logs,Number(block.timestamp)*1000)
  if(native.length!==1||BigInt(native[0].units)<BigInt(e.minimumOutUnits))throw Error('Swap output unavailable')
 }else{
  const received=parseEventLogs({abi:transfers,logs:r.logs.filter(l=>same(l.address,output))}).reduce((n,l)=>n+(same(l.args.to,e.owner)?l.args.value:0n)-(same(l.args.from,e.owner)?l.args.value:0n),0n)
  if(received<=0n||received<BigInt(e.minimumOutUnits))throw Error('Swap output unavailable')
 }
 const spent=parseEventLogs({abi:transfers,logs:r.logs.filter(l=>same(l.address,e.input))}).reduce((n,l)=>n+(same(l.args.from,e.owner)?l.args.value:0n)-(same(l.args.to,e.owner)?l.args.value:0n),0n)
 if(spent!==BigInt(e.inputUnits)+BigInt(e.feeUnits))throw Error('Swap debit unavailable')
 return 'completed'
}
