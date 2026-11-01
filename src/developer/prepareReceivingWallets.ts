import {unlockPocketBaseWallet} from '../pocket/controllers/usePocketWalletController'
import {preparePocketWalletNetworks} from '../pocket/lib/pocketWalletBootstrap'
import {readPocketWallets,linkPocketWallet} from '../pocket/api/pocketWalletLinkClient'
import {resumeCircleProductionEvmWallet,resumeCircleArcMainnetWallet,resumeCircleAdditionalEvmWallet} from '../lib/circleEvmEmailWallet'
import {resumeCircleSolanaEmailWallet} from '../lib/circleSolanaEmailWallet'
import {savePocketSecureWalletSession} from '../pocket/lib/pocketSecureWalletSession'

export async function prepareDeveloperReceivingWallets(params:{authenticated:boolean;email:string;getAccessToken:()=>Promise<string|null>;shouldContinue:()=>boolean}){
 const unlocked=await unlockPocketBaseWallet(params)
 if(!params.shouldContinue())throw Error('Wallet setup cancelled.')
 const token=await params.getAccessToken()
 if(!token)throw Error('Sign in again to enable your wallets.')
 return preparePocketWalletNetworks(unlocked.session,{
  read:()=>readPocketWallets({accessToken:token}),evm:resumeCircleProductionEvmWallet,arc:resumeCircleArcMainnetWallet,
  additional:(session,chain)=>resumeCircleAdditionalEvmWallet(session,chain,token,true),solana:resumeCircleSolanaEmailWallet,
  link:(network,session)=>linkPocketWallet({accessToken:token,network,circleUserToken:session.userToken,wallet:session.wallet}),
  save:session=>savePocketSecureWalletSession(params.email,session),
 },params.shouldContinue)
}
