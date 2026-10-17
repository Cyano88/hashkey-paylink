import type {CircleLinkRecord} from '../privy-circle-link.js'
/** Expiring Base-wallet acceptance access; public execution remains a separate gate. */
export function nativeSendPilotAllowed(ownerId:string,link:CircleLinkRecord|null,network:string,now=Date.now()):boolean{
 try{
  const pilot=JSON.parse(process.env.POCKET_NATIVE_SEND_PILOT||'null')
  return !!(pilot&&network==='base'&&Number.isSafeInteger(pilot.expiresAt)&&pilot.expiresAt>now&&pilot.expiresAt<=now+24*60*60*1000&&typeof pilot.walletId==='string'&&/^[0-9a-f-]{36}$/i.test(pilot.walletId)&&typeof pilot.walletAddress==='string'&&/^0x[0-9a-f]{40}$/i.test(pilot.walletAddress)&&link&&link.privyUserId===ownerId&&link.chain==='base'&&(link.purpose??'payment')==='payment'&&link.circleBlockchain==='BASE'&&link.circleWalletId===pilot.walletId&&link.circleWalletAddress.toLowerCase()===pilot.walletAddress.toLowerCase())
 }catch{return false}
}
