import {sponsoredSwapTradeCall} from './xlayer-swap-activity-proof.js'
import {decodeEventLog,parseAbiItem,decodeFunctionData,formatUnits,type Abi,type Hex} from 'viem'
import routerAbi from '../../src/pocket/lib/pocketOkxRouterAbi.json'
import {OKX_XLAYER_ROUTER,OKX_NATIVE} from '../../src/pocket/lib/pocketXStocksSwap.js'
import {stockAssets} from '../../src/pocket/lib/pocketXStocksWallet.js'
import {formatPocketAssetAmount} from '../../src/pocket/lib/pocketAmountDisplay.js'
import type {ConfirmedStockTransfer,StockNoticeStore} from './xstocks-notifications-store.js'
export type StockTradeProof={hash:string;owner:string;input:string;output:string;inputUnits?:string;feeUnits?:string}
export function stockTradeProof(tx:{hash:string;from:string;to:string|null;input:Hex},receipt:{status:string;logs?:readonly any[]}):StockTradeProof|undefined {
 const sponsored=sponsoredSwapTradeCall(tx,receipt)
 if(sponsored){const proof=stockTradeProof(sponsored.tx,{status:receipt.status});return proof&&proof.input===sponsored.input&&(proof.output==='native'||stockAssets.some(a=>a.address.toLowerCase()===proof.output))&&proof.inputUnits===sponsored.inputUnits?{...proof,feeUnits:sponsored.feeUnits}:undefined}
 if(receipt.status!=='success'||tx.to?.toLowerCase()!==OKX_XLAYER_ROUTER.toLowerCase())return
 try {
  const decoded=decodeFunctionData({abi:routerAbi as Abi,data:tx.input})
  const method=routerAbi.find(a=>a.name===decoded.functionName)!
  const args=Object.fromEntries(method.inputs.map((arg,i)=>[arg.name,decoded.args?.[i]])) as Record<string,any>
  const base=args.baseRequest;if(!base||(args.receiver||tx.from).toLowerCase()!==tx.from.toLowerCase())return
  const input='0x'+(BigInt(base.fromToken)&((1n<<160n)-1n)).toString(16).padStart(40,'0')
  return {inputUnits:String(base.fromTokenAmount),hash:tx.hash.toLowerCase(),owner:tx.from.toLowerCase(),input:input===OKX_NATIVE?'native':input,output:base.toToken.toLowerCase()===OKX_NATIVE?'native':base.toToken.toLowerCase()}
 }catch{return}
}
// Only a successful known-router transaction and its actual net transfers can
// turn generic transfer alerts into a single purchase, sale or swap alert.
export function recordStockTradeNotices(s:StockNoticeStore,transfers:ConfirmedStockTransfer[],proofs:StockTradeProof[]){
 const hashes=new Set(transfers.map(t=>t.hash.toLowerCase()))
 Object.values(s.notices).forEach(n=>{if(n.transfer&&n.hash&&hashes.has(n.hash.toLowerCase()))n.tradeChecked=true})
 for(const proof of proofs){
  const legs=[...new Map(transfers.filter(t=>t.hash.toLowerCase()===proof.hash&&!t.earn).map(t=>[t.id,t])).values()]
  const net=(token:string)=>legs.filter(t=>t.token.toLowerCase()===token).reduce((n,t)=>n+(t.to.toLowerCase()===proof.owner?BigInt(t.units):0n)-(t.from.toLowerCase()===proof.owner?BigInt(t.units):0n),0n)
  const fee=BigInt(proof.feeUnits||'0'),spent=-net(proof.input)-fee,received=net(proof.output)
  if(proof.feeUnits&&spent!==BigInt(proof.inputUnits||'0'))continue
  const input=legs.find(t=>t.token.toLowerCase()===proof.input),output=legs.find(t=>t.token.toLowerCase()===proof.output)
  if(!input||!output||spent<=0n||received<=0n||proof.input===proof.output)continue
  const inStock=stockAssets.some(a=>a.address.toLowerCase()===proof.input),outStock=stockAssets.some(a=>a.address.toLowerCase()===proof.output)
  const action=!inStock&&outStock?'buy':inStock&&!outStock?'sell':'swap'
  const paid=formatPocketAssetAmount(formatUnits(spent,input.decimals),input.symbol)+' '+input.symbol
  const got=formatPocketAssetAmount(formatUnits(received,output.decimals),output.symbol)+' '+output.symbol
  const title=action==='buy'?'Stock purchased':action==='sell'?'Stock sold':'Swap successful'
  const body=action==='buy'?got+' added to your investments.':action==='sell'?paid+' sold. '+got+' added to your Pocket balance.':paid+' swapped for '+got+' on X Layer.'
  for(const [owner,wallet] of Object.entries(s.wallets)){
   if(wallet.address.toLowerCase()!==proof.owner||input.at<wallet.since)continue
   const id=owner+':trade:'+proof.hash
   const prior=Object.values(s.notices).filter(n=>n.owner===owner&&n.hash?.toLowerCase()===proof.hash&&n.transfer)
   if(!s.notices[id])s.notices[id]={id,owner,hash:proof.hash,at:input.at,title,body,delivered:prior.some(n=>n.delivered),trade:{action,...(proof.feeUnits?{feeAmount:formatUnits(fee,input.decimals)}:{}),input:{symbol:input.symbol,amount:formatUnits(spent,input.decimals)},output:{symbol:output.symbol,amount:formatUnits(received,output.decimals)}}}
   prior.forEach(n=>{n.pushSuppressed=true})
  }
 }
}

// Router OrderRecord reports the receiver's actual balance delta after fees.
// https://github.com/okxlabs/Web3-DEX-Router-EVM-V1/blob/main/contracts/8/DexRouter.sol
const orderRecord=parseAbiItem('event OrderRecord(address fromToken,address toToken,address sender,uint256 fromAmount,uint256 returnAmount)')
export function nativeTradeLegs(proof:StockTradeProof,logs:readonly {address:string;topics:readonly string[];data:string}[],at:number):ConfirmedStockTransfer[]{
 if(proof.input!=='native'&&proof.output!=='native')return []
 const token=(a:string)=>a.toLowerCase()===OKX_NATIVE?'native':a.toLowerCase()
 const matches=logs.flatMap(log=>{if(log.address.toLowerCase()!==OKX_XLAYER_ROUTER.toLowerCase())return [];try{const {args}=decodeEventLog({abi:[orderRecord],topics:log.topics as [Hex,...Hex[]],data:log.data as Hex});return args.sender.toLowerCase()===proof.owner&&token(args.fromToken)===proof.input&&token(args.toToken)===proof.output&&args.fromAmount>0n&&args.returnAmount>0n?[args]:[]}catch{return []}})
 if(matches.length!==1)return []
 const event=matches[0],incoming=proof.output==='native'
 return [{id:proof.hash+':native',hash:proof.hash,from:incoming?OKX_XLAYER_ROUTER:proof.owner,to:incoming?proof.owner:OKX_XLAYER_ROUTER,token:'native',symbol:'OKB',units:String(incoming?event.returnAmount:event.fromAmount),decimals:18,at}]
}

