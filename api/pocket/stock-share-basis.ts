import {decodeEventLog,formatUnits,parseAbi,parseAbiItem,parseUnits,type Address} from 'viem'
import {stockAssets} from '../../src/pocket/lib/pocketXStocksWallet.js'
import {buildStockBasis,type BasisNotice,type StockBasis} from '../../src/pocket/lib/pocketStockPnl.js'
import {stockNoticeClient,stockNoticeAsset,type StockNotice} from './xstocks-notifications-store.js'

export type ShareEvidence={tokens:Record<string,{incoming:string;outgoing:string;decimals:number}>}
export type StockOpening={at:number;quantity:string;costUsd:string;shares:boolean}
const shareEvent=parseAbiItem('event TransferShares(address indexed from,address indexed to,uint256 value)')
const addresses=new Set(stockAssets.map(a=>a.address.toLowerCase()))
export async function readStockShareEvidence(hash:string,wallet:string):Promise<ShareEvidence>{
 const receipt=await stockNoticeClient.getTransactionReceipt({hash:hash as Address})
 if(receipt.status!=='success')throw Error('Unconfirmed investment')
 const block=await stockNoticeClient.getBlock({blockNumber:receipt.blockNumber})
 if(block.hash!==receipt.blockHash)throw Error('Investment block changed')
 const tokens:ShareEvidence['tokens']={}
 for(const log of receipt.logs){
  const token=log.address.toLowerCase();if(!addresses.has(token))continue
  let args: {from:Address;to:Address;value:bigint}
  try{args=decodeEventLog({abi:[shareEvent],topics:log.topics,data:log.data}).args}catch{continue}
  const incoming=args.to.toLowerCase()===wallet.toLowerCase(),outgoing=args.from.toLowerCase()===wallet.toLowerCase()
  if(!incoming&&!outgoing)continue
  const p=tokens[token] ||= {incoming:'0',outgoing:'0',decimals:(await stockNoticeAsset(token)).decimals}
  if(incoming)p.incoming=String(BigInt(p.incoming)+args.value)
  if(outgoing)p.outgoing=String(BigInt(p.outgoing)+args.value)
 }
 return {tokens}
}

// Rebase tokens emit immutable TransferShares alongside nominal Transfer events.
// Account in those shares, then convert only the remaining quantity at today's
// multiplier. A split/rebase changes quantity, never the original dollars paid.
export function stockSharePositions(notices:StockNotice[],costs:Record<string,string>,evidence:Record<string,ShareEvidence>,openings:Record<string,StockOpening>={}){
 const adapted:BasisNotice[]=[],shareTokens=new Set<string>(),unknown=new Set<string>(),seenRaw=new Set<string>()
 const bySymbol=new Map(stockAssets.map(a=>[a.symbol,a.address.toLowerCase()]))
 for(const n of notices){
  const involved=n.trade?[bySymbol.get(n.trade.input.symbol),bySymbol.get(n.trade.output.symbol)].filter(Boolean) as string[]:n.transfer&&addresses.has(n.transfer.token.toLowerCase())?[n.transfer.token.toLowerCase()]:[]
  const relevant=involved.filter(a=>!openings[a]||n.at>openings[a].at)
  if(!relevant.length)continue
  const hash=n.hash?.toLowerCase(),proof=hash?evidence[hash]:undefined
  if(!proof){relevant.forEach(a=>unknown.add(a));continue}
  relevant.forEach(a=>{if(proof.tokens[a])shareTokens.add(a);else if(openings[a]?.shares)unknown.add(a)})
  if(n.trade){
   const trade=structuredClone(n.trade)
   for(const side of ['input','output'] as const){const token=bySymbol.get(trade[side].symbol),p=token&&proof.tokens[token];if(!p||(token&&openings[token]&&n.at<=openings[token].at))continue
    const delta=side==='input'?BigInt(p.outgoing)-BigInt(p.incoming):BigInt(p.incoming)-BigInt(p.outgoing)
    if(delta<=0n){unknown.add(token!);continue}
    trade[side].amount=formatUnits(delta,p.decimals)
   }
   adapted.push({...n,trade})
  }else if(n.transfer){
   const token=n.transfer.token.toLowerCase(),p=proof.tokens[token]
   if(!p){adapted.push(n);continue}
   const key=hash+':'+token;if(seenRaw.has(key))continue;seenRaw.add(key)
   const delta=BigInt(p.incoming)-BigInt(p.outgoing);if(delta===0n)continue
   adapted.push({...n,transfer:{...n.transfer,direction:delta>0n?'in':'out',amount:formatUnits(delta>0n?delta:-delta,p.decimals)}})
  }
 }
 const positions=buildStockBasis(adapted,stockAssets,costs)
 for(const [token,opening] of Object.entries(openings)){
  const asset=stockAssets.find(a=>a.address.toLowerCase()===token);if(!asset)continue
  const id='opening:'+token
  const first:BasisNotice={id,hash:id,at:opening.at,trade:{input:{symbol:'USD',amount:opening.costUsd},output:{symbol:asset.symbol,amount:opening.quantity}}}
  positions[token]=buildStockBasis([first,...adapted.filter(n=>n.at>opening.at)],[asset],{...costs,[id]:opening.costUsd})[token]
  if(opening.shares)shareTokens.add(token)
 }
 for(const token of unknown)positions[token]={quantity:positions[token]?.quantity||'0',costUsd:null}
 return {positions,shareTokens}
}
export async function underlyingStockPositions(positions:StockBasis['positions'],shareTokens:Set<string>){
 const tokens=[...shareTokens].filter(a=>positions[a])
 if(!tokens.length)return positions
 const abi=parseAbi(['function getUnderlyingAmountByShares(uint256) view returns(uint256)'])
 const decimals=await Promise.all(tokens.map(stockNoticeAsset))
 const result=await stockNoticeClient.multicall({contracts:tokens.map((token,i)=>({address:token as Address,abi,functionName:'getUnderlyingAmountByShares' as const,args:[parseUnits(positions[token].quantity,decimals[i].decimals)] as const}))})
 result.forEach((r,i)=>{const p=positions[tokens[i]];if(r.status==='success')p.quantity=formatUnits(r.result,decimals[i].decimals);else p.costUsd=null})
 return positions
}
