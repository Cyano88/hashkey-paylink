import {requireCircleGasStationEvmWallet, type CircleGasStationEvmChain} from '../circle-evm-gas-station.js'
import type {CircleLinkRecord} from '../privy-circle-link.js'
import type {CircleEvmWalletRecord} from '../../src/lib/circleEvmWalletTopology.js'

export async function readCheckoutWalletSession(input:{
  userId:string;chain:CircleGasStationEvmChain;link:CircleLinkRecord|null;
  readOwnedWallet:(chain:CircleGasStationEvmChain,id:string)=>Promise<CircleEvmWalletRecord|null>;
}) {
  const {link,chain,userId}=input
  if(!link||link.privyUserId!==userId||link.chain!==chain||(link.purpose&&link.purpose!=='payment'))throw Object.assign(Error('Your wallet could not be verified. Reconnect and try again.'),{status:403})
  const owned=await input.readOwnedWallet(chain,link.circleWalletId)
  const wallet=requireCircleGasStationEvmWallet({chain,walletId:link.circleWalletId,walletAddress:link.circleWalletAddress,wallets:owned?[owned]:[]})
  // Only identity metadata is returned. No creation, alignment or migration.
  return {id:wallet.id,address:wallet.address,blockchain:wallet.blockchain,accountType:wallet.accountType,state:wallet.state}
}
