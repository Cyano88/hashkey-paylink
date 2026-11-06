import {formatUnits,parseUnits} from 'viem'
import type {StockBalanceSnapshot} from './pocketXStocksWallet'

export type StockBasis = {wallet:string;positions:Record<string,{quantity:string;costUsd:string|null;knownQuantity?:string;knownCostUsd?:string}>}
export type BasisNotice = {id:string;at:number;hash?:string;trade?:{input:{symbol:string;amount:string};output:{symbol:string;amount:string}};transfer?:{token:string;symbol:string;amount:string;direction:'in'|'out'}}
// Decimal integers keep tiny shares intact. Average cost is released proportionally
// on a sale or transfer out; proceeds never increase the remaining cost basis.
export function buildStockBasis(notices:BasisNotice[],assets:{symbol:string;address:string}[],costs:Record<string,string>):StockBasis['positions']{
 const bySymbol=new Map(assets.map(a=>[a.symbol,a.address.toLowerCase()]))
 const positions=new Map<string,{quantity:bigint;cost:bigint;knownQuantity:bigint}>()
 const position=(address:string)=>{let p=positions.get(address);if(!p){p={quantity:0n,cost:0n,knownQuantity:0n};positions.set(address,p)}return p}
 const amount=(s:string)=>{if(!/^(0|[1-9]\d*)(\.\d{1,36})?$/.test(s))throw Error('Invalid basis amount');return parseUnits(s,36)}
 const add=(address:string,quantity:bigint,cost:string|undefined)=>{const p=position(address);p.quantity+=quantity;if(cost!==undefined){p.knownQuantity+=quantity;p.cost+=amount(cost)}}
 const remove=(address:string,quantity:bigint)=>{const p=position(address);if(quantity>=p.quantity){p.quantity=0n;p.knownQuantity=0n;p.cost=0n;return}const remaining=p.quantity-quantity;p.knownQuantity=p.knownQuantity*remaining/p.quantity;p.cost=p.cost*remaining/p.quantity;p.quantity=remaining}

 const unique=[...new Map(notices.map(n=>[n.id,n])).values()].sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id))
 const trades=new Set(unique.filter(n=>n.trade&&n.hash).map(n=>n.hash!.toLowerCase()))
 const seen=new Set<string>()
 for(const n of unique){
  if(n.trade&&n.hash){const hash=n.hash.toLowerCase();if(seen.has(hash))continue;seen.add(hash)
   const input=bySymbol.get(n.trade.input.symbol),output=bySymbol.get(n.trade.output.symbol)
   if(input)remove(input,amount(n.trade.input.amount))
   if(output)add(output,amount(n.trade.output.amount),costs[hash])
  }else if(n.transfer&&(!n.hash||!trades.has(n.hash.toLowerCase()))){
   const address=n.transfer.token.toLowerCase();if(bySymbol.get(n.transfer.symbol)!==address)continue
   const quantity=amount(n.transfer.amount)
   if(n.transfer.direction==='in')add(address,quantity,undefined);else remove(address,quantity)
  }
 }
 return Object.fromEntries([...positions].map(([a,p])=>[a,{quantity:formatUnits(p.quantity,36),costUsd:p.knownQuantity===p.quantity?formatUnits(p.cost,36):null,...(p.knownQuantity!==p.quantity?{knownQuantity:formatUnits(p.knownQuantity,36),knownCostUsd:formatUnits(p.cost,36)}:{})}]))
}
export function stockUnrealizedPnl(snapshot:StockBalanceSnapshot|null|undefined,basis:StockBasis|null,quotes:Record<string,{usd:number}>,address?:string){
 if(!snapshot?.complete||!basis)return null
 let value=0,cost=0,partial=false
 const holdings=snapshot.holdings.filter(h=>h.units>0n&&(!address||h.asset.address.toLowerCase()===address.toLowerCase()))
 if(!holdings.length)return null
 for(const h of holdings){const key=h.asset.address.toLowerCase(),p=basis.positions[key],q=quotes[key]
  if(!p||!q||!Number.isFinite(q.usd)||q.usd<=0)return null
  try{if(parseUnits(p.quantity,36)!==h.units*10n**BigInt(36-h.decimals))return null}catch{return null}
  if(p.costUsd===null){
   if(p.knownQuantity===undefined||p.knownCostUsd===undefined)return null
   try{const tracked=parseUnits(p.knownQuantity,36),total=parseUnits(p.quantity,36);if(tracked<0n||tracked>total)return null}catch{return null}
   const trackedCost=Number(p.knownCostUsd);if(!Number.isFinite(trackedCost)||trackedCost<0)return null
   partial=true;value+=Number(p.knownQuantity)*q.usd;cost+=trackedCost
  }else{value+=Number(formatUnits(h.units,h.decimals))*q.usd;cost+=Number(p.costUsd)}
 }
 if(!Number.isFinite(value)||!Number.isFinite(cost)||cost<=0)return null
 return {usd:value-cost,percent:(value-cost)/cost*100,...(partial?{partial:true}:{})}
}
