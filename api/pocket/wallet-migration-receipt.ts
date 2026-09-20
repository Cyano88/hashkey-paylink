import { readEvmRpc } from '../evm-read.js'
import type { MigrationPlan } from './wallet-migration-plan.js'

type Row = MigrationPlan['rows'][number]
type Transfer = NonNullable<MigrationPlan['transfers'][Row['network']]>
const topic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const emitters = { base: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', arbitrum: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', arc: '0xfffffffffffffffffffffffffffffffffffffffe' }
type Receipt = { status?: string; transactionHash?: string; blockNumber?: string; blockHash?: string; logs?: Array<{ address?: string; topics?: string[]; data?: string; removed?: boolean }> }
type Block = { number?: string; hash?: string; timestamp?: string }
const quantity = (value: unknown) => typeof value === 'string' && /^0x[0-9a-f]+$/i.test(value)
const hash = (value: unknown) => typeof value === 'string' && /^0x[0-9a-f]{64}$/i.test(value)
const addressTopic = (address: string) => '0x' + '0'.repeat(24) + address.slice(2).toLowerCase()

// Require an exact transfer in its canonical block, at or below finalized height.
// Unsupported finalized tags fail closed; never downgrade to a mined receipt.
export function inspectMigrationReceipt(row: Row, txHash: string, receipt: Receipt | null, block: Block | null, finalized: Block | null) {
  if (!hash(txHash) || !receipt || receipt.status !== '0x1' || receipt.transactionHash?.toLowerCase() !== txHash.toLowerCase() || !hash(receipt.blockHash) || !quantity(receipt.blockNumber)) return null
  if (!block || !finalized || !hash(finalized.hash) || !quantity(finalized.number) || !quantity(block.number) || !quantity(block.timestamp) || block.hash?.toLowerCase() !== receipt.blockHash!.toLowerCase() || BigInt(block.number!) !== BigInt(receipt.blockNumber!) || BigInt(finalized.number!) < BigInt(receipt.blockNumber!)) return null
  let received = 0n
  for (const log of receipt.logs ?? []) {
    if (log.removed || log.address?.toLowerCase() !== emitters[row.network]) continue
    if (log.topics?.length !== 3 || log.topics[0]?.toLowerCase() !== topic || log.topics[1]?.toLowerCase() !== addressTopic(row.source.address) || log.topics[2]?.toLowerCase() !== addressTopic(row.target.address)) continue
    if (!/^0x[0-9a-f]{64}$/i.test(log.data ?? '')) return null
    received += BigInt(log.data!)
  }
  const expected = BigInt(row.units) * (row.network === 'arc' ? 1_000_000_000_000n : 1n)
  if (expected <= 0n || received !== expected) return null
  const confirmedAt = Number(BigInt(block.timestamp!)) * 1000
  if (!Number.isSafeInteger(confirmedAt) || confirmedAt <= 0) return null
  return { transactionHash: txHash, confirmedAt }
}

export async function verifyMigrationReceipt(row: Row, transfer: Transfer, io: {
  // Resolve through the saved challenge in the authenticated Circle user session.
  resolveChallenge(challengeId: string): Promise<{ walletId: string; transactionHash: string } | null>
  rpc?: typeof readEvmRpc
}) {
  if (!transfer.challengeId) return null
  const transaction = await io.resolveChallenge(transfer.challengeId)
  if (!transaction || transaction.walletId !== row.source.walletId || !hash(transaction.transactionHash)) return null
  const rpc = io.rpc ?? readEvmRpc
  const receipt = await rpc(row.network, 'eth_getTransactionReceipt', [transaction.transactionHash]) as Receipt | null
  if (!receipt || !quantity(receipt.blockNumber)) return null
  const [block, finalized] = await Promise.all([
    rpc(row.network, 'eth_getBlockByNumber', [receipt.blockNumber, false]),
    rpc(row.network, 'eth_getBlockByNumber', ['finalized', false]),
  ])
  return inspectMigrationReceipt(row, transaction.transactionHash, receipt, block as Block, finalized as Block)
}
