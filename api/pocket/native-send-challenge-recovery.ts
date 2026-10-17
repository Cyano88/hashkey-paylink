/** Recovery is read-only. A timeout is never evidence that the provider rejected a submission. */
export type NativeChallengeBinding={walletId:string;walletAddress:string;blockchain:string;refId:string}
export async function findNativeSendChallenge(binding:NativeChallengeBinding,read:(path:string)=>Promise<Record<string,unknown>>){
 const response=await read('/v1/w3s/user/challenges'),challenges=response.challenges
 if(!Array.isArray(challenges)||challenges.length>100)throw Error('Wallet confirmation lookup is incomplete.')
 const candidates=challenges.filter(c=>c&&typeof c.id==='string'&&/^[0-9a-f-]{36}$/i.test(c.id)&&Array.isArray(c.correlationIds)&&c.correlationIds.length===1&&typeof c.correlationIds[0]==='string'&&/^[0-9a-f-]{36}$/i.test(c.correlationIds[0]))
 const found=new Set<string>()
 for(let offset=0;offset<candidates.length;offset+=3){
  await Promise.all(candidates.slice(offset,offset+3).map(async c=>{
   const result=await read('/v1/w3s/transactions/'+encodeURIComponent(c.correlationIds[0])),tx=result.transaction as Record<string,unknown>|undefined
   if(!tx||tx.id!==c.correlationIds[0]||tx.refId!==binding.refId||tx.walletId!==binding.walletId||tx.blockchain!==binding.blockchain||tx.operation!=='CONTRACT_EXECUTION'||typeof tx.contractAddress!=='string'||tx.contractAddress.toLowerCase()!==binding.walletAddress.toLowerCase()||typeof tx.sourceAddress!=='string'||tx.sourceAddress.toLowerCase()!==binding.walletAddress.toLowerCase())return
   found.add(c.id)
  }))
 }
 if(found.size>1)throw Error('More than one wallet confirmation matches this transfer.')
 return [...found][0]||null
}
