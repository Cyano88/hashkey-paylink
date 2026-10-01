import type {Request,Response} from 'express'
import {GiftError,type GiftIdentity} from './types.js'
import type {createGiftService} from './service.js'
import type {createGiftCodeService} from './codes.js'
type Service=ReturnType<typeof createGiftService>
export function createGiftHandler(deps:{service:Service;codes?:ReturnType<typeof createGiftCodeService>;identity(req:Request):Promise<GiftIdentity>}){
 return async(req:Request,res:Response)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer')
  try{
   if(req.method==='GET'){
    if(req.query.action==='config'){const identity=req.headers?.authorization?await deps.identity(req):undefined;return res.json({ok:true,...deps.service.configuration(identity)})}
    if(typeof req.query.id!=='string')throw new GiftError(400,'Choose a gift.')
    return res.json({ok:true,gift:await deps.service.view(req.query.id)})
   }
   if(req.method!=='POST')return res.status(405).json({ok:false,error:{message:'Method not allowed.'}})
   const identity=await deps.identity(req),body=req.body
   if(!body||typeof body!=='object'||Array.isArray(body))throw new GiftError(400,'Invalid gift request.')
   const allowed:Record<string,string[]>={'issue-code':['id','secret'],'resolve-code':['code'],'recover-funding':['id','userToken'],'discard-draft':['id'],'owner-status':['id'],create:['requestId','network','amount','claimSigner','expiresAt','message'],'claim-status':['id','transactionHash'],'prepare-claim':['id'],'authorize-funding':['id','userToken'],'authorize-claim':['id','userToken','signature','deadline'],'authorize-refund':['id','userToken']}
   if(typeof body.action!=='string'||!Object.hasOwn(allowed,body.action)||Object.keys(body).some(key=>key!=='action'&&!allowed[body.action].includes(key))||Object.values(body).some(value=>typeof value!=='string'))throw new GiftError(400,'Invalid gift request.')
   if(body.action==='issue-code'||body.action==='resolve-code'){
    if(!deps.codes)throw new GiftError(503,'Gift codes are temporarily unavailable. Use the gift link.')
    const ip=req.ip||req.socket?.remoteAddress||'unknown'
    return res.json({ok:true,...await(body.action==='issue-code'?deps.codes.issue(identity,ip,body.id,body.secret):deps.codes.resolve(identity,ip,body.code))})
   }
   if(body.action==='create')return res.json({ok:true,...await deps.service.create(identity,body)})
   if(typeof body.id!=='string')throw new GiftError(400,'Choose a gift.')
   if(body.action==='discard-draft')return res.json({ok:true,...await deps.service.discardDraft(identity,body.id)})
   if(body.action==='owner-status')return res.json({ok:true,...await deps.service.ownerStatus(identity,body.id)})
   if(body.action==='claim-status')return res.json({ok:true,...await deps.service.claimStatus(identity,body.id,body.transactionHash)})
   if(body.action==='prepare-claim')return res.json({ok:true,claim:await deps.service.claimDetails(identity,body.id)})
   if(!body.userToken||body.userToken.length>8000)throw new GiftError(401,'Reconnect your Pocket wallet.')
   if(body.action==='recover-funding')return res.json({ok:true,...await deps.service.recoverFunding(identity,body.id,body.userToken)})
   const kind=body.action==='authorize-funding'?'funding':body.action==='authorize-refund'?'refund':'claim'
   const result=await deps.service.authorize(identity,body.id,kind,body.userToken,kind==='claim'?{signature:body.signature,deadline:body.deadline}:undefined)
   // No owner IDs, linked wallet IDs or stored signatures in responses.
   return res.json({ok:true,gift:result.gift,approval:{id:result.approval.id,phase:result.approval.phase,challengeId:result.approval.challengeId,transactionId:result.approval.transactionId}})
  }catch(reason){const status=reason instanceof GiftError?reason.status:Number((reason as {status?:number})?.status);const safeStatus=[400,401,403,404,409,429].includes(status)?status:503;return res.status(safeStatus).json({ok:false,error:{message:reason instanceof GiftError?reason.message:safeStatus===401?'Sign in to continue.':'Gift service is temporarily unavailable. Try again shortly.'}})}
 }
}
