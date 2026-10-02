/** Activity history only. Never use these caches as settlement proof. */
export function createActivityLogReader(now = Date.now) {
  const restrictedUntil = new Map<string, number>()
  return async <T>(key: string, ranges: Array<{fromBlock:string;toBlock:string}>, read: (range:{fromBlock:string;toBlock:string})=>Promise<T[]>) => {
    const output:T[]=[]
    const small = async (range:{fromBlock:string;toBlock:string}) => {
      const end=BigInt(range.toBlock)
      for(let start=BigInt(range.fromBlock);start<=end;start+=10n) {
        const last=start+9n<end?start+9n:end
        output.push(...await read({fromBlock:'0x'+start.toString(16),toBlock:'0x'+last.toString(16)}))
      }
    }
    for(const range of ranges) {
      if((restrictedUntil.get(key)??0)>now()) { await small(range); continue }
      try { output.push(...await read(range)) }
      catch(error) {
        if((error as {code?:number})?.code!==-32006 || BigInt(range.toBlock)-BigInt(range.fromBlock)<10n)throw error
        restrictedUntil.set(key,now()+10*60_000)
        await small(range)
      }
    }
    return output
  }
}

/** Only finalized, non-null transactions are retained; confirmed/null reads retry. */
export function createFinalizedActivityReader<T>(now=Date.now, capacity=512) {
  const cache=new Map<string,{value:T;expires:number}>()
  return async (scope:string, signatures:Array<{signature:string;confirmationStatus?:string|null}>, read:(signatures:string[])=>Promise<(T|null)[]>) => {
    const values=new Map<string,T|null>(), missing:string[]=[]
    for(const row of signatures) {
      const key=scope+':'+row.signature, hit=cache.get(key)
      if(row.confirmationStatus==='finalized' && hit && hit.expires>now())values.set(row.signature,hit.value)
      else missing.push(row.signature)
    }
    if(missing.length) {
      const fresh=await read(missing)
      if(fresh.length!==missing.length)throw new Error('Incomplete activity transaction response.')
      missing.forEach((signature,index)=>{
        const value=fresh[index];values.set(signature,value)
        if(value!==null && signatures.some(row=>row.signature===signature && row.confirmationStatus==='finalized')) {
          const key=scope+':'+signature
          if(cache.size>=capacity && !cache.has(key))cache.delete(cache.keys().next().value!)
          cache.set(key,{value,expires:now()+60*60_000})
        }
      })
    }
    return signatures.map(row=>values.get(row.signature)??null)
  }
}
