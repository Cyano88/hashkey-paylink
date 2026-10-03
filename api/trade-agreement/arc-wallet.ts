import {getAddress, type Address} from 'viem'
import {circleLinkKey,readCircleLink,verifyCircleLinkWallet} from '../privy-circle-link.js'

export type ArcTradeWallet = {id:string;address:Address;blockchain:'ARC'}
export function createArcTradeWalletVerifier(deps={read:readCircleLink,verify:verifyCircleLinkWallet}) {
  return async(userId:string,userToken:unknown):Promise<ArcTradeWallet>=>{
    if(typeof userToken!=='string'||!userToken.trim()||userToken.length>8000)throw Object.assign(Error('Connect your Circle Arc wallet.'),{status:401})
    const link=await deps.read(circleLinkKey(userId,'arc','payment'))
    if(!link||link.privyUserId!==userId||link.chain!=='arc'||(link.purpose??'payment')!=='payment'||link.circleBlockchain!=='ARC')
      throw Object.assign(Error('Connect your Hash PayLink Arc mainnet wallet.'),{status:409})
    const wallet:ArcTradeWallet={id:link.circleWalletId,address:getAddress(link.circleWalletAddress),blockchain:'ARC'}
    await deps.verify({userToken,chain:'arc',wallet,activeWallet:wallet})
    // Do not accept a link that was migrated while ownership was being checked.
    const latest=await deps.read(circleLinkKey(userId,'arc','payment'))
    if(!latest||latest.privyUserId!==userId||latest.chain!=='arc'||(latest.purpose??'payment')!=='payment'
      ||latest.circleBlockchain!=='ARC'||latest.circleWalletId!==wallet.id||getAddress(latest.circleWalletAddress)!==wallet.address)
      throw Object.assign(Error('Your linked Arc wallet changed. Refresh.'),{status:409})
    return wallet
  }
}
export const verifyArcTradeWallet=createArcTradeWalletVerifier()
