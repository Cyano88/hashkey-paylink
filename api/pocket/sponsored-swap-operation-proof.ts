import {decodeFunctionData,parseAbi,parseEventLogs,type Hex} from 'viem'
import {entryPoint07Abi} from 'viem/account-abstraction'
import {XLAYER_ENTRY_POINT} from './xlayer-sponsored-cost.js'
const events=parseAbi(['event UserOperationEvent(bytes32 indexed userOpHash,address indexed sender,address indexed paymaster,uint256 nonce,bool success,uint256 actualGasCost,uint256 actualGasUsed)'])
const same=(a:unknown,b:string)=>typeof a==='string'&&a.toLowerCase()===b.toLowerCase()
/** Shared X Layer/BNB operation proof. Callers separately verify chain, canonical block and asset effects. */
export function sponsoredSwapOperationProof(tx:{to?:string|null;input:Hex},receipt:{logs:readonly any[];status:string},e:{owner:string;callData:Hex;userOperationHash?:Hex}):'completed'|'failed'{
 if(!same(tx.to,XLAYER_ENTRY_POINT))throw Error('Swap receipt changed')
 const decoded=decodeFunctionData({abi:entryPoint07Abi,data:tx.input})
 if(decoded.functionName!=='handleOps'||decoded.args[0].length!==1)throw Error('Swap operation changed')
 const op=decoded.args[0][0]
 if(!same(op.sender,e.owner)||!same(op.callData,e.callData))throw Error('Swap calls changed')
 if(receipt.status==='reverted'||receipt.status==='0x0')return 'failed'
 if(receipt.status!=='success'&&receipt.status!=='0x1')throw Error('Swap receipt unavailable')
 const event=parseEventLogs({abi:events,logs:receipt.logs.filter(l=>same(l.address,XLAYER_ENTRY_POINT))})
 if(event.length!==1||!same(event[0].args.sender,e.owner)||event[0].args.nonce!==op.nonce||e.userOperationHash&&!same(event[0].args.userOpHash,e.userOperationHash))throw Error('Swap operation receipt unavailable')
 return event[0].args.success?'completed':'failed'
}
