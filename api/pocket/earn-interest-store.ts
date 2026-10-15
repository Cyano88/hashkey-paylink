import {createHash} from 'node:crypto'
import {createPublicClient,http,parseAbi,parseAbiItem,type Address} from 'viem'
import {readDurableJson,mutateDurableJson} from '../render-durable-store.js'
import {POCKET_EARN_POOL} from '../../src/pocket/lib/pocketEarnCalls.js'
import {advanceEarnHistory,totalEarnInterest,type EarnLedger,type EarnCheckpoint} from './earn-interest-history.js'
const assets={USDC:{underlying:'0xB6CEceAB302E2E4948951eE7843FC24E92933061',aToken:'0x7Da9B238CBd6A227ff054704Ec5cF7e700f03414'},USDT0:{underlying:'0x779Ded0c9e1022225f8E0630b35a9b54bE713736',aToken:'0xF356ae412dB5df43BD3a10746f7ad4e1C4De4297'}} as const
export type EarnSymbol=keyof typeof assets
export type EarnEarningsResult={status:'ready'|'syncing'|'unavailable';earnedUnits?:string;asOf?:number}
const abi=parseAbi(['function getPreviousIndex(address) view returns(uint256)','function scaledBalanceOf(address) view returns(uint256)','function balanceOf(address) view returns(uint256)','function ATOKEN_REVISION() view returns(uint256)','function UNDERLYING_ASSET_ADDRESS() view returns(address)','function POOL() view returns(address)','function decimals() view returns(uint8)'])
const mint=parseAbiItem('event Mint(address indexed caller,address indexed onBehalfOf,uint256 value,uint256 balanceIncrease,uint256 index)')
const burn=parseAbiItem('event Burn(address indexed from,address indexed target,uint256 value,uint256 balanceIncrease,uint256 index)')
export const earnInterestClient=createPublicClient({transport:http(process.env.XLAYER_RPC_URL||'https://rpc.xlayer.tech',{timeout:10000,retryCount:0})})
export async function refreshEarnLedger(wallet:Address,symbol:EarnSymbol,state:EarnLedger,save:(s:EarnLedger)=>Promise<void>,client=earnInterestClient){
 if(await client.getChainId()!==196)throw Error('Wrong Earn chain')
 const head=await client.getBlock();if(Date.now()-Number(head.timestamp)*1000>60000)throw Error('Earn node is behind')
 const blockNumber=head.number>12n?head.number-12n:0n,block=await client.getBlock({blockNumber}),asset=assets[symbol],address=asset.aToken
 const indexCache=new Map<string,bigint>()
 const index=async(n:bigint):Promise<bigint>=>{
  const cached=indexCache.get(String(n));if(cached!==undefined)return cached
  let value:bigint
  try{value=await client.readContract({address,abi,functionName:'getPreviousIndex',args:[wallet],blockNumber:n})}catch(error){const code=await client.getCode({address,blockNumber:n});if(code&&code!=='0x')throw error;value=0n}
  indexCache.set(String(n),value);return value
 }
 const [revision,underlying,pool,decimals,currentIndex]=await Promise.all([client.readContract({address,abi,functionName:'ATOKEN_REVISION',blockNumber}),client.readContract({address,abi,functionName:'UNDERLYING_ASSET_ADDRESS',blockNumber}),client.readContract({address,abi,functionName:'POOL',blockNumber}),client.readContract({address,abi,functionName:'decimals',blockNumber}),index(blockNumber)])
 if(revision!==5n||decimals!==6||underlying.toLowerCase()!==asset.underlying.toLowerCase()||pool.toLowerCase()!==POCKET_EARN_POOL.toLowerCase())throw Error('Unsupported Earn accounting contract')
 const target:EarnCheckpoint={block:String(blockNumber),hash:block.hash,index:String(currentIndex),interest:'0'}
 const next=await advanceEarnHistory(state,target,{index,hash:async n=>(await client.getBlock({blockNumber:n})).hash,interest:async(n,expected)=>{
  const logs=(await Promise.all([client.getLogs({address,event:mint,args:{onBehalfOf:wallet},fromBlock:n,toBlock:n,strict:true}),client.getLogs({address,event:burn,args:{from:wallet},fromBlock:n,toBlock:n,strict:true})])).flat()
  const canonical=await client.getBlock({blockNumber:n});let total=0n;const seen=new Set<string>()
  for(const log of logs){if(log.removed||log.blockHash!==canonical.hash||log.args.index!==expected)throw Error('Invalid Earn interest event');const key=log.transactionHash+':'+log.logIndex;if(seen.has(key))throw Error('Duplicate Earn event');seen.add(key);total+=log.args.balanceIncrease}
  const prior=await index(n-1n)
  const before=prior===0n?0n:await client.readContract({address,abi,functionName:'scaledBalanceOf',args:[wallet],blockNumber:n-1n})
  const eventRevision=await client.readContract({address,abi,functionName:'ATOKEN_REVISION',blockNumber:n})
  if(eventRevision!==5n||total!==before*expected/(10n**27n)-before*prior/(10n**27n))throw Error('Incomplete Earn interest events')
  return total
 }})
 if(!next.pending&&next.checkpoint){
  const n=BigInt(next.checkpoint.block),[balance,scaled,previous,b]=await Promise.all([client.readContract({address,abi,functionName:'balanceOf',args:[wallet],blockNumber:n}),client.readContract({address,abi,functionName:'scaledBalanceOf',args:[wallet],blockNumber:n}),index(n),client.getBlock({blockNumber:n})])
  if(b.hash!==next.checkpoint.hash||previous!==BigInt(next.checkpoint.index))throw Error('Earn checkpoint changed')
  next.earnedUnits=String(totalEarnInterest(BigInt(next.checkpoint.interest),scaled,previous,balance));next.asOf=Number(b.timestamp)*1000
 }
 await save(next);return next
}
const jobs=new Map<string,Promise<void>>(),failures=new Map<string,number>()
export function earnLedgerKey(owner:string,wallet:string,symbol:EarnSymbol){return 'pocket:earn-interest:v1:'+createHash('sha256').update(owner+':'+wallet.toLowerCase()+':'+symbol).digest('hex')}
export async function readEarnEarnings(owner:string,wallet:Address,symbol:EarnSymbol):Promise<EarnEarningsResult>{
 const key=earnLedgerKey(owner,wallet,symbol),state=await readDurableJson<EarnLedger>(key)||{version:1}
 const age=Date.now()-(state.asOf||0)
 if(age>30000&&!jobs.has(key)&&jobs.size<8&&(failures.get(key)||0)<Date.now()){
  const work=refreshEarnLedger(wallet,symbol,state,async next=>{await mutateDurableJson<EarnLedger>(key,current=>{const rank=(s:EarnLedger)=>BigInt(s.pending?.target.block||s.checkpoint?.block||'0');if(current&&(rank(current)>rank(next)||(rank(current)===rank(next)&&!current.pending&&next.pending)))return current;if(current?.pending&&next.pending&&rank(current)===rank(next)&&BigInt(current.pending.cursorBlock)<BigInt(next.pending.cursorBlock))return current;return next})}).then(()=>{failures.delete(key)}).catch(()=>{if(failures.size>256)failures.delete(failures.keys().next().value!);failures.set(key,Date.now()+15000)}).finally(()=>jobs.delete(key));jobs.set(key,work)
 }
 if(state.earnedUnits!==undefined&&!state.pending&&age<90000)return {status:'ready',earnedUnits:state.earnedUnits,asOf:state.asOf}
 return {status:(failures.get(key)||0)>Date.now()?'unavailable':'syncing'}
}
