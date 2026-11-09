import {getAddress,isAddress} from 'viem'
import {readCircleTreasuryConfig,createCircleDeveloperTreasuryClient} from '../circle-developer-treasury.js'
import {readDurableJson,mutateDurableJson} from '../render-durable-store.js'
import {createMarketplaceCheckoutCollections} from './checkout-collections.js'
import {createMarketplaceCollections} from './collections.js'
import type {MarketplaceStore} from './repository.js'
import {createMarketplaceRepository} from './repository.js'
import {marketplaceWebhookTransport} from './webhooks.js'

const reference=/^[a-zA-Z0-9][a-zA-Z0-9:_.-]{1,159}$/
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const zero='0x0000000000000000000000000000000000000000'
type RepositoryDependencies=NonNullable<Parameters<typeof createMarketplaceRepository>[0]>
type ExecutionConfig=NonNullable<RepositoryDependencies['refundExecution']>
type RuntimeAdapters={chain:ExecutionConfig['chain'];authorizeRefund:ExecutionConfig['authorize'];resolveRefundCollection:NonNullable<RepositoryDependencies['resolveRefundCollection']>}

/** Internal collection composition. No public route, worker, wallet creation or transfer. */
export function createMarketplaceCollectionRuntime(input:{env:NodeJS.ProcessEnv;chain:ExecutionConfig['chain'];storage?:Pick<Parameters<typeof createMarketplaceCollections>[0],'read'|'mutate'|'now'>;readCheckout?:Parameters<typeof createMarketplaceCheckoutCollections>[0]['readCheckout'];circle?:Pick<ReturnType<typeof createCircleDeveloperTreasuryClient>,'verifyConfiguredWallet'>}){
 const settings=readMarketplaceRuntimeConfig(input.env),blockers=settings.blockers.filter(b=>b!=='worker_disabled')
 if(input.env.MARKETPLACE_COLLECTIONS_ENABLED!=='true')blockers.push('collections_disabled')
 if(!input.chain||(['getChainId','getTransactionReceipt','getBlock'] as const).some(method=>typeof input.chain[method]!=='function'))blockers.push('base_rpc_client_missing')
 if(blockers.length)throw Error('Marketplace collections are not ready: '+blockers.join(', '))
 const key='hashpaylink:marketplace-accounting-foundation:v1'
 const storage=input.storage??{read:()=>readDurableJson<MarketplaceStore>(key),mutate:(fn:(s:MarketplaceStore)=>MarketplaceStore)=>mutateDurableJson<MarketplaceStore>(key,s=>fn(s??{books:[],drafts:[]})),now:Date.now}
 const circle=input.circle??createCircleDeveloperTreasuryClient({config:settings.config})
 const holding={id:settings.holdingId,revision:settings.holdingRevision,address:settings.config.treasuryAddress,billsAddress:settings.billsAddress}
 const adapter=createMarketplaceCheckoutCollections({...storage,enabled:true,projectIds:settings.projectIds,holding,readCheckout:input.readCheckout,verifyHolding:()=>circle.verifyConfiguredWallet()})
 const collections=createMarketplaceCollections({...storage,enabled:true,holding,chain:input.chain,resolveSession:adapter.resolveSession})
 return {bindCheckout:adapter.bind,verifyCollection:collections.verify,async resolveRefundCollection(request:Parameters<typeof collections.resolveRefundCollection>[0]){
  if(!settings.projectIds.includes(request.projectId))throw Error('Marketplace project is not enabled.')
  return collections.resolveRefundCollection(request)
 }}
}

