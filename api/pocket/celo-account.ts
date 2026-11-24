import type {Request,Response} from 'express'
import {PrivyClient} from '@privy-io/server-auth'
import {decodeFunctionResult,encodeFunctionData,formatUnits,parseAbi} from 'viem'
import {verifiedPrivyUser} from '../privy-circle-link.js'
import {readRecoveryEvmRpc} from '../evm-read.js'
import {POCKET_CELO,type PocketCeloAsset} from '../../src/pocket/lib/pocketCelo.js'

const balanceAbi=parseAbi(['function balanceOf(address) view returns(uint256)'])
const assetRows=Object.values(POCKET_CELO.assets)
const walletCache=new Map<string,{until:number;wallet:{address:string;id:string}|null}>()

export async function readCeloAccount(owner:string,read=readRecoveryEvmRpc){
  const cached=walletCache.get(owner)
  let wallet=cached&&cached.until>Date.now()?cached.wallet:undefined
  if(wallet===undefined){
    const app=process.env.PRIVY_APP_ID||process.env.VITE_PRIVY_APP_ID,secret=process.env.PRIVY_APP_SECRET
    if(!app||!secret)throw Error('Celo wallet unavailable.')
    const user=await new PrivyClient(app,secret).getUserById(owner)
    const accounts=user.linkedAccounts.filter((a:any)=>a.type==='wallet'&&a.chainType==='ethereum'&&a.walletClientType==='privy')
    if(accounts.length>1||accounts.some((a:any)=>typeof a.address!=='string'||!/^0x[0-9a-f]{40}$/i.test(a.address)||typeof a.id!=='string'))throw Error('Celo wallet binding unavailable.')
    wallet=accounts.length?{address:accounts[0].address,id:accounts[0].id}:null
    if(walletCache.size>=256)walletCache.delete(walletCache.keys().next().value!)
    walletCache.set(owner,{wallet,until:Date.now()+30_000})
  }
  const rows=await Promise.all(assetRows.map(async asset=>{
    if(!wallet)return {symbol:asset.symbol,quantity:0,valueUsd:null}
    const units=asset.native
      ? BigInt(await read('celo','eth_getBalance',[wallet.address,'latest']) as string)
      : decodeFunctionResult({abi:balanceAbi,functionName:'balanceOf',data:await read('celo','eth_call',[{to:asset.address,data:encodeFunctionData({abi:balanceAbi,functionName:'balanceOf',args:[wallet.address as `0x${string}`]})},'latest']) as `0x${string}`})
    const quantity=Number(formatUnits(units,asset.decimals))
    if(!Number.isFinite(quantity)||quantity<0)throw Error('Celo balance was invalid.')
    // This number is a display estimate only; it never feeds Cash Balance or a payment quote.
    const valueUsd=asset.symbol==='USDC'||asset.symbol==='USDT'?quantity:null
    return {symbol:asset.symbol as PocketCeloAsset,quantity,valueUsd}
  }))
  return {address:wallet?.address??null,rows,observedAt:Date.now()}
}

export default async function handler(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store')
  try{
    if(req.method!=='GET')return res.sendStatus(405)
    const {userId}=await verifiedPrivyUser(req)
    return res.json({ok:true,network:'celo',...await readCeloAccount(userId)})
  }catch{return res.status(503).json({ok:false,error:'Could not update Celo balances. Try again.'})}
}
