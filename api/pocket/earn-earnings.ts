import type {Request,Response} from 'express'
import {isAddress} from 'viem'
import {verifiedPrivyUser} from '../local-currency-profile.js'
import {readStockNotices} from './xstocks-notifications-store.js'
import {readEarnEarnings} from './earn-interest-store.js'
export function createEarnEarningsHandler(deps={verifyUser:verifiedPrivyUser,readWallets:readStockNotices,readEarnings:readEarnEarnings}){return async(req:Request,res:Response)=>{
 res.setHeader('Cache-Control','no-store')
 if(req.method!=='GET')return res.sendStatus(405)
 try{
  const {userId}=await deps.verifyUser(req),symbol=req.query.symbol,wallet=req.query.wallet
  if((symbol!=='USDC'&&symbol!=='USDT0')||typeof wallet!=='string'||!isAddress(wallet))return res.status(400).json({ok:false,error:'Invalid Earn asset.'})
  const registered=(await deps.readWallets()).wallets[userId]
  if(registered?.address.toLowerCase()!==wallet.toLowerCase())return res.status(403).json({ok:false,error:'This is not your registered Pocket wallet.'})
  return res.json({ok:true,...await deps.readEarnings(userId,wallet,symbol)})
 }catch(e){const status=(e as {status?:number}).status;return res.status(status===401||status===403?status:503).json({ok:false,error:'Earnings are temporarily unavailable.'})}
}}
export default createEarnEarningsHandler()
