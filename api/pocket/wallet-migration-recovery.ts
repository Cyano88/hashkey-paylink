import { isAddress } from 'viem'
﻿import { createHash, randomUUID } from 'node:crypto'
import type { CircleLinkRecord } from '../privy-circle-link.js'
import { mutateDurableJson } from '../render-durable-store.js'
import { migrationTransfersConfirmed } from './wallet-migration-execution.js'
import { migrationNetworks, type MigrationPlan } from './wallet-migration-plan.js'
import { readLegacyPaymentWallets } from './wallet-migration-history.js'
type Network = MigrationPlan['rows'][number]['network']
export function buildLegacyRecoveryPlan(input:{userId:string;network:Network;units:bigint;legacy:Awaited<ReturnType<typeof readLegacyPaymentWallets>>;links:Record<Network,CircleLinkRecord|null>;attemptId?:string;now?:number}):MigrationPlan {
  if(!migrationNetworks.includes(input.network)||input.units<=0n||input.units>=2n**256n) throw new Error('No valid USDC balance to recover.')
  const rows=migrationNetworks.map(network=>{
    const sources=input.legacy.filter(row=>row.network===network)
    const source=sources[0], target=input.links[network]
    if(sources.length!==1||!source||!target||!isAddress(source.walletAddress)||!isAddress(target.circleWalletAddress)||target.privyUserId!==input.userId||target.chain!==network||(target.purpose??'payment')!=='payment'||source.walletId===target.circleWalletId||source.walletAddress.toLowerCase()===target.circleWalletAddress.toLowerCase()) throw new Error('Previous wallet recovery ownership is incomplete.')
    return {network,source:{walletId:source.walletId,address:source.walletAddress},target:{walletId:target.circleWalletId,address:target.circleWalletAddress},units:network===input.network?input.units.toString():'0'}
  })
  const attemptId=input.attemptId??randomUUID()
  const revision=createHash('sha256').update(JSON.stringify({userId:input.userId,attemptId,rows})).digest('hex')
  return {version:1,userId:input.userId,attemptId,revision,reviewedAt:input.now??Date.now(),phase:'review',rows,transfers:{}}
}
export function retainLegacyRecovery(current:MigrationPlan|undefined,next:MigrationPlan) {
  if(current&&current.userId!==next.userId) throw new Error('Previous wallet recovery owner mismatch.')
  if(current&&Object.keys(current.transfers).length&&!migrationTransfersConfirmed(current)) return current
  return next
}
export const saveLegacyRecoveryPlan=(plan:MigrationPlan)=>mutateDurableJson<MigrationPlan>('pocket:wallet-recovery-plan:v1:'+plan.userId,current=>retainLegacyRecovery(current,plan))
