import {createHash} from 'node:crypto'
import type {Request} from 'express'
import {isAddress} from 'viem'
import {isValidSolanaAddress} from '../../src/lib/solanaAddress.js'
import {checkoutStablecoin} from '../../src/lib/checkoutStablecoins.js'
import {normalizeXPayAcceptance,reconcileXPayAcceptance} from '../../src/pocket/lib/xpayAcceptance.js'
import {validateXPayDestinations,type XPayDestination} from '../../src/pocket/lib/pocketUnifiedXPay.js'
import {circleLinkKey,readCircleLink} from '../privy-circle-link.js'
import {createNgPosMerchant,listPocketXPayPosDestinations} from '../ng-pos.js'
import {mutateDurableJson} from '../render-durable-store.js'
import {readBscWallet} from './bsc-wallet.js'
import {UNIFIED_XPAY_KEY,type UnifiedXPayRecord,type UnifiedXPayStore} from './unified-xpay-store.js'
import {saveXPayHostedDestination,xpayHostedEnabled,type XPayHostedNetwork} from './xpay-hosted-destinations.js'
const circleNetworks=['base','arc','arbitrum','solana','ethereum','polygon']
export function validateXPayCoinNetworks(asset:unknown,networks:unknown):{asset:string;networks:string[]}{
 if(typeof asset!=='string'||!['USDC','USDT','USDe','USDG'].includes(asset)||!Array.isArray(networks)||networks.length>8||new Set(networks).size!==networks.length||networks.some(n=>typeof n!=='string'||!checkoutStablecoin(n,asset)||(circleNetworks.includes(n)&&asset!=='USDC')))throw Object.assign(Error('Choose supported networks for this stablecoin.'),{status:400})
 if(networks.some(n=>!circleNetworks.includes(n)&&!xpayHostedEnabled(n)))throw Object.assign(Error('This network is not available for QR payments yet.'),{status:409})
 return {asset,networks:[...networks].sort()}
}
export async function configureXPayCoin(req:Request,c:UnifiedXPayRecord,current:XPayDestination[],input:{asset:string;networks:string[]}){
 const {asset,networks}=input
 let next=current.filter(d=>d.kind!=='xstocks')
 if(asset==='USDC'){
  const chosen=networks.filter(n=>circleNetworks.includes(n)),old=next.find(d=>d.kind==='stablecoins'&&!d.adapter)
  const before=(old?c.acceptance?.routes.filter(r=>r.destinationId===old.id).map(r=>r.network)||old.networks||[]:[]).slice().sort()
  if(JSON.stringify(before)!==JSON.stringify(chosen)){
   next=next.filter(d=>d!==old)
   if(chosen.length){
    const wallets:Record<string,string>={}
    for(const network of chosen){const link=await readCircleLink(circleLinkKey(c.owner,network,'payment'));if(!link||link.privyUserId!==c.owner||link.chain!==network||!link.circleWalletId||!(network==='solana'?isValidSolanaAddress(link.circleWalletAddress):isAddress(link.circleWalletAddress)))throw Object.assign(Error('Open your '+network+' wallet before enabling it.'),{status:409});wallets[network]=link.circleWalletAddress}
    const key=createHash('sha256').update(JSON.stringify(['xpay-coin',c.id,c.version||0,chosen,wallets])).digest('hex')
    const result=await createNgPosMerchant(Object.assign(Object.create(req),{headers:{...req.headers,'idempotency-key':key}}) as Request,{display_name:c.name,payout_preference:'KEEP_CRYPTO',supported_networks:chosen,circle_smart_wallet_address:wallets[chosen.find(n=>n!=='solana')||'']||'',solana_wallet_address:wallets.solana},wallets)
    const m=('merchant' in result?result.merchant:null) as {merchant_id:string;updated_at:string;supported_networks:string[];network_wallets:Record<string,string>}|null
    if(!m||!m.merchant_id||JSON.stringify(m.supported_networks)!==JSON.stringify(chosen)||chosen.some(n=>m.network_wallets?.[n]?.toLowerCase()!==wallets[n].toLowerCase()))throw Object.assign(Error('Receiving wallets could not be verified. Try again.'),{status:409})
    const destination=(await listPocketXPayPosDestinations(c.owner)).find(d=>d.id===m.merchant_id);if(!destination)throw Object.assign(Error('Receiving setup is not ready. Try again.'),{status:409});next.push(destination)
   }
  }
 }
 for(const network of ['xlayer','bsc'] as XPayHostedNetwork[]){
  const old=next.find(d=>d.adapter===network)
  const previous=old?(c.acceptance?.routes.filter(r=>r.destinationId===old.id).map(r=>r.asset)||old.assets):[]
  const assets=[...new Set([...previous.filter(a=>a!==asset),...(networks.includes(network)?[asset]:[])])].sort()
  if(JSON.stringify(assets)===JSON.stringify([...previous].sort()))continue
  next=next.filter(d=>d!==old)
  if(assets.length){const wallet=await readBscWallet(c.owner);if(!wallet)throw Object.assign(Error('Open your '+(network==='bsc'?'BNB Chain':'X Layer')+' wallet before enabling it.'),{status:409});next.push(await saveXPayHostedDestination({owner:c.owner,terminalId:c.id,name:c.name,network,recipient:wallet.address,assets}))}
 }
 if(next.length)validateXPayDestinations(next.map(d=>d.id),next)
 const acceptance=reconcileXPayAcceptance(c.acceptance,next)
 let saved:UnifiedXPayRecord|undefined
 await mutateDurableJson<UnifiedXPayStore>(UNIFIED_XPAY_KEY,current=>{
  const s=current||{checkouts:[]},live=s.checkouts.find(x=>x.id===c.id&&x.owner===c.owner&&!x.deletedAt)
  if(!live||(live.version||0)!==(c.version||0))throw Object.assign(Error('This terminal changed. Reopen it before saving.'),{status:409})
  live.pastDestinations=[...(live.pastDestinations||[]),...live.destinationIds.map((id,i)=>({id,revision:live.revisions[i]}))].filter((d,i,all)=>all.findIndex(x=>x.id===d.id&&x.revision===d.revision)===i)
  live.destinationIds=next.map(d=>d.id);live.revisions=next.map(d=>d.revision);live.acceptance=normalizeXPayAcceptance(acceptance,next);live.version=(live.version||0)+1;saved=live;return s
 })
 return {id:saved!.id,name:saved!.name,createdAt:saved!.createdAt,version:saved!.version,acceptance:saved!.acceptance,destinations:next}
}
