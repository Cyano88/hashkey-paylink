import {decodeEventLog,parseAbi} from 'viem'
import type {PocketBridgeRevenue} from '../../src/pocket/lib/pocketBridgeRevenue.js'
const transfer=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)'])
const forwarder='0xce40449b773a3e6e5e769adb4e567179d4828cbd'
const router='0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae'
const forwarded=parseAbi(['event FeesForwarded(address indexed token,(address recipient,uint256 amount)[] distributions)'])
const same=(a:unknown,b:string)=>typeof a==='string'&&a.toLowerCase()===b.toLowerCase()

/** Only use a canonical source receipt, after verifying the exact bridge operation. */
export function lifiRevenueProven(revenue:PocketBridgeRevenue|undefined,token:string,receipt:any,hash:string){
 if(!revenue)return true
 if(!/^0x[0-9a-f]{64}$/i.test(hash)||receipt?.status!=='success'||!same(receipt.transactionHash,hash)||!Array.isArray(receipt.logs)||receipt.logs.some((log:any)=>log.removed))return false
 if(!/^(0|[1-9]\d*)$/.test(revenue.amountUnits))return false
 const expected=BigInt(revenue.amountUnits)
 let credited=0n,debited=0n,matches=0
 let forwardedMatches=0
 for(const log of receipt.logs){
  if(same(log.address,forwarder)){
   try{const {args}=decodeEventLog({abi:forwarded,eventName:'FeesForwarded',data:log.data,topics:log.topics});const fees=args.distributions.filter(f=>same(f.recipient,revenue.recipient));if(same(args.token,token)&&fees.length===1&&fees[0].amount===expected)forwardedMatches++}catch{/* Unrelated event. */}
  }
  if(!same(log.address,token))continue
  try{
   const {args}=decodeEventLog({abi:transfer,eventName:'Transfer',data:log.data,topics:log.topics})
   // FeeForwarder uses transferFrom(msg.sender,...); the token sender is the diamond.
   if(same(args.to,revenue.recipient)){if(!same(args.from,router))return false;credited+=args.value;matches++}
   if(same(args.from,revenue.recipient))debited+=args.value
  }catch{/* Non-transfer logs do not prove collection. */}
 }
 return credited===expected&&debited===0n&&(expected===0n?matches===0:matches===1&&forwardedMatches===1)
}

/** Separate internal accounting fields; never add another charge to the UI total. */
export function lifiRevenueMetadata(revenue:PocketBridgeRevenue|undefined,networkFeeUnits?:string){
 return {...(networkFeeUnits!==undefined?{gasReimbursementUnits:networkFeeUnits}:{}),...(revenue?{bridgeRevenueUnits:revenue.amountUnits,bridgeRevenueRecipient:revenue.recipient,bridgeRevenueBps:String(revenue.bps),bridgeRevenueCollector:'lifi',bridgeRevenueRefundPolicy:'retain_after_collection'}:{})}
}
