import {stockQuantity,stockUsdc,stockGasPriceAddress,type StockBalanceSnapshot} from './pocketXStocksWallet'

export function pocketStockBalanceValue(snapshot:StockBalanceSnapshot|null|undefined,prices:Record<string,{usd:number}>){
 const price=(address:string)=>{const n=prices[address.toLowerCase()]?.usd;return Number.isFinite(n)&&n>0?n:null}
 const valued=(quantity:number|null,address:string)=>quantity===null?null:quantity===0?0:price(address)===null?null:quantity*price(address)!
 const cash=snapshot?.cash==null?null:Number(stockQuantity(snapshot.cash,6))
 const gas=snapshot?Number(stockQuantity(snapshot.gas,18)):null
 let investments:number|null=snapshot?.complete?0:null
 if(investments!==null&&snapshot)for(const holding of snapshot.holdings){const value=valued(Number(stockQuantity(holding.units,holding.decimals)),holding.asset.address);if(value===null){investments=null;break}investments+=value}
 const cashUsd=valued(cash,stockUsdc.address),gasUsd=valued(gas,stockGasPriceAddress)
 const total=investments===null||cashUsd===null||gasUsd===null?null:investments+cashUsd+gasUsd
 return {cash,gas,investments,total:total!==null&&Number.isFinite(total)?total:null}
}
