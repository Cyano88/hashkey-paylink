import {createHash} from 'node:crypto'
import {getAddress} from 'viem'
import {PublicKey} from '@solana/web3.js'
import {PrivyClient} from '@privy-io/server-auth'
import {circleLinkKey,readCircleLink,type CircleLinkRecord} from '../privy-circle-link.js'
import {crossBridgeNetwork,type CrossBridgeNetwork} from '../../src/pocket/lib/pocketCrossBridgeAssets.js'

export type CrossBridgeWallet={network:CrossBridgeNetwork;provider:'circle'|'privy';walletId:string;address:string}
export type CrossBridgeWalletBinding={ownerId:string;source:CrossBridgeWallet;destination:CrossBridgeWallet;fingerprint:string}
export type CrossBridgeWalletDependencies={circle(key:string):Promise<CircleLinkRecord|null>;user(owner:string):Promise<{id:string;linkedAccounts:unknown[]}>}
const fail=():never=>{throw Object.assign(Error('Your bridge wallets changed or are unavailable. Open both wallets and review again.'),{status:409,code:'bridge_wallet_changed'})}
const defaults:CrossBridgeWalletDependencies={circle:readCircleLink,user:owner=>new PrivyClient(process.env.PRIVY_APP_ID||process.env.VITE_PRIVY_APP_ID||'',process.env.PRIVY_APP_SECRET||'').getUserById(owner)}
const chains:Record<string,readonly string[]>={ethereum:['ETH'],base:['BASE'],arbitrum:['ARB','ARBITRUM','ARBITRUM-ONE','ARBITRUM_ONE','ARBITRUMONE'],polygon:['MATIC'],arc:['ARC'],solana:['SOL']}
function address(network:CrossBridgeNetwork,value:unknown){
 if(typeof value!=='string')return fail()
 try{if(network==='solana'){const key=new PublicKey(value);if(key.toBase58()!==value||key.equals(PublicKey.default))return fail();return value}const result=getAddress(value);if(/^0x0{40}$/i.test(result))return fail();return result}catch{return fail()}
}
/** Deterministic wallet identity shared by signed reviews and live resolution. */
export function crossBridgeWalletFingerprint(binding:Pick<CrossBridgeWalletBinding,'ownerId'|'source'|'destination'>){
 if(!binding.ownerId||binding.source.network===binding.destination.network)fail()
 const normalize=(w:CrossBridgeWallet)=>{
  crossBridgeNetwork(w.network)
  if(w.provider!==(['bsc','xlayer'].includes(w.network)?'privy':'circle')||typeof w.walletId!=='string'||!w.walletId.trim())fail()
  const canonical=address(w.network,w.address)
  return [w.network,w.provider,w.walletId,w.network==='solana'?canonical:canonical.toLowerCase()]
 }
 return createHash('sha256').update(JSON.stringify([binding.ownerId,normalize(binding.source),normalize(binding.destination)])).digest('hex')
}
/** ownerId must come from verifiedPrivyUser, never request JSON. Resolves payment wallets only. */
export async function resolveCrossBridgeWallets(ownerId:string,source:CrossBridgeNetwork,destination:CrossBridgeNetwork,deps:CrossBridgeWalletDependencies=defaults):Promise<CrossBridgeWalletBinding>{
 crossBridgeNetwork(source);crossBridgeNetwork(destination)
 if(!ownerId||source===destination)return fail()
 const external=(network:CrossBridgeNetwork)=>network==='bsc'||network==='xlayer'
 // One verified user lookup also guarantees BNB/X Layer share the same registered account.
 const userPromise=external(source)||external(destination)?deps.user(ownerId):Promise.resolve(null)
 const resolve=async(network:CrossBridgeNetwork):Promise<CrossBridgeWallet>=>{
  if(external(network)){
   const user=await userPromise
   if(!user||user.id!==ownerId||!Array.isArray(user.linkedAccounts))return fail()
   const wallets=user.linkedAccounts.filter((a:any)=>a?.type==='wallet'&&a.chainType==='ethereum'&&a.walletClientType==='privy') as Array<{id?:unknown;address?:unknown}>
   if(wallets.length!==1||typeof wallets[0].id!=='string'||!wallets[0].id.trim())return fail()
   return {network,provider:'privy',walletId:wallets[0].id,address:address(network,wallets[0].address)}
  }
  const link=await deps.circle(circleLinkKey(ownerId,network,'payment'))
  if(!link||link.privyUserId!==ownerId||link.chain!==network||(link.purpose??'payment')!=='payment'||typeof link.circleWalletId!=='string'||!link.circleWalletId.trim()||!chains[network]?.includes(link.circleBlockchain?.trim().toUpperCase()))return fail()
  return {network,provider:'circle',walletId:link.circleWalletId,address:address(network,link.circleWalletAddress)}
 }
 const [from,to]=await Promise.all([resolve(source),resolve(destination)])
 const fingerprint=crossBridgeWalletFingerprint({ownerId,source:from,destination:to})
 return {ownerId,source:from,destination:to,fingerprint}
}
/** Re-read on prepare/resume; a quote cannot silently follow wallet replacement. */
export async function revalidateCrossBridgeWallets(binding:CrossBridgeWalletBinding,deps:CrossBridgeWalletDependencies=defaults){
 const current=await resolveCrossBridgeWallets(binding.ownerId,binding.source.network,binding.destination.network,deps)
 if(current.fingerprint!==binding.fingerprint)return fail()
 // Fingerprint alone is not trusted if a caller mutated the binding alongside its fields.
 for(const side of ['source','destination'] as const){const a=current[side],b=binding[side];if(a.provider!==b.provider||a.walletId!==b.walletId||a.address!==address(a.network,b.address))return fail()}
 return current
}
