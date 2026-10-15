import {decodeEventLog,parseAbi,type Hex} from 'viem'
import {POCKET_EARN_POOL} from '../../src/pocket/lib/pocketEarnCalls.js'
import {POCKET_EARN_ASSETS} from '../../src/pocket/lib/pocketEarn.js'
import type {PocketEarnMovement} from '../../src/pocket/lib/pocketEarnNotice.js'
// Aave DAO AaveV3XLayer aToken custody addresses; match the underlying transfer leg too.
const custody={USDC:'0x7da9b238cbd6a227ff054704ec5cf7e700f03414',USDT0:'0xf356ae412db5df43bd3a10746f7ad4e1c4de4297'}
const events=parseAbi(['event Supply(address indexed reserve,address user,address indexed onBehalfOf,uint256 amount,uint16 indexed referralCode)','event Withdraw(address indexed reserve,address indexed user,address indexed to,uint256 amount)'])
export function classifyEarnTransfer(t:{token:string;from:string;to:string;units:string},receipt:{status:string;logs:readonly {address:string;data:Hex;topics:readonly Hex[]}[]}):PocketEarnMovement|undefined{
 if(receipt.status!=='success')return
 const asset=POCKET_EARN_ASSETS.find(a=>a.address.toLowerCase()===t.token.toLowerCase());if(!asset)return
 const matches=receipt.logs.flatMap<PocketEarnMovement>(l=>{
  if(l.address.toLowerCase()!==POCKET_EARN_POOL.toLowerCase())return []
  try{
   const e=decodeEventLog({abi:events,topics:l.topics as [Hex,...Hex[]],data:l.data,strict:true})
   if(e.args.reserve.toLowerCase()!==asset.address.toLowerCase()||e.args.amount!==BigInt(t.units))return []
   if(e.eventName==='Supply'&&t.to.toLowerCase()===custody[asset.symbol]&&e.args.user.toLowerCase()===t.from.toLowerCase()&&e.args.onBehalfOf.toLowerCase()===t.from.toLowerCase())return [{action:'deposit' as const,symbol:asset.symbol}]
   if(e.eventName==='Withdraw'&&t.from.toLowerCase()===custody[asset.symbol]&&e.args.user.toLowerCase()===t.to.toLowerCase()&&e.args.to.toLowerCase()===t.to.toLowerCase())return [{action:'withdraw' as const,symbol:asset.symbol}]
  }catch{}
  return []
 })
 return matches.length===1?matches[0]:undefined
}
