import type {Request,Response,NextFunction} from 'express'
import {PrivyClient} from '@privy-io/server-auth'
import {rateLimit} from '../rate-limit.js'

let client:PrivyClient|undefined
async function verifiedRateIdentity(req:Request){
 const token=/^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization||''))?.[1]
 if(!token)throw Object.assign(Error('Sign in to continue.'),{status:401})
 const appId=process.env.PRIVY_APP_ID||process.env.VITE_PRIVY_APP_ID,secret=process.env.PRIVY_APP_SECRET
 if(!appId||!secret)throw Object.assign(Error('Authentication is temporarily unavailable.'),{status:503})
 client??=new PrivyClient(appId,secret)
 try{return (await client.verifyAuthToken(token)).userId}catch{throw Object.assign(Error('Sign in again to continue.'),{status:401})}
}

/** Authentication supplies the key; neither body IDs nor unverified token claims do. */
export function createQrRateLimit(verify=verifiedRateIdentity){
 const owners=new WeakMap<Request,string>()
 const ip=rateLimit({name:'qr-ip',windowMs:60_000,max:1200})
 const key=(req:Request)=>{const owner=owners.get(req);if(!owner)throw Error('Verified rate identity required.');return owner}
 const read=rateLimit({name:'qr-user-read',windowMs:60_000,max:120,key})
 const write=rateLimit({name:'qr-user-write',windowMs:60_000,max:20,key})
 return (req:Request,res:Response,next:NextFunction)=>ip(req,res,()=>{
  const publicRead=req.method==='GET'||req.body?.action==='quote'||req.body?.quoteOnly===true
  const readOnly=publicRead||['list','status','mine','merchant','history'].includes(req.body?.action)
  // Public QR discovery and unsigned quotes cannot be assigned an account quota.
  if(publicRead&&!req.headers.authorization)return next()
  void verify(req).then(owner=>{
   if(!owner)throw Object.assign(Error('Sign in again to continue.'),{status:401})
   owners.set(req,owner);(readOnly?read:write)(req,res,next)
  }).catch(error=>{
   if(res.headersSent)return
   const unavailable=error?.status===503
   res.status(unavailable?503:401).json({ok:false,error:unavailable?'Authentication is temporarily unavailable.':'Sign in again to continue.'})
  })
 })
}
