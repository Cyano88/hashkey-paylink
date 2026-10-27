import type {Request,Response} from 'express'
import {resolveCliGrant} from './developer-cli-grants.js'
import {manageAppRemoval} from './developer-app-removal.js'
export function createDeveloperAppRemovalApiHandler(resolve=resolveCliGrant,manage=manageAppRemoval){
 return async(req:Request,res:Response)=>{
  res.setHeader('Cache-Control','no-store')
  if(!['GET','DELETE'].includes(req.method))return res.status(405).json({ok:false,error:'Method not allowed.'})
  try{
   const token=String(req.headers.authorization??'').match(/^Bearer (hpl_cli_[a-f0-9]{64})$/)?.[1]??''
   const grant=await resolve(token,'project:delete')
   if(!grant)return res.status(403).json({ok:false,error:'Owner-approved project:delete access is required. Payment API keys cannot remove apps.'})
   return res.json(await manage({projectId:grant.projectId,ownerId:grant.ownerId,remove:req.method==='DELETE',confirmName:req.body?.confirmName}))
  }catch(error){const status=Number((error as {status?:number}).status)||503;return res.status(status).json({ok:false,error:status<500?(error as Error).message:'App removal could not be verified. Please try again.'})}
 }
}
export default createDeveloperAppRemovalApiHandler()
