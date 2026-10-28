import type {Request,Response} from 'express'
import {verifyOperationsIdentity} from './operations-access.js'
import {operationsRequestPolicy,emergencyPermissions} from './operations-policy.js'
import {readPauseState,savePauseState} from './emergency-pause.js'
export {emergencyPermissions} from './operations-policy.js'
export function createEmergencyPauseHandler(d={verify:verifyOperationsIdentity,env:operationsRequestPolicy,read:readPauseState,save:savePauseState}){
 return async(req:Request,res:Response)=>{
  res.setHeader('Cache-Control','no-store')
  try{
   const actor=await d.verify(req),permissions=emergencyPermissions(actor,d.env(req))
   if(!permissions.pause&&!permissions.resume)return res.status(403).json({ok:false,error:'Emergency control access is not assigned to this account.'})
   if(req.method==='GET'){const state=await d.read();return res.json({ok:true,state:{...state,history:state.history.slice(-100).reverse()},permissions})}
   if(req.method!=='POST')return res.status(405).json({ok:false,error:'Method not allowed.'})
   const action=req.body?.action
   if(action==='pause'?!permissions.pause:!permissions.resume)return res.status(403).json({ok:false,error:'You cannot perform this action.'})
   const state=await d.save({action,revision:req.body?.revision,reason:req.body?.reason,proposalId:req.body?.proposalId},actor)
   return res.json({ok:true,state:{...state,history:state.history.slice(-100).reverse()},permissions})
  }catch(e){const error=e as Error&{status?:number};return res.status(error.status??503).json({ok:false,error:error.status&&error.status<500?error.message:'Emergency controls are unavailable. No change was confirmed.'})}
 }
}
export default createEmergencyPauseHandler()
