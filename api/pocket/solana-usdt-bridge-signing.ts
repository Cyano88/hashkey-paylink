import {solanaBridgeWallets} from './solana-external-bridge-wallets.js'
import {parseUnits} from 'viem'
import type {Request} from 'express'
import {verifiedPrivyUser,readCircleLink,circleLinkKey} from '../privy-circle-link.js'
import {createSolanaUsdtBridgeState} from './solana-usdt-bridge-state.js'

export async function authorizePocketSolanaUsdtBridge(req:Request,params:Record<string,string>,startChallenge:()=>Promise<string>){
 const identity=await verifiedPrivyUser(req)
 const state=createSolanaUsdtBridgeState(),record=await state.read(identity.userId,params.bridgeId)
 const {from,to}=await solanaBridgeWallets(identity.userId,record.quote.destination)
 if((params.asset||'USDT')!==record.quote.asset||params.destination!==record.quote.destination||params.destinationAddress?.toLowerCase()!==record.destinationAddress.toLowerCase()||!/^[0-9]+(?:\.[0-9]{1,6})?$/.test(params.amount)||parseUnits(params.amount,6)!==BigInt(record.quote.amountUnits)||from.circleWalletId!==params.walletId||from.circleWalletAddress!==record.walletAddress||to.circleWalletAddress.toLowerCase()!==record.destinationAddress.toLowerCase())throw Error('Linked bridge wallets or amount changed. Review a new quote.')
 return state.authorize({ownerId:identity.userId,id:record.id,walletId:params.walletId,walletAddress:params.walletAddress,rawTransaction:params.rawTransaction},startChallenge)
}
