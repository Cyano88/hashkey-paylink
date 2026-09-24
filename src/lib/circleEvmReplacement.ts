import { isAddress, keccak256, toHex } from 'viem'
import type { CircleEvmWalletRecord } from './circleEvmWalletTopology'

export const EVM_REPLACEMENT_PREFIX = 'pocket:evm-candidate:v2:'
export const isEvmReplacementCandidate = (wallet: { refId?: string }) => Boolean(wallet.refId?.startsWith(EVM_REPLACEMENT_PREFIX))
export function replacementBatchRequest(attemptId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(attemptId)) throw new Error('A stable UUID v4 replacement attempt ID is required.')
  const id = attemptId.toLowerCase()
  return { idempotencyKey: id, accountType: 'SCA' as const, blockchains: ['BASE', 'ARB', 'ARC'], metadata: ['Base', 'Arbitrum', 'Arc'].map(name => ({ name: `Pocket ${name} replacement`, refId: EVM_REPLACEMENT_PREFIX + id })) }
}
export const replacementAlignmentRef = (attemptId: string) => replacementBatchRequest(attemptId).metadata[0].refId + ':align:1'
const valid = (wallet: CircleEvmWalletRecord) => !!wallet.id && isAddress(wallet.address) && wallet.accountType === 'SCA' && wallet.state === 'LIVE'

export function inspectEvmReplacement(wallets: CircleEvmWalletRecord[], attemptId: string) {
  const request = replacementBatchRequest(attemptId), originalRef = request.metadata[0].refId, alignmentRef = replacementAlignmentRef(attemptId)
  const candidates = wallets.filter(w => w.refId === originalRef || w.refId === alignmentRef)
  if (!candidates.length) return { status: 'absent' as const }
  if (request.blockchains.some(chain => [originalRef, alignmentRef].some(ref => candidates.filter(w => w.blockchain === chain && w.refId === ref).length > 1))) return { status: 'incomplete' as const }
  if (new Set(candidates.map(w => w.id)).size !== candidates.length || candidates.some(w => !valid(w) || !request.blockchains.includes(w.blockchain) || (w.refId === alignmentRef && !['ARB', 'ARC'].includes(w.blockchain)))) return { status: 'invalid' as const }
  // Never choose arbitrarily among duplicate records, or merge different attempts.

  if (candidates.some(w => w.refId === alignmentRef) && candidates.some(w => w.scaCore !== 'circle_6900_singleowner_v4')) return { status: 'invalid' as const }
  const base = candidates.find(w => w.blockchain === 'BASE' && w.refId === originalRef)
  if (!base || request.blockchains.some(chain => !candidates.some(w => w.blockchain === chain))) return { status: 'incomplete' as const }
  const match = (chain: string) => candidates.filter(w => w.blockchain === chain && w.address.toLowerCase() === base.address.toLowerCase())
  const arbs = match('ARB'), arcs = match('ARC')
  if (arbs.length > 1 || arcs.length > 1) return { status: 'invalid' as const }
  if (arbs.length === 1 && arcs.length === 1) return { status: 'matching' as const, wallets: { base, arbitrum: arbs[0], arc: arcs[0] }, address: base.address }
  if (candidates.some(w => w.refId === alignmentRef) && ['ARB', 'ARC'].some(chain => !candidates.some(w => w.blockchain === chain && w.refId === alignmentRef))) return { status: 'incomplete' as const }
  return { status: 'split' as const }
}

/** One bounded alignment batch; never create a second batch after a failed alignment. */
export function replacementAlignmentRequest(wallets: CircleEvmWalletRecord[], attemptId: string) {
  const original = replacementBatchRequest(attemptId), refId = replacementAlignmentRef(attemptId)
  if (wallets.some(w => w.refId === refId)) return null
  const candidates = wallets.filter(w => w.refId === original.metadata[0].refId)
  if (candidates.length !== 3 || inspectEvmReplacement(candidates, attemptId).status !== 'split' || candidates.some(w => w.scaCore !== 'circle_6900_singleowner_v4')) return null
  const arb = candidates.find(w => w.blockchain === 'ARB')!, arc = candidates.find(w => w.blockchain === 'ARC')!
  if (arb.address.toLowerCase() !== arc.address.toLowerCase()) return null
  const hash = keccak256(toHex('pocket:alignment:v1:' + original.idempotencyKey)).slice(2, 34)
  const idempotencyKey = `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`
  return { idempotencyKey, accountType: 'SCA' as const, scaConfiguration: { scaCore: 'circle_6900_singleowner_v4' }, blockchains: ['ARB', 'ARC'], metadata: ['Arbitrum', 'Arc'].map(name => ({name: `Pocket ${name} alignment`, refId})) }
}

export function canAlignReplacementInventory(wallets: CircleEvmWalletRecord[]) {
  // A full first page is ambiguous: do not infer an index from truncated history.
  if (wallets.length >= 50 || new Set(wallets.map(w => w.id)).size !== wallets.length) return false
  const ordinary = wallets.filter(w => ['BASE', 'ARB', 'ARC'].includes(w.blockchain) && !isEvmReplacementCandidate(w))
  if (ordinary.some(w => !valid(w))) return false
  const count = (chain: string) => ordinary.filter(w => w.blockchain === chain).length
  return count('ARB') > 0 && count('BASE') === count('ARB') + 1 && count('ARB') === count('ARC')
}
export async function prepareEvmReplacement(attemptId: string, io: {
  list(): Promise<CircleEvmWalletRecord[]>
  create(request: ReturnType<typeof replacementBatchRequest>): Promise<{ challengeId?: string }>
  align?(): Promise<{ challengeId?: string; walletReady?: boolean }>
  approve(challengeId: string): Promise<unknown>
}) {
  let wallets = await io.list()
  let result = inspectEvmReplacement(wallets, attemptId)
  if (result.status === 'absent') {
    const challenge = await io.create(replacementBatchRequest(attemptId))
    if (!challenge.challengeId) throw new Error('Circle did not return a wallet creation challenge.')
    await io.approve(challenge.challengeId)
    wallets = await io.list()
    result = inspectEvmReplacement(wallets, attemptId)
  }
  if (result.status === 'split' && io.align && replacementAlignmentRequest(wallets, attemptId)) {
    const challenge = await io.align()
    if (challenge.challengeId) await io.approve(challenge.challengeId)
    else if (!challenge.walletReady) throw new Error('Circle did not return a wallet alignment challenge.')
    return inspectEvmReplacement(await io.list(), attemptId)
  }
  return result
}