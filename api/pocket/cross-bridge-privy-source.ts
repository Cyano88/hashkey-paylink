import {decodeEventLog,parseAbi,type Hex} from 'viem'
import {readSponsoredBridgeSource} from './bridge-sponsored-source.js'
import type {openCrossBridgeReview} from './cross-bridge-review.js'
import {RELAY_BSC_CHAINS} from './bsc-bridge-provider.js'
type Review=Awaited<ReturnType<typeof openCrossBridgeReview>>
const transfer=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)'])
const same=(a:unknown,b:string)=>typeof a==='string'&&a.toLowerCase()===b.toLowerCase()
const pending=():never=>{throw Object.assign(Error('Bridge source debit is still being verified.'),{status:409})}
export async function readCrossBridgePrivySource(review:Review,hash:Hex,userOperationHash?:Hex,options:Parameters<typeof readSponsoredBridgeSource>[3]={}){
 const {quote:q,route,charged}=review,source=route.source
 if(source!=='bsc'&&source!=='xlayer'||q.wallets.source.provider!=='privy'||charged.plan.kind!=='evm')return pending()
 const {receipt,outcome}=await readSponsoredBridgeSource(source,hash,{owner:q.wallets.source.address,callData:charged.plan.callData,userOperationHash},options)
 if(outcome==='failed')return 'failed' as const
 // Successful exact atomic Kernel batch proves native call values. ERC20 calls
 // additionally require deposit and fee movements; false-return transfers fail.
 if(!route.tokenIn.native){
  const movements:Array<{from:string;to:string;value:bigint}>=[]
  for(const log of receipt.logs){
   if(log.removed)pending()
   if(!same(log.address,route.tokenIn.address))continue
   let e;try{e=decodeEventLog({abi:transfer,eventName:'Transfer',topics:log.topics as [Hex,...Hex[]],data:log.data,strict:true})}catch{continue}
   if(same(e.args.from,q.input.sender)||same(e.args.to,q.input.sender))movements.push(e.args)
  }
  const expected=[{to:RELAY_BSC_CHAINS[source].depository,value:BigInt(route.amountUnits)},{to:q.reimbursementRecipient,value:BigInt(q.reimbursementUnits)}]
  if(movements.length!==expected.length)pending()
  for(const item of expected){const index=movements.findIndex(m=>same(m.from,q.input.sender)&&same(m.to,item.to)&&m.value===item.value);if(index<0)pending();movements.splice(index,1)}
 }
 return 'confirmed' as const
}
