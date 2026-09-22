import type { Request,Response } from 'express'
import { getAddress } from 'viem'
import { verifiedPrivyUser } from '../local-currency-profile.js'
import { verifyStockWalletOwner } from './xstocks-wallet-owner.js'
import { createStockBalanceCache } from '../../src/pocket/lib/pocketStockBalanceCache.js'
import { readStockHoldings } from '../../src/pocket/lib/pocketXStocksWallet.js'
const balances=createStockBalanceCache((address,previous,signal)=>readStockHoldings(address,previous,signal,{rpcUrl:process.env.XLAYER_RPC_URL}),Date.now,24000)
export async function readServerStockBalances(owner:string,wallet:string,force=false){const key=owner+':'+wallet.toLowerCase();await balances.load(key,getAddress(wallet),force);const value=balances.peek(key);if(!value.snapshot)throw Error('Balances are temporarily unavailable.');return value.snapshot}
export default async function handler(req:Request,res:Response){res.setHeader('Cache-Control','no-store');try{const identity=await verifiedPrivyUser(req),wallet=String(req.body?.wallet||'');await verifyStockWalletOwner(identity.userId,wallet);const snapshot=await readServerStockBalances(identity.userId,wallet,req.body?.force===true);return res.json({ok:true,snapshot:JSON.parse(JSON.stringify(snapshot,(_key,value)=>typeof value==='bigint'?value.toString():value))})}catch(e){const error=e as Error&{status?:number};return res.status(error.status||503).json({ok:false,error:error.status?error.message:'Stock balances could not refresh. Please try again.'})}}
