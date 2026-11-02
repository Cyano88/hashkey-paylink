import {createPublicKey,type KeyObject} from 'node:crypto'
const keys=new Map<string,KeyObject>()
export async function circleNotificationKey(id:string){
 const cached=keys.get(id);if(cached)return cached
 const response=await fetch('https://api.circle.com/v2/notifications/publicKey/'+id,{headers:{Authorization:'Bearer '+process.env.CIRCLE_API_KEY},signal:AbortSignal.timeout(5000),redirect:'error'})
 if(!response.ok)throw Error('Notification key unavailable')
 const body=await response.json(),data=body.data
 if(data?.id!==id||data.algorithm!=='ECDSA_SHA_256'||typeof data.publicKey!=='string')throw Error('Invalid notification key')
 const key=createPublicKey({key:Buffer.from(data.publicKey,'base64'),format:'der',type:'spki'})
 if(key.asymmetricKeyType!=='ec')throw Error('Invalid notification key type')
 if(keys.size>=32)keys.delete(keys.keys().next().value!)
 keys.set(id,key);return key
}

