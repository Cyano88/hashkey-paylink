import {encodeFunctionData,encodeEventTopics,encodeAbiParameters,parseAbi,toHex} from 'viem'
import {entryPoint07Abi} from 'viem/account-abstraction'
import {readSponsoredBridgeSource} from '../../api/pocket/bridge-sponsored-source.ts'
import {XLAYER_ENTRY_POINT} from '../../api/pocket/xlayer-sponsored-cost.ts'
const events=parseAbi(['event UserOperationEvent(bytes32 indexed userOpHash,address indexed sender,address indexed paymaster,uint256 nonce,bool success,uint256 actualGasCost,uint256 actualGasUsed)'])
export function fixtureSponsoredSource(read,settings=()=>({})) {return async(network,hash,expected)=>{
 const r=await read(network,hash),s=settings(),blockHash=r?.blockHash??'0x'+'c'.repeat(64),anchor='0x'+'d'.repeat(64),height='0x1',chain=network==='bsc'?'0x38':'0xc4'
 const op={sender:s.owner??expected.owner,nonce:1n,initCode:'0x',callData:s.callData??expected.callData,accountGasLimits:toHex(0n,{size:32}),preVerificationGas:0n,gasFees:toHex(0n,{size:32}),paymasterAndData:'0x',signature:'0x'}
 const input=encodeFunctionData({abi:entryPoint07Abi,functionName:'handleOps',args:[s.duplicate?[op,op]:[op],expected.owner]})
 const operation={address:XLAYER_ENTRY_POINT,topics:encodeEventTopics({abi:events,eventName:'UserOperationEvent',args:{userOpHash:s.userOpHash??expected.userOperationHash??'0x'+'e'.repeat(64),sender:op.sender,paymaster:op.sender}}),data:encodeAbiParameters([{type:'uint256'},{type:'bool'},{type:'uint256'},{type:'uint256'}],[s.nonce??1n,!s.operationFailed,0n,1n])}
 let reads=0
 const rpc=async({method,params})=>{
  if(method==='eth_chainId')return s.wrongChain?'0x1':chain
  if(method==='eth_getTransactionByHash'){reads++;return {hash:s.wrongHash?anchor:hash,to:s.wrongTarget?expected.owner:XLAYER_ENTRY_POINT,input:s.changedInput&&reads>1?'0x12345678':input,chainId:s.txChain??chain,blockHash:s.txReorg?anchor:blockHash,blockNumber:height,transactionIndex:s.wrongIndex?'0x1':'0x0'}}
  if(method==='eth_getTransactionReceipt')return r?{...r,status:s.changedReceipt&&reads>0?'0x0':r.status==='success'?'0x1':'0x0',transactionHash:r.transactionHash??hash,blockHash,blockNumber:height,transactionIndex:'0x0',logs:[...r.logs,...(r.status==='success'&&!s.noEvent?[operation]:[])].map((l,i)=>({...l,removed:s.removed??false,blockHash,blockNumber:height,transactionHash:hash,transactionIndex:'0x0',logIndex:'0x'+i.toString(16)}))}:null
  if(method==='eth_getBlockByNumber')return params[0]===height?{number:height,hash:s.reorg&&reads>0?anchor:blockHash,transactions:s.noMembership?[]:[hash]}:{number:s.unfinalized?'0x0':'0x100',hash:anchor,transactions:[]}
  throw Error('Unexpected fixture RPC '+method)
 }
 return readSponsoredBridgeSource(network,hash,expected,{rpc})
}}
