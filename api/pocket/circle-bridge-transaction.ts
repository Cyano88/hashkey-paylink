/** Read-only Circle reference binding. Provider status never proves settlement. */
export async function circleKitApprovalNotSubmitted(challengeId:string,read:(path:string)=>Promise<Record<string,unknown>>):Promise<boolean>{
 if(!/^[0-9a-f-]{36}$/i.test(challengeId))throw Error('Invalid wallet confirmation reference.')
 const {challenge}=await read('/v1/w3s/user/challenges/'+encodeURIComponent(challengeId)) as {challenge?:Record<string,unknown>}
 if(!challenge)return false
 if(challenge.id!==challengeId)throw Error('Wallet confirmation reference changed.')
 if(!Array.isArray(challenge.correlationIds)||challenge.correlationIds.length!==0)return false
 return ['FAILED','EXPIRED','CANCELLED','CANCELED'].includes(String(challenge.status??challenge.state??'').toUpperCase())
}
export async function readCircleKitTransaction(binding:{challengeId:string;walletId:string;walletAddress:string;blockchain:string;refId:string;callData:string},read:(path:string)=>Promise<Record<string,unknown>>):Promise<string|null>{
 if(!/^[0-9a-f-]{36}$/i.test(binding.challengeId))throw Error('Invalid wallet confirmation reference.')
 const {challenge}=await read('/v1/w3s/user/challenges/'+encodeURIComponent(binding.challengeId)) as {challenge?:Record<string,unknown>}
 if(!challenge)return null
 if(challenge.id!==binding.challengeId)throw Error('Wallet confirmation reference changed.')
 const ids=challenge.correlationIds
 if(!Array.isArray(ids)||ids.length===0)return null
 if(ids.length!==1||typeof ids[0]!=='string'||! /^[0-9a-f-]{36}$/i.test(ids[0]))throw Error('Wallet confirmation correlation is ambiguous.')
 const {transaction:tx}=await read('/v1/w3s/transactions/'+encodeURIComponent(ids[0])) as {transaction?:Record<string,unknown>}
 if(!tx)return null
 const same=(value:unknown,expected:string)=>typeof value==='string'&&value.toLowerCase()===expected.toLowerCase()
 if(tx.id!==ids[0]||tx.refId!==binding.refId||tx.walletId!==binding.walletId||tx.blockchain!==binding.blockchain||tx.operation!=='CONTRACT_EXECUTION'||!same(tx.contractAddress,binding.walletAddress)||!same(tx.sourceAddress,binding.walletAddress))throw Error('Bridge transaction binding changed.')
 // Some provider responses omit calldata. Never treat missing data as a match.
 if(typeof tx.callData!=='string')return null
 if(!same(tx.callData,binding.callData))throw Error('Bridge transaction calldata changed.')
 if(!tx.txHash)return null
 if(typeof tx.txHash!=='string'||!/^0x[0-9a-f]{64}$/i.test(tx.txHash))throw Error('Invalid bridge transaction hash.')
 return tx.txHash
}
