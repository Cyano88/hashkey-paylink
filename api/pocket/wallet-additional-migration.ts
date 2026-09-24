import {createHash,randomUUID} from 'node:crypto'
import {circleLinkKey,type CircleLinkRecord} from '../privy-circle-link.js'
import {mutateDurableJson,readDurableJson,withDurablePostgresTransaction} from '../render-durable-store.js'
import {readFreshMigrationUsdcUnits} from '../evm-balance.js'
import {type MigrationPlan,retainMigrationPlan} from './wallet-migration-plan.js'
import {migrationTransfersConfirmed} from './wallet-migration-execution.js'
import {createMigrationProvider} from './wallet-migration-provider.js'
import {verifyMigrationReceipt,verifyMigrationActivationReceipts} from './wallet-migration-receipt.js'
import {holdMigrationWallets,withMigrationOperation,releaseUnstartedMigration} from './wallet-migration-guard.js'
import {paymentExecutionRepository} from './payment-execution-intents.js'
import {additionalPlanKey,additionalArchiveKey,additionalBlockchain,type AdditionalNetwork} from './wallet-additional-alignment.js'
import type {CircleEvmWalletRecord} from '../../src/lib/circleEvmWalletTopology.js'

export function buildAdditionalMigration(userId:string,network:AdditionalNetwork,source:CircleLinkRecord,target:CircleEvmWalletRecord,anchor:CircleEvmWalletRecord,units:bigint):MigrationPlan {
 if(source.privyUserId!==userId || source.chain!==network || (source.purpose??'payment')!=='payment' || target.blockchain!==additionalBlockchain[network] || target.state!=='LIVE' || target.accountType!=='SCA' || target.address.toLowerCase()!==anchor.address.toLowerCase() || source.circleWalletAddress.toLowerCase()===target.address.toLowerCase() || units<0n || units>=2n**256n)throw Error('Additional wallet migration does not match.')
 const row={network,source:{walletId:source.circleWalletId,address:source.circleWalletAddress},target:{walletId:target.id,address:target.address},units:units.toString()}
 const canonical={walletId:anchor.id,address:anchor.address}
 const revision=createHash('sha256').update(JSON.stringify({userId,row,anchor:canonical})).digest('hex')
 return {version:1,scope:'additional',anchor:canonical,userId,attemptId:randomUUID(),revision,reviewedAt:Date.now(),phase:'review',rows:[row],transfers:{}}
}
export const readAdditionalMigration=(userId:string,network:AdditionalNetwork)=>readDurableJson<MigrationPlan>(additionalPlanKey(userId,network))
export const saveAdditionalMigration=(plan:MigrationPlan)=>mutateDurableJson<MigrationPlan>(additionalPlanKey(plan.userId,plan.rows[0].network as AdditionalNetwork),current=>retainMigrationPlan(current,plan))

const activationDependencies={
 operation:withMigrationOperation,hold:holdMigrationWallets,release:releaseUnstartedMigration,transaction:withDurablePostgresTransaction,
 provider:createMigrationProvider,balance:readFreshMigrationUsdcUnits,
 intents:(userId:string)=>paymentExecutionRepository.listOwned(userId,undefined,['prepared','authorized','submitted','processing','needs_review']),
}
export async function activateAdditionalMigration(plan:MigrationPlan,userToken:string,overrides:Partial<typeof activationDependencies>={}) {
 const io={...activationDependencies,...overrides}
 if(plan.scope!=='additional' || !plan.anchor || !migrationTransfersConfirmed(plan))throw Error('Additional wallet migration is not ready.')
 const row=plan.rows[0],network=row.network as AdditionalNetwork,key=additionalPlanKey(plan.userId,network)
 return io.operation(plan.userId,async()=>{
  await io.hold(plan)
  try {
   const provider=io.provider(userToken),checkedAt=Date.now()
   const [units,noPending,inventory,receipts,intents]=await Promise.all([
    io.balance(network,row.source.address as `0x${string}`),provider.noPending(row,undefined,plan.transfers[network]?.transactionHash),provider.inventory(row),
    verifyMigrationActivationReceipts(plan,(r,t)=>verifyMigrationReceipt(r,t,{resolveChallenge:id=>provider.resolveChallenge(r,id)})),
    io.intents(plan.userId)
   ])
   if(units!==0n || !noPending || !Array.isArray(inventory.otherAssets) || !receipts || intents.some(i=>i.sourceNetwork===network||i.settlementNetwork===network))throw Error('Your current wallet is still in use. Check the migration before switching addresses.')
   return await io.transaction(async client=>{
    const keys=[circleLinkKey(plan.userId,'base'),circleLinkKey(plan.userId,network)].sort()
    for(const k of keys)await client.query('select pg_advisory_xact_lock(hashtext($1))',[k])
    const saved=await client.query('select value from render_durable_kv where store_key=$1 for update',[key])
    const current=saved.rows[0]?.value as MigrationPlan|undefined
    if(!current || current.revision!==plan.revision || current.userId!==plan.userId || current.scope!=='additional' || !migrationTransfersConfirmed(current) || Date.now()-checkedAt>15000)throw Error('Wallet alignment review changed. Try again.')
    const links=await client.query('select * from privy_circle_links where link_key=any($1::text[]) for update',[keys])
    const base=links.rows.find(l=>l.chain==='base'),source=links.rows.find(l=>l.chain===network)
    if(!base || base.circle_wallet_id!==plan.anchor!.walletId || String(base.circle_wallet_address).toLowerCase()!==row.target.address.toLowerCase() || !source || source.privy_user_id!==plan.userId || (source.purpose??'payment')!=='payment')throw Error('Your unified wallet changed. Recheck alignment.')
    if(current.phase==='confirmed' && source.circle_wallet_id===row.target.walletId)return {completed:true}
    if(source.circle_wallet_id!==row.source.walletId || String(source.circle_wallet_address).toLowerCase()!==row.source.address.toLowerCase())throw Error('Your current wallet changed before activation.')
    await client.query('insert into render_durable_kv(store_key,value) values($1,$2::jsonb)',[additionalArchiveKey(plan.userId,network),JSON.stringify({version:1,userId:plan.userId,network,revision:plan.revision,source:row.source,target:row.target,archivedAt:Date.now()})])
    const updated=await client.query('update privy_circle_links set circle_wallet_id=$2,circle_wallet_address=$3,circle_blockchain=$4,updated_at=now() where link_key=$1 and circle_wallet_id=$5',[circleLinkKey(plan.userId,network),row.target.walletId,row.target.address,additionalBlockchain[network],row.source.walletId])
    if(updated.rowCount!==1)throw Error('Wallet activation conflict.')
    await client.query('update render_durable_kv set value=$2::jsonb,updated_at=now() where store_key=$1',[key,JSON.stringify({...current,phase:'confirmed'})])
    return {completed:true}
   })
  }catch(error){await io.release(plan,key);throw error}
 })
}
