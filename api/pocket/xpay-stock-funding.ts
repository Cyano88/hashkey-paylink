import {decodeEventLog,formatUnits,getAddress,parseAbiItem,parseUnits,type Address,type Hex} from 'viem'
import {stockAssets,stockUsdc,stockTokenAbi} from '../../src/pocket/lib/pocketXStocksWallet.js'
import {quoteStockSwap} from './xstocks-swap-provider.js'
import {readStockMarketPrices} from './xstocks-prices.js'
import {stockNoticeClient} from './xstocks-notifications-store.js'
import type {StockSwapQuote} from '../../src/pocket/lib/pocketXStocksSwap.js'
function fail(message:string,status=409):never {throw Object.assign(new Error(message),{status})}
const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase()
const transfer=parseAbiItem('event Transfer(address indexed from,address indexed to,uint256 value)')
export function stockUnitsForFunding(requiredUsdc:bigint,price:string,decimals:number){
 if(requiredUsdc<=0n||!Number.isInteger(decimals)||decimals<0||decimals>36)fail('Invalid stock funding amount.',400)
 const rate=parseUnits(price,18);if(rate<=0n)fail('Stock price is unavailable.',503)
 const numerator=requiredUsdc*10n**BigInt(decimals)*10n**12n
 // Estimate only. An executable OKX quote must still meet the exact USDC target.
 return ((numerator+rate-1n)/rate*1006n+999n)/1000n
}
export async function quoteXPayStockFunding(source:Address,token:string,requiredUsdc:bigint){
 const asset=[stockUsdc,...stockAssets].find(a=>same(a.address,token));if(!asset)fail('Choose a supported stock asset.',400)
 if(same(asset.address,stockUsdc.address))return {asset,amount:formatUnits(requiredUsdc,6),amountUnits:String(requiredUsdc),decimals:6,swap:undefined}
 const [prices,decimals]=await Promise.all([readStockMarketPrices([asset.address.toLowerCase()]),stockNoticeClient.readContract({address:getAddress(asset.address),abi:stockTokenAbi,functionName:'decimals'})])
 const price=prices[asset.address.toLowerCase()]?.usd;if(!Number.isFinite(price)||price<=0)fail('An up-to-date stock price is unavailable.',503)
 let units=stockUnitsForFunding(requiredUsdc,price.toFixed(18),decimals)
 for(let attempt=0;attempt<3;attempt++){
  const swap=await quoteStockSwap({owner:source,tokenIn:asset.address,tokenOut:stockUsdc.address,amount:formatUnits(units,decimals)})
  const minimum=BigInt(swap.minimumOutUnits)
  if(minimum>=requiredUsdc)return {asset,amount:swap.amount,amountUnits:swap.amountUnits,decimals,swap}
  if(minimum<=0n)break
  units=(units*requiredUsdc*1001n+minimum*1000n-1n)/(minimum*1000n)
 }
 fail('No stock quote can cover this payment right now. Try another asset.',503)
}
export function verifyXPayStockSwap(quote:StockSwapQuote,tx:{from:string;to:string|null;input:Hex;value:bigint},receipt:{status:string;logs:readonly {address:string;data:Hex;topics:readonly Hex[]}[]},requiredUsdc:bigint){
 if(!same(tx.from,quote.owner)||!tx.to||!same(tx.to,quote.tx.to)||!same(tx.input,quote.tx.data)||tx.value!==BigInt(quote.tx.value))fail('This transaction does not match the approved stock conversion.')
 if(receipt.status==='reverted')return {state:'failed' as const}
 if(receipt.status!=='success')return {state:'pending' as const}
 if(!same(quote.tokenOut.address,stockUsdc.address)||quote.decimalsOut!==6)fail('Stock conversion must return native X Layer USDC.')
 let incoming=0n,spent=0n
 for(const log of receipt.logs){try{const d=decodeEventLog({abi:[transfer],topics:log.topics as [Hex,...Hex[]],data:log.data});if(same(log.address,stockUsdc.address)){if(same(d.args.to,quote.owner))incoming+=d.args.value;if(same(d.args.from,quote.owner))incoming-=d.args.value}else if(same(log.address,quote.tokenIn.address)){if(same(d.args.from,quote.owner))spent+=d.args.value;if(same(d.args.to,quote.owner))spent-=d.args.value}}catch{}}
 if(incoming<BigInt(quote.minimumOutUnits)||incoming<requiredUsdc||spent<=0n||spent>BigInt(quote.amountUnits))fail('The receipt does not prove the approved stock conversion.')
 return {state:'confirmed' as const,receivedUnits:String(incoming),spentUnits:String(spent)}
}
