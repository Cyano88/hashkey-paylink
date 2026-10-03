// These values must originate from authenticated Circle responses. Reject
// ambiguity instead of choosing the first transaction from a nested payload.
export function arcTradeProviderReference(value:unknown,kind:'transactionId'|'transactionHash'):string|undefined {
  const found=new Set<string>()
  const visit=(value:unknown,depth:number)=>{
    if(depth>8)throw Error('Circle response nesting is invalid.')
    if(!value||typeof value!=='object')return
    if(Array.isArray(value)){for(const item of value)visit(item,depth+1);return}
    for(const [name,item] of Object.entries(value)){
      const names=kind==='transactionId'?['transactionId','transactionID']:['txHash','transactionHash','tx_hash']
      if(names.includes(name)&&item!==undefined&&item!==null&&item!==''){
        const pattern=kind==='transactionId'?/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i:/^0x[a-f0-9]{64}$/i
        if(typeof item!=='string'||!pattern.test(item))throw Error('Circle returned an invalid transaction reference.')
        found.add(item.toLowerCase())
      }
      if(kind==='transactionId'&&name==='correlationIds'){
        if(!Array.isArray(item))throw Error('Circle returned invalid transaction correlations.')
        for(const id of item)visit({transactionId:id},depth+1)
      }else if(item&&typeof item==='object')visit(item,depth+1)
    }
  }
  visit(value,0)
  if(found.size>1)throw Error('Circle returned ambiguous transaction references.')
  return [...found][0]
}
