import type {Request,Response,NextFunction} from 'express'
import {rateLimit} from '../rate-limit.js'

// Observing a saved operation must not exhaust the submission allowance.
export function createExchangeRateLimit(write:(req:Request,res:Response,next:NextFunction)=>unknown){
 const read=rateLimit({name:'pocket-exchange-read',windowMs:60_000,max:120})
 const quote=rateLimit({name:'pocket-exchange-quote',windowMs:60_000,max:30})
 return (req:Request,res:Response,next:NextFunction)=>{
  const action=req.body?.action
  if(req.method==='GET'||(req.method==='POST'&&['status','verify','bridge-capabilities'].includes(action)))return read(req,res,next)
  if(req.method==='POST'&&action==='quote')return quote(req,res,next)
  return write(req,res,next)
 }
}
