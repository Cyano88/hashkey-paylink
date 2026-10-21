import type {Request,Response} from 'express'
import {formatUnits} from 'viem'
import {verifiedPrivyUser} from '../privy-circle-link.js'
import {readBscWallet} from './bsc-wallet.js'
import {createBscRuntime} from './bsc-runtime.js'

export async function readBscAccount(owner:string,d={wallet:readBscWallet,runtime:createBscRuntime}){
 const wallet=await d.wallet(owner)
 const assets=['BNB','USDC','USDT'] as const
 if(!wallet)return {address:null,rows:assets.map(symbol=>({symbol,quantity:0,valueUsd:0})),observedAt:Date.now()}
 const runtime=d.runtime()
 const units=await Promise.all(assets.map(a=>runtime.balance(a,wallet.address)))
 const prices=units.some(u=>u>0n)?await runtime.readPrices():null
 return {address:wallet.address,rows:assets.map((symbol,i)=>({symbol,quantity:Number(formatUnits(units[i],18)),valueUsd:units[i]===0n?0:Number(formatUnits(units[i],18))*Number(prices![symbol].scaled8)/1e8})),observedAt:Date.now()}
}
export default async function handler(req:Request,res:Response){
 res.setHeader('Cache-Control','private, no-store')
 try{
  if(req.method!=='GET')return res.sendStatus(405)
  const {userId}=await verifiedPrivyUser(req)
  return res.json({ok:true,network:'bsc',...await readBscAccount(userId)})
 }catch(e){return res.status((e as any)?.status===401?401:503).json({ok:false,error:'Could not update BNB Chain balances. Try again.'})}
}
