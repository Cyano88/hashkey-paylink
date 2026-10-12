import type {Request} from 'express'
import {verifiedPrivyUser,readCircleLink,circleLinkKey} from '../privy-circle-link.js'
import {createSolanaUsdtBridgeState} from './solana-usdt-bridge-state.js'

export async function authorizePocketSolanaUsdtBridge(req:Request,params:Record<string,string>,startChallenge:()=>Promise<string>){
 const identity=await verifiedPrivyUser(req)
 const state=createSolanaUsdtBridgeState(),record=await state.read(identity.userId,params.bridgeId)
 const [from,to]=await Promise.all(['solana',record.quote.destination].map(network=>readCircleLink(circleLinkKey(identity.userId,network,'payment'))))
 if(!from||!to||from.circleWalletId!==params.walletId||from.circleWalletAddress!==record.walletAddress||to.circleWalletAddress.toLowerCase()!==record.destinationAddress.toLowerCase())throw Error('Linked bridge wallets changed. Review a new quote.')
 return state.authorize({ownerId:identity.userId,id:record.id,walletId:params.walletId,walletAddress:params.walletAddress,rawTransaction:params.rawTransaction},startChallenge)
}
