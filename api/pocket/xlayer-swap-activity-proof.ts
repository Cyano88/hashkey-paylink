import {decodeFunctionData,decodeAbiParameters,encodeFunctionData,parseAbi,parseEventLogs,type Hex} from 'viem'
import {entryPoint07Abi} from 'viem/account-abstraction'
import {encodeXLayerSponsoredBatch,XLAYER_ENTRY_POINT} from './xlayer-sponsored-cost.js'
import {OKX_XLAYER_ROUTER,OKX_XLAYER_SPENDER} from '../../src/pocket/lib/pocketXStocksSwap.js'
import {stockUsdc,stockUsdt} from '../../src/pocket/lib/pocketXStocksWallet.js'
import {EVM_PLATFORM_TREASURY} from '../../src/lib/platformFees.js'
const kernel=parseAbi(['function execute(bytes32 mode,bytes executionCalldata)'])
const tokenAbi=parseAbi(['function approve(address,uint256) returns(bool)','function transfer(address,uint256) returns(bool)'])
const events=parseAbi(['event UserOperationEvent(bytes32 indexed userOpHash,address indexed sender,address indexed paymaster,uint256 nonce,bool success,uint256 actualGasCost,uint256 actualGasUsed)'])
const transfers=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)'])
const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase()
/** Only the known atomic five-call native-output swap shape is classified. */
export function sponsoredSwapTradeCall(tx:{hash:string;to:string|null;input:Hex},receipt:{status:string;logs?:readonly any[]}){
 if(receipt.status!=='success'||!tx.to||!same(tx.to,XLAYER_ENTRY_POINT)||!receipt.logs)return
 try{
  const outer=decodeFunctionData({abi:entryPoint07Abi,data:tx.input});if(outer.functionName!=='handleOps'||outer.args[0].length!==1)return
  const op=outer.args[0][0],executed=parseEventLogs({abi:events,logs:receipt.logs.filter(l=>same(l.address,XLAYER_ENTRY_POINT))})
  if(executed.length!==1||!executed[0].args.success||!same(executed[0].args.sender,op.sender)||executed[0].args.nonce!==op.nonce)return
  const decoded=decodeFunctionData({abi:kernel,data:op.callData})
  if(decoded.args[0]!=='0x01'+'00'.repeat(31))return
  const [raw]=decodeAbiParameters([{type:'tuple[]',components:[{name:'target',type:'address'},{name:'value',type:'uint256'},{name:'callData',type:'bytes'}]}],decoded.args[1])
  if(raw.length!==5||raw.some(c=>c.value!==0n))return
  const calls=raw.map(c=>({to:c.target,data:c.callData,value:'0x0' as const}))
  if(!same(encodeXLayerSponsoredBatch(calls),op.callData)||![stockUsdc.address,stockUsdt.address].some(t=>same(t,calls[0].to))||![1,3,4].every(i=>same(calls[i].to,calls[0].to))||!same(calls[2].to,OKX_XLAYER_ROUTER))return
  const approval=decodeFunctionData({abi:tokenAbi,data:calls[1].data});if(approval.functionName!=='approve'||!same(approval.args[0],OKX_XLAYER_SPENDER)||approval.args[1]<=0n)return
  for(const i of [0,3])if(!same(calls[i].data,encodeFunctionData({abi:tokenAbi,functionName:'approve',args:[OKX_XLAYER_SPENDER,0n]})))return
  const fee=decodeFunctionData({abi:tokenAbi,data:calls[4].data});if(fee.functionName!=='transfer'||!same(fee.args[0],EVM_PLATFORM_TREASURY)||fee.args[1]<=0n)return
  const paid=parseEventLogs({abi:transfers,logs:receipt.logs.filter(l=>same(l.address,calls[0].to))}).filter(e=>same(e.args.from,op.sender)&&same(e.args.to,EVM_PLATFORM_TREASURY))
  if(paid.length!==1||paid[0].args.value!==fee.args[1])return
  return {tx:{hash:tx.hash,from:op.sender,to:calls[2].to,input:calls[2].data},input:calls[0].to.toLowerCase(),inputUnits:approval.args[1].toString(),feeUnits:fee.args[1].toString()}
 }catch{return}
}
