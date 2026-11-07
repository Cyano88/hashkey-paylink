import type {Request} from 'express'
import {verifiedPrivyUser,circleLinkKey,readCircleLink} from './privy-circle-link.js'
export type CheckoutCashPayer={owner:string;address:string}
/** Refunds use the authenticated payer wallet, never a client supplied address. */
export async function checkoutCashPayer(req:Request):Promise<CheckoutCashPayer>{
 const user=await verifiedPrivyUser(req)
 const link=await readCircleLink(circleLinkKey(user.userId,'base','payment'))
 if(!link||link.privyUserId!==user.userId||link.chain!=='base'||!/^0x[\da-f]{40}$/i.test(link.circleWalletAddress)||/^0x0{40}$/i.test(link.circleWalletAddress))throw Error('Open your Base wallet in Pocket, then return to this checkout.')
 return {owner:user.userId,address:link.circleWalletAddress.toLowerCase()}
}
