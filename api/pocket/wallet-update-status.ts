import type { Request, Response } from 'express'
import { circleLinkKey, readCircleLink, verifiedPrivyUser, type CircleLinkRecord } from '../privy-circle-link.js'
import { readPocketWalletUpdate, type PocketWalletUpdateRecord } from './wallet-update-state.js'

export function migrationActivationComplete(userId: string, record: PocketWalletUpdateRecord | undefined, links: Array<CircleLinkRecord | null>) {
  if (!record || record.userId !== userId || record.phase !== 'completed' || !Number.isFinite(record.completedAt) || record.completedAt! <= 0) return false
  if (!Number.isFinite(record.replacementVerifiedAt) || record.replacementVerifiedAt! <= 0 || !Number.isFinite(record.executionVerifiedAt) || record.executionVerifiedAt! <= 0) return false
  const networks = ['base', 'arbitrum', 'arc'] as const
  return networks.every((network,index) => {
    const target = record.targets?.[network]
    const link = links[index]
    return Boolean(target && link && link.privyUserId === userId && link.chain === network && (link.purpose ?? 'payment') === 'payment' && link.circleWalletId === target.walletId && link.circleWalletAddress.toLowerCase() === target.address.toLowerCase())
  })
}
export default async function handler(req: Request, res: Response) {
  res.setHeader('Cache-Control','no-store')
  if (req.method !== 'GET') return res.status(405).json({ok:false,error:'Method not allowed.'})
  try {
    const identity=await verifiedPrivyUser(req)
    const record=await readPocketWalletUpdate(identity.userId)
    const links=record?.phase === 'completed' ? await Promise.all((['base','arbitrum','arc'] as const).map(network=>readCircleLink(circleLinkKey(identity.userId,network,'payment')))) : []
    return res.json({ok:true,phase:migrationActivationComplete(identity.userId,record,links)?'completed':'not-completed'})
  } catch(error) {
    const status=(error as {status?:number}).status
    return res.status(status===401||status===403?status:503).json({ok:false,error:'Wallet migration status is temporarily unavailable.'})
  }
}
