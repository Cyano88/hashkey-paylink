import {randomBytes,createHash,createHmac,timingSafeEqual} from 'node:crypto'
export const digest=value=>createHash('sha256').update(value).digest('hex')
export const newApiKey=()=> 'hash_live_'+randomBytes(32).toString('base64url')
export function equal(a,b){const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y)}
export function sessionToken(secret,scope,now=Date.now()){
 const body=Buffer.from(JSON.stringify({v:1,...scope,exp:Math.floor(now/1000)+300})).toString('base64url')
 return body+'.'+createHmac('sha256',secret).update(body).digest('base64url')
}
export function sessionClaims(secret,token,now=Date.now()){
 if(typeof token!=='string'||token.length>2048)throw Object.assign(Error('Invalid customer session.'),{status:401})
 const [body,signature,extra]=token.split('.')
 if(extra||!body||!signature||!equal(signature,createHmac('sha256',secret).update(body).digest('base64url')))throw Object.assign(Error('Invalid customer session.'),{status:401})
 let data;try{data=JSON.parse(Buffer.from(body,'base64url').toString())}catch{throw Object.assign(Error('Invalid customer session.'),{status:401})}
 if(data.v!==1||!Number.isInteger(data.exp)||data.exp<=Math.floor(now/1000)||data.exp>Math.floor(now/1000)+300||!data.workspaceId||!data.keyId||typeof data.customerId!=='string'||!data.customerId.length||data.customerId.length>128)throw Object.assign(Error('Customer session expired or invalid.'),{status:401})
 return data
}
