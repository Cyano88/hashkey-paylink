import { isAddress } from 'viem'
import type { CircleEvmWalletRecord } from './circleEvmWalletTopology'

// Tracking metadata only; this does not influence Circle address derivation.
export const EVM_REPLACEMENT_PREFIX = 'pocket:evm-candidate:v2:'
export const isEvmReplacementCandidate = (wallet: { refId?: string }) =>
  Boolean(wallet.refId?.startsWith(EVM_REPLACEMENT_PREFIX))

export function replacementBatchRequest(attemptId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(attemptId)) {
    throw new Error('A stable UUID v4 replacement attempt ID is required.')
  }
  const id = attemptId.toLowerCase()
  return {
    idempotencyKey: id, accountType: 'SCA' as const,
    blockchains: ['BASE', 'ARB', 'ARC'],
    metadata: ['Base', 'Arbitrum', 'Arc'].map(name => ({
      name: `Pocket ${name} replacement`, refId: EVM_REPLACEMENT_PREFIX + id,
    })),
  }
}

export function inspectEvmReplacement(wallets: CircleEvmWalletRecord[], attemptId: string) {
  const request = replacementBatchRequest(attemptId)
  const candidates = wallets.filter(wallet => wallet.refId === request.metadata[0].refId)
  if (!candidates.length) return { status: 'absent' as const }
  const groups = request.blockchains.map(chain => candidates.filter(wallet => wallet.blockchain === chain))
  if (candidates.length !== 3 || groups.some(group => group.length !== 1)) return { status: 'incomplete' as const }
  const [base, arbitrum, arc] = groups.map(group => group[0])
  if (new Set(candidates.map(wallet => wallet.id)).size !== 3 || candidates.some(wallet =>
    !wallet.id || !isAddress(wallet.address) || wallet.accountType !== 'SCA' || wallet.state !== 'LIVE')) {
    return { status: 'invalid' as const }
  }
  if (new Set(candidates.map(wallet => wallet.address.toLowerCase())).size !== 1) return { status: 'split' as const }
  return { status: 'matching' as const, wallets: { base, arbitrum, arc }, address: base.address }
}

// Preparation only: never changes links, sends funds or replaces active sessions.
export async function prepareEvmReplacement(attemptId: string, io: {
  list(): Promise<CircleEvmWalletRecord[]>
  create(request: ReturnType<typeof replacementBatchRequest>): Promise<{ challengeId?: string }>
  approve(challengeId: string): Promise<unknown>
}) {
  const request = replacementBatchRequest(attemptId)
  const before = inspectEvmReplacement(await io.list(), attemptId)
  if (before.status !== 'absent') return before
  const challenge = await io.create(request)
  if (!challenge.challengeId) throw new Error('Circle did not return a wallet creation challenge.')
  await io.approve(challenge.challengeId)
  return inspectEvmReplacement(await io.list(), attemptId)
}
