import {toEventSelector,type Hex} from 'viem'
import {XLAYER_ENTRY_POINT,type XLayerCostRpc} from './xlayer-sponsored-cost.js'
const same=(a:unknown,b:string)=>typeof a==='string'&&a.toLowerCase()===b.toLowerCase()
/** Discovery only. The recovered hash must still pass canonical swap settlement. */
export async function recoverBscUserOperation(rpc:XLayerCostRpc,userOp:Hex,wallet:string):Promise<Hex|null>{
 if(await rpc('eth_chainId',[])!=='0x38')throw Error('Swap confirmation is still being verified.')
 const receipt=await rpc('eth_getUserOperationReceipt',[userOp])
 if(receipt===null)return null
 if(!same(receipt?.userOpHash,userOp)||!same(receipt?.sender,wallet)||!same(receipt?.entryPoint,XLAYER_ENTRY_POINT)||!same(receipt?.receipt?.to,XLAYER_ENTRY_POINT)||!/^0x[0-9a-f]{64}$/i.test(receipt?.receipt?.transactionHash||''))throw Error('Swap confirmation is still being verified.')
 return receipt.receipt.transactionHash
}
/** Scan only finalized blocks, in bounded pages, so restart recovery does not skip late inclusion. */
export async function findBscUserOperation(rpc:XLayerCostRpc,userOp:Hex,wallet:string,fromBlock:string):Promise<{hash:Hex|null;nextBlock?:string}>{
 if(!/^0x[0-9a-f]+$/i.test(fromBlock)||await rpc('eth_chainId',[])!=='0x38')throw Error('Swap confirmation is still being verified.')
 const head=await rpc('eth_blockNumber',[])
 if(!/^0x[0-9a-f]+$/i.test(head))throw Error('Swap confirmation is still being verified.')
 const start=BigInt(fromBlock),finalized=BigInt(head)-14n
 if(finalized<start)return {hash:null}
 const end=finalized<start+999n?finalized:start+999n
 const logs=await rpc('eth_getLogs',[{address:XLAYER_ENTRY_POINT,fromBlock,toBlock:'0x'+end.toString(16),topics:[toEventSelector('UserOperationEvent(bytes32,address,address,uint256,bool,uint256,uint256)'),userOp,'0x'+wallet.slice(2).toLowerCase().padStart(64,'0')]}])
 if(!Array.isArray(logs))throw Error('Swap confirmation is still being verified.')
 if(!logs.length)return {hash:null,nextBlock:'0x'+(end+1n).toString(16)}
 if(logs.length!==1)throw Error('Swap confirmation is still being verified.')
 const log=logs[0]
 if(log.removed===true||!same(log.address,XLAYER_ENTRY_POINT)||!same(log.topics?.[1],userOp)||!same(log.topics?.[2],'0x'+wallet.slice(2).padStart(64,'0'))||!/^0x[0-9a-f]{64}$/i.test(log.transactionHash||'')||!/^0x[0-9a-f]+$/i.test(log.blockNumber||'')||BigInt(log.blockNumber)<start||BigInt(log.blockNumber)>end)throw Error('Swap confirmation is still being verified.')
 return {hash:log.transactionHash}
}
