import dotenv from 'dotenv'
import {createPublicClient,http} from 'viem'
import {base} from 'viem/chains'
dotenv.config({path:'.env.local',quiet:true})
dotenv.config({quiet:true})
const {readDurableJson}=await import('../api/render-durable-store.ts')
const {readMarketplaceRuntimeConfig}=await import('../api/marketplace/runtime.ts')
const {createMarketplaceBackingCheck}=await import('../api/marketplace/backing.ts')
const {createCircleDeveloperTreasuryClient}=await import('../api/circle-developer-treasury.ts')
try {
 const settings=readMarketplaceRuntimeConfig(process.env)
 const blockers=settings.blockers.filter(b=>b!=='worker_disabled')
 const rpc=process.env.MARKETPLACE_BASE_RPC_URL?.trim()
 if(!rpc)blockers.push('marketplace_base_rpc_missing')
 if(blockers.length){console.log(JSON.stringify({backed:false,blockers},null,2));process.exitCode=2}
 else {
  await createCircleDeveloperTreasuryClient({config:settings.config}).verifyConfiguredWallet()
  const check=createMarketplaceBackingCheck({read:()=>readDurableJson('hashpaylink:marketplace-accounting-foundation:v1'),chain:createPublicClient({chain:base,transport:http(rpc)}),holding:{id:settings.holdingId,revision:settings.holdingRevision,address:settings.config.treasuryAddress,billsAddress:settings.billsAddress}})
  const result=await check();console.log(JSON.stringify(result,null,2));if(!result.backed)process.exitCode=2
 }
} catch {console.error('Marketplace backing could not be verified. No wallet, ledger or activation setting was changed.');process.exitCode=1}
