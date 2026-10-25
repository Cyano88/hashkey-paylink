import {getAddress} from 'viem'
import {validBscBridgeDestination,type BscBridgeDestination} from '../../src/pocket/lib/pocketBscOutboundBridge.js'

export async function resolveBscOutboundWallets(owner:string,network:BscBridgeDestination,deps:{user(owner:string):Promise<any>;circle(owner:string,network:string):Promise<{circleWalletAddress:string}|null|undefined>}){
 const [user,circle]=await Promise.all([deps.user(owner),network==='xlayer'?Promise.resolve(null):deps.circle(owner,network)])
 const wallets=user.linkedAccounts.filter((a:any)=>a.type==='wallet'&&a.chainType==='ethereum'&&a.walletClientType==='privy')
 if(wallets.length!==1||!wallets[0].id)throw Object.assign(Error('Open your BNB Chain wallet to continue.'),{status:409})
 const wallet=wallets[0],destination=network==='xlayer'?wallet.address:circle?.circleWalletAddress
 if(!validBscBridgeDestination(network,destination))throw Object.assign(Error('Open your destination wallet to continue.'),{status:409})
 return {ownerId:owner,walletId:wallet.id as string,walletAddress:getAddress(wallet.address),destinationAddress:network==='solana'?destination:getAddress(destination)}
}
