import {createHash,randomUUID} from 'node:crypto'
import {getAddress,isAddress} from 'viem'
import {createCircleDeveloperTreasuryClient,readCircleTreasuryConfig,type CircleDeveloperWallet} from '../circle-developer-treasury.js'
import {readDurableJson,mutateDurableJson} from '../render-durable-store.js'

type Setup={holdingId:string;revision:string;configDigest:string;walletSetKey:string;walletKey:string;walletSetId?:string;wallet?:CircleDeveloperWallet;verified?:boolean}
type Store={setup?:Setup}
const key='hashpaylink:marketplace-holding-provisioning:v1',uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,reference=/^[a-zA-Z0-9][a-zA-Z0-9:_.-]{1,159}$/
type Client=Pick<ReturnType<typeof createCircleDeveloperTreasuryClient>,'createWalletSet'|'createWallet'|'getWallet'>
const defaults={read:()=>readDurableJson<Store>(key),mutate:(fn:(s:Store)=>Store)=>mutateDurableJson<Store>(key,s=>fn(s??{})),client:(config:ReturnType<typeof readCircleTreasuryConfig>):Client=>createCircleDeveloperTreasuryClient({config,purpose:'marketplace'}),uuid:randomUUID}

/** Provisioning is separate from activation. Persist keys before external writes;
 * never mint replacement keys after a timeout, restart or changed configuration. */
export function createMarketplaceProvisioning(env:NodeJS.ProcessEnv,overrides:Partial<typeof defaults>={}){
 const d={...defaults,...overrides},clean=(k:string)=>(env[k]??'').trim()
 const holdingId=clean('MARKETPLACE_HOLDING_ID'),revision=clean('MARKETPLACE_HOLDING_REVISION')
 const bills={id:clean('POCKET_BILLS_TREASURY_WALLET_ID'),setId:clean('POCKET_BILLS_TREASURY_WALLET_SET_ID'),address:clean('POCKET_BILLS_TREASURY_ADDRESS')}
 const base=readCircleTreasuryConfig({CIRCLE_BASE_URL:clean('MARKETPLACE_CIRCLE_BASE_URL')||'https://api.circle.com',CIRCLE_API_KEY:clean('MARKETPLACE_CIRCLE_API_KEY'),CIRCLE_ENTITY_SECRET:clean('MARKETPLACE_CIRCLE_ENTITY_SECRET')})
 const blockers:string[]=[]
 if(clean('MARKETPLACE_PROVISIONING_ENABLED')!=='true')blockers.push('provisioning_disabled')
 if(clean('MARKETPLACE_ENVIRONMENT')!=='base-mainnet')blockers.push('base_mainnet_required')
 if(!base.credentialsReady)blockers.push('dedicated_credentials_missing_or_invalid')
 if(!reference.test(holdingId)||!reference.test(revision))blockers.push('holding_identity_required')
 if(!uuid.test(bills.id)||!uuid.test(bills.setId)||!isAddress(bills.address)||/^0x0{40}$/i.test(bills.address))blockers.push('bills_identity_required')
 // A configured wallet must be audited/migrated, never silently replaced by setup.
 if(['MARKETPLACE_HOLDING_WALLET_ID','MARKETPLACE_HOLDING_WALLET_SET_ID','MARKETPLACE_HOLDING_ADDRESS'].some(k=>clean(k)))blockers.push('holding_already_configured')
 const configDigest=createHash('sha256').update(JSON.stringify([holdingId,revision,base.apiBase,base.apiKey,base.entitySecret,bills])).digest('hex')
 function identity(s:Store){if(!s.setup||s.setup.configDigest!==configDigest)throw Error('Marketplace setup configuration changed; recovery review required.');return s.setup}
 function validWallet(wallet:CircleDeveloperWallet,setId:string){
  if(!uuid.test(wallet.id)||wallet.walletSetId!==setId||wallet.blockchain!=='BASE'||wallet.accountType!=='SCA'||wallet.state!=='LIVE'||!isAddress(wallet.address)||/^0x0{40}$/i.test(wallet.address)||wallet.id.toLowerCase()===bills.id.toLowerCase()||getAddress(wallet.address)===getAddress(bills.address)||setId.toLowerCase()===bills.setId.toLowerCase())throw Error('Marketplace wallet is not an isolated live Base SCA wallet.')
 }
 return {
  readiness:()=>({ready:blockers.length===0,blockers:[...blockers],activationEnabled:false}),
  async provision(){
   if(blockers.length)throw Error('Marketplace provisioning is not ready: '+blockers.join(', '))
   let saved=await d.mutate(s=>{if(s.setup){identity(s);return s}return {setup:{holdingId,revision,configDigest,walletSetKey:d.uuid(),walletKey:d.uuid()}}})
   let setup=identity(saved)
   const config={...base,setupReady:true,walletSetIdempotencyKey:setup.walletSetKey,walletIdempotencyKey:setup.walletKey}
   if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(setup.walletKey)||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(setup.walletSetKey)||setup.walletKey===setup.walletSetKey)throw Error('Invalid persisted provisioning keys.')
   const client=d.client(config)
   if(!setup.walletSetId){
    const created=await client.createWalletSet()
    if(!uuid.test(created.id)||created.id.toLowerCase()===bills.setId.toLowerCase())throw Error('Marketplace wallet set must be separate from Bills.')
    saved=await d.mutate(s=>{const current=identity(s);if(current.walletSetId&&current.walletSetId!==created.id)throw Error('Conflicting wallet set response; review required.');current.walletSetId=created.id;return s});setup=identity(saved)
   }
   if(!setup.wallet){
    const wallet=await client.createWallet(setup.walletSetId!)
    validWallet(wallet,setup.walletSetId!)
    saved=await d.mutate(s=>{const current=identity(s);if(current.wallet&&JSON.stringify(current.wallet)!==JSON.stringify(wallet))throw Error('Conflicting wallet response; review required.');current.wallet=wallet;return s});setup=identity(saved)
   }
   const verified=await client.getWallet(setup.wallet!.id)
   validWallet(verified,setup.walletSetId!)
   if(getAddress(verified.address)!==getAddress(setup.wallet!.address)||verified.id!==setup.wallet!.id)throw Error('Marketplace wallet read-back mismatch.')
   await d.mutate(s=>{identity(s).verified=true;return s})
   // Configuration proposal only. Never write live environment or enable workers.
   return {verified:true,activationEnabled:false,configuration:{MARKETPLACE_HOLDING_ID:holdingId,MARKETPLACE_HOLDING_REVISION:revision,MARKETPLACE_HOLDING_WALLET_SET_ID:setup.walletSetId!,MARKETPLACE_HOLDING_WALLET_ID:verified.id,MARKETPLACE_HOLDING_ADDRESS:getAddress(verified.address)}}
  },
 }
}
