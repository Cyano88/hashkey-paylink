import {
  readArcAgreementSnapshot,
  type ArcAgreementChainSnapshot,
  type ArcAgreementPublicClient,
} from './arc-agreement-reconciliation.js'

const DEFAULT_CONFIRMATION_BLOCKS = 5
const MAX_CONFIRMATION_BLOCKS = 128
const confirmedSnapshots = new WeakSet<object>()

export type ArcAgreementConfirmationClient = ArcAgreementPublicClient & {
  getBlockNumber: () => Promise<bigint>
}

export type ArcAgreementConfirmedSnapshot = Readonly<{
  snapshot: Readonly<ArcAgreementChainSnapshot>
  headBlockNumber: bigint
  observedBlockNumber: bigint
  confirmations: number
}>

function confirmationBlocks(value: number | undefined) {
  const configured = value ?? Number(process.env.ARC_AGREEMENT_CONFIRMATION_BLOCKS || DEFAULT_CONFIRMATION_BLOCKS)
  if (!Number.isInteger(configured) || configured < 1 || configured > MAX_CONFIRMATION_BLOCKS) {
    throw new Error(`confirmationBlocks must be a whole number from 1 to ${MAX_CONFIRMATION_BLOCKS}.`)
  }
  return configured
}

export async function readConfirmedArcAgreementSnapshot(
  client: ArcAgreementConfirmationClient,
  escrow: string,
  requiredConfirmations?: number,
): Promise<ArcAgreementConfirmedSnapshot> {
  const confirmations = confirmationBlocks(requiredConfirmations)
  const headBlockNumber = await client.getBlockNumber()
  if (headBlockNumber < BigInt(confirmations)) {
    throw new Error('Arc head is too young for the required confirmation depth.')
  }
  const observedBlockNumber = headBlockNumber - BigInt(confirmations)
  const rawSnapshot = await readArcAgreementSnapshot(client, escrow, { blockNumber: observedBlockNumber })
  const snapshot = Object.freeze({
    ...rawSnapshot,
    cumulativeReleaseBps: Object.freeze([...rawSnapshot.cumulativeReleaseBps]),
  }) as Readonly<ArcAgreementChainSnapshot>
  const confirmed = Object.freeze({
    snapshot,
    headBlockNumber,
    observedBlockNumber,
    confirmations,
  })
  confirmedSnapshots.add(confirmed)
  return confirmed
}

export function assertArcAgreementConfirmedSnapshot(
  confirmed: ArcAgreementConfirmedSnapshot,
) {
  if (!confirmed || !confirmedSnapshots.has(confirmed)) {
    throw new Error('Arc Agreement snapshot was not produced by the confirmed-chain read boundary.')
  }
  return confirmed
}
