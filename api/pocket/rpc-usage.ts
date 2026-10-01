// Aggregate upstream attempts only: no keys, URLs, wallets or request parameters.
export function createRpcUsageCounter(now=Date.now, emit=(value:unknown)=>console.info('[pocket-rpc-usage]',JSON.stringify(value))) {
  let start=now();const counts=new Map<string,number>()
  return (transport:'evm-read'|'solana-read',network:string,method:string,count=1)=>{
    if(now()-start>=300_000) {
      if(counts.size)emit({windowMs:now()-start,attempts:Object.fromEntries(counts)})
      counts.clear();start=now()
    }
    const key=transport+':'+network+':'+method
    if(counts.size<128 || counts.has(key))counts.set(key,(counts.get(key)??0)+count)
  }
}
export const recordPocketRpcRead=createRpcUsageCounter()
