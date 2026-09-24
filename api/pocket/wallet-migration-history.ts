import { isAddress } from 'viem'
import { readDurableJson } from '../render-durable-store.js'
import { readPocketWalletUpdate, type PocketWalletUpdateRecord } from './wallet-update-state.js'
type Archive = { version: number; userId: string; links: Array<{ privy_user_id: string; chain: string; purpose?: string; circle_wallet_id: string; circle_wallet_address: string }> }
export function verifiedLegacyPaymentWallets(userId: string, record: PocketWalletUpdateRecord | undefined, archive: Archive | undefined) {
  if (!record || record.userId !== userId || record.version !== 2 || record.phase !== 'completed' || !Number.isFinite(record.completedAt) || record.completedAt! <= 0 || !Number.isFinite(record.executionVerifiedAt) || record.executionVerifiedAt! <= 0 || !Number.isFinite(record.replacementVerifiedAt) || record.replacementVerifiedAt! <= 0 || !archive || archive.userId !== userId || archive.version !== 1 || !Array.isArray(archive.links) || archive.links.length !== 3 || archive.links.some(link => !link || typeof link !== 'object')) return []
  const networks = ['base','arbitrum','arc'] as const
  const rows = networks.map(network => {
    const matches = archive.links.filter(link => link.chain === network)
    const source = record.sources?.[network]
    const link = matches[0]
    if (matches.length !== 1 || !source || typeof source.address !== 'string' || !link || link.privy_user_id !== userId || (link.purpose ?? 'payment') !== 'payment' || link.circle_wallet_id !== source.walletId || !isAddress(link.circle_wallet_address) || link.circle_wallet_address.toLowerCase() !== source.address.toLowerCase()) return null
    return { network, walletId: link.circle_wallet_id, walletAddress: link.circle_wallet_address }
  })
  return rows.every(row => row !== null) ? rows : []
}
export async function readLegacyPaymentWallets(userId: string) {
  const [record, archive] = await Promise.all([readPocketWalletUpdate(userId), readDurableJson<Archive>('pocket:wallet-migration-legacy:v1:' + userId)])
  const original=verifiedLegacyPaymentWallets(userId, record, archive)
  const {additionalNetworks,additionalArchiveKey,additionalPlanKey}=await import('./wallet-additional-alignment.js')
  const additional=await Promise.all(additionalNetworks.map(async network=>{
    const [saved,plan]=await Promise.all([readDurableJson<{version:number;userId:string;network:string;revision:string;source:{walletId:string;address:string};target:{walletId:string;address:string}}>(additionalArchiveKey(userId,network)),readDurableJson<import('./wallet-migration-plan.js').MigrationPlan>(additionalPlanKey(userId,network))])
    const row=plan?.rows[0]
    if(!saved||saved.version!==1||saved.userId!==userId||saved.network!==network||!plan||plan.userId!==userId||plan.scope!=='additional'||plan.phase!=='confirmed'||plan.revision!==saved.revision||plan.rows.length!==1||row?.network!==network||saved.source.walletId!==row.source.walletId||!isAddress(saved.source.address)||saved.source.address.toLowerCase()!==row.source.address.toLowerCase()||saved.target.walletId!==row.target.walletId||saved.target.address.toLowerCase()!==row.target.address.toLowerCase())return null
    return {network,walletId:saved.source.walletId,walletAddress:saved.source.address}
  }))
  return [...original,...additional.filter((w):w is NonNullable<typeof w>=>w!==null)]
}