/** Explicit marketplace names only. Never inherit a Bills wallet or generic Circle credentials. */
export function readMarketplaceRuntimeConfig(env:NodeJS.ProcessEnv=process.env){
 const clean=(key:string)=>(env[key]||'').trim()
 const config=readCircleTreasuryConfig({
  CIRCLE_BASE_URL:clean('MARKETPLACE_CIRCLE_BASE_URL')||'https://api.circle.com',
  CIRCLE_API_KEY:clean('MARKETPLACE_CIRCLE_API_KEY'),
  CIRCLE_ENTITY_SECRET:clean('MARKETPLACE_CIRCLE_ENTITY_SECRET'),
  POCKET_BILLS_TREASURY_WALLET_SET_ID:clean('MARKETPLACE_HOLDING_WALLET_SET_ID'),
  POCKET_BILLS_TREASURY_WALLET_ID:clean('MARKETPLACE_HOLDING_WALLET_ID'),
  POCKET_BILLS_TREASURY_ADDRESS:clean('MARKETPLACE_HOLDING_ADDRESS'),
 })
 const enabled=clean('MARKETPLACE_REFUND_WORKER_ENABLED')==='true'
 const holdingId=clean('MARKETPLACE_HOLDING_ID'),holdingRevision=clean('MARKETPLACE_HOLDING_REVISION')
 const billsAddress=clean('POCKET_BILLS_TREASURY_ADDRESS'),billsWalletId=clean('POCKET_BILLS_TREASURY_WALLET_ID')
 const projectIds=[...new Set(clean('MARKETPLACE_PROJECT_IDS').split(',').map(x=>x.trim()).filter(Boolean))]
 const blockers:string[]=[]
 if(!enabled)blockers.push('worker_disabled')
 if(clean('MARKETPLACE_ENVIRONMENT')!=='base-mainnet')blockers.push('explicit_base_mainnet_environment_required')
 if(!config.credentialsReady)blockers.push('dedicated_circle_credentials_invalid_or_missing')
 if(!config.verificationReady)blockers.push('dedicated_holding_configuration_invalid_or_missing')
 if(!reference.test(holdingId)||!reference.test(holdingRevision))blockers.push('holding_identity_invalid_or_missing')
 if(!projectIds.length||projectIds.length>100||projectIds.some(x=>!reference.test(x)))blockers.push('project_allowlist_invalid_or_missing')
 if(!isAddress(billsAddress)||billsAddress===zero||!uuid.test(billsWalletId))blockers.push('bills_treasury_identity_required_for_isolation_check')
 if(config.treasuryAddress===zero)blockers.push('holding_address_is_zero')
 if(config.walletId&&config.walletId.toLowerCase()===billsWalletId.toLowerCase()||isAddress(config.treasuryAddress)&&isAddress(billsAddress)&&getAddress(config.treasuryAddress)===getAddress(billsAddress))blockers.push('holding_must_be_separate_from_bills')
 // Provisioning is not part of this worker; the underlying client must never create Bills-labelled wallets here.
 config.setupReady=false;config.issues=[]
 return {config,enabled,holdingId,holdingRevision,billsAddress,projectIds,blockers}
}

/** Safe to log: no addresses, IDs, credentials, URLs, raw provider errors or secret lengths. */
export function marketplaceRuntimeReadiness(env:NodeJS.ProcessEnv=process.env,adapters?:Partial<RuntimeAdapters>){
 const configuration=readMarketplaceRuntimeConfig(env),blockers=[...configuration.blockers]
 if(typeof adapters?.resolveRefundCollection!=='function')blockers.push('verified_original_collection_adapter_missing')
 if(typeof adapters?.authorizeRefund!=='function')blockers.push('project_authority_custody_and_fee_adapter_missing')
 if(!adapters?.chain||(['getChainId','getTransactionReceipt','getBlock'] as const).some(method=>typeof adapters.chain?.[method]!=='function'))blockers.push('base_rpc_client_missing')
 return {configured:configuration.blockers.length===0,workerConstructible:blockers.length===0,liveVerified:false,publicApiEnabled:false,network:'base',asset:'USDC',blockers}
}

/** Unmounted composition root. Readiness is configuration only, never evidence of wallet ownership or backing. */
export function createMarketplaceRefundRuntime(input:{env:NodeJS.ProcessEnv;adapters:RuntimeAdapters}){
 const readiness=marketplaceRuntimeReadiness(input.env,input.adapters)
 if(!readiness.workerConstructible)throw Error('Marketplace refund runtime is not ready: '+readiness.blockers.join(', '))
 const {config,holdingId,holdingRevision,billsAddress,projectIds}=readMarketplaceRuntimeConfig(input.env)
 const allowed=new Set(projectIds),adapters=input.adapters
 const repository=createMarketplaceRepository({
  resolveRefundCollection:request=>{if(!allowed.has(request.projectId))throw Error('Marketplace project is not enabled.');return adapters.resolveRefundCollection(request)},
  refundExecution:{enabled:true,config,holdingId,holdingRevision,billsTreasuryAddress:billsAddress,chain:adapters.chain,authorize:reservation=>allowed.has(reservation.collection.projectId)?adapters.authorizeRefund(reservation):Promise.resolve(false)},
  notifyMarketplace:marketplaceWebhookTransport,
 })
 return {readiness,async drain(projectId:string,limit=10){
  if(!allowed.has(projectId))throw Error('Marketplace project is not enabled.')
  return repository.refundWorker.drain(projectId,limit)
 }}
}
