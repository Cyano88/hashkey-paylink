import {recordProviderUsage} from './provider-usage.js'
type Rpc=(method:string,params:unknown[])=>Promise<any>
const same=(a:unknown,b:string)=>typeof a==='string'&&a.toLowerCase()===b.toLowerCase()
const unavailable=()=>{throw Object.assign(Error('X Layer sponsorship cost verification is temporarily unavailable.'),{status:503})}
/** Reuse receipt contents, never canonicality: every audit reads fresh blocks.
 * No cached prices, invoice totals, coverage decisions or authorization. */
export function createBillingReceiptReader(now=Date.now,maxEntries=512,ttlMs=30*60_000){
 const receipts=new Map<string,{at:number;receipt:any}>()
 return (rpc:Rpc)=>{
  // Sharing is limited to this audit, so later audits always recheck the chain.
  const blocks=new Map<string,Promise<any>>()
  return async(hash:string)=>{
   const key=hash.toLowerCase(),cached=receipts.get(key)
   try{
    const receipt=cached&&now()>=cached.at&&now()-cached.at<ttlMs?cached.receipt:await rpc('eth_getTransactionReceipt',[hash])
    if(!receipt||!same(receipt.transactionHash,hash)||!/^0x[0-9a-f]+$/i.test(receipt.blockNumber)||!/^0x[0-9a-f]{64}$/i.test(receipt.blockHash)||!['0x0','0x1'].includes(receipt.status)||!Array.isArray(receipt.logs))return unavailable()
    const number=receipt.blockNumber.toLowerCase()
    let work=blocks.get(number)
    if(!work){work=rpc('eth_getBlockByNumber',[number,false]);blocks.set(number,work)}
    const block=await work
    if(!block||!same(block.hash,receipt.blockHash))return unavailable()
    if(receipt===cached?.receipt)recordProviderUsage({feature:'billing-audit',network:'xlayer',operation:'eth_getTransactionReceipt',provider:'none'},'cache-hit')
    if(receipt!==cached?.receipt){
     receipts.delete(key)
     while(receipts.size>=maxEntries)receipts.delete(receipts.keys().next().value!)
     receipts.set(key,{at:now(),receipt:structuredClone(receipt)})
    }
    return structuredClone(receipt)
   }catch(error){receipts.delete(key);throw error}
  }
 }
}
