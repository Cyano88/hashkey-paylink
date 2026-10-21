import {createHash} from 'node:crypto'
import {sumPrivyTransactionGas,type PrivyGasBinding} from './privy-transaction-gas.js'
export type BscBillingSnapshot={fingerprint:string;checkedAt:number;billedUsdMicros:string;valid:boolean}
export const BSC_BILLING_MAX_AGE_MS=120_000
const unavailable=():never=>{throw Error('Swap fees are still being verified.')}
function fingerprint(bindings:PrivyGasBinding[]){
 if(!bindings.length||bindings.some(b=>b.chainId!==56||b.walletId!==bindings[0].walletId||!/^0x[0-9a-f]{64}$/i.test(b.hash)||!/^[a-zA-Z0-9_-]{10,128}$/.test(b.transactionId)||!/^[a-zA-Z0-9]{10,64}$/.test(b.walletId))||new Set(bindings.map(b=>b.transactionId)).size!==bindings.length||new Set(bindings.map(b=>b.hash.toLowerCase())).size!==bindings.length)return unavailable()
 return createHash('sha256').update(JSON.stringify(bindings.map(b=>[b.walletId,b.chainId,b.transactionId,b.hash.toLowerCase()]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))))).digest('hex')
}
/** Reconciled invoices only: a changed record set or expired snapshot never authorizes spending. */
export function createBscBillingSnapshots(d:{now():number;read(wallet:string):Promise<BscBillingSnapshot|undefined>;write(wallet:string,value:BscBillingSnapshot):Promise<unknown>;transaction(id:string):Promise<unknown>}){
 const work=new Map<string,Promise<void>>()
 async function refresh(bindings:PrivyGasBinding[]){
  if(!bindings.length)return
  const key=fingerprint(bindings),wallet=bindings[0].walletId,existing=work.get(key)
  if(existing)return existing
  const task=(async()=>{
   const checkedAt=d.now()
   try{
    const billed=await sumPrivyTransactionGas(bindings,d.transaction)
    await d.write(wallet,{fingerprint:key,checkedAt,billedUsdMicros:String(billed),valid:true})
   }catch(error){
    await d.write(wallet,{fingerprint:key,checkedAt,billedUsdMicros:'0',valid:false})
    throw error
   }
  })().finally(()=>{work.delete(key)})
  work.set(key,task);return task
 }
 async function read(bindings:PrivyGasBinding[]){
  if(!bindings.length)return 0n
  const key=fingerprint(bindings),s=await d.read(bindings[0].walletId),now=d.now()
  if(s?.valid!==true||s.fingerprint!==key||!Number.isSafeInteger(s.checkedAt)||s.checkedAt>now||now-s.checkedAt>=BSC_BILLING_MAX_AGE_MS||! /^(0|[1-9]\d*)$/.test(s.billedUsdMicros)){
   void refresh(bindings).catch(()=>{})
   return unavailable()
  }
  return BigInt(s.billedUsdMicros)
 }
 return {read,refresh}
}
