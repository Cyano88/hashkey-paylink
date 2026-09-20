import { readEvmRpc, readPublicEvmRpc, readPrivateEvmRpc } from '../evm-read.js'
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

// Validate an exact canonical transfer against the caller-selected confirmation head.
// This helper does not choose policy; verifyMigrationReceipt owns that decision.
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
  publicRpc?: typeof readPublicEvmRpc
  privateRpc?: typeof readPrivateEvmRpc
}) {
  if (!transfer.challengeId) return null
  const transaction = await io.resolveChallenge(transfer.challengeId)
  if (!transaction || transaction.walletId !== row.source.walletId || !hash(transaction.transactionHash)) return null
  if (row.network === 'base' || row.network === 'arbitrum') {
    // Fast confirmation for same-owner USDC migration. The authenticated Circle
    // resolver requires COMPLETE. Provider agreement is not L1 finality.
    const readProof = async (read: typeof readEvmRpc) => {
      const receipt = await read(row.network, 'eth_getTransactionReceipt', [transaction.transactionHash]) as Receipt | null
      if (!receipt || !quantity(receipt.blockNumber)) return null
      const [block, head] = await Promise.all([
        read(row.network, 'eth_getBlockByNumber', [receipt.blockNumber, false]),
        read(row.network, 'eth_getBlockByNumber', ['latest', false]),
      ]) as [Block | null, Block | null]
      const proof = inspectMigrationReceipt(row, transaction.transactionHash, receipt, block, head)
      if (!proof || !quantity(head?.timestamp) || BigInt(head!.number!) < BigInt(block!.number!) + 2n || BigInt(head!.timestamp!) < BigInt(block!.timestamp!) + 15n) return null
      return { proof, blockHash: block!.hash!.toLowerCase() }
    }
    const [primary, independent] = await Promise.all([
      readProof(io.privateRpc ?? readPrivateEvmRpc),
      readProof(io.publicRpc ?? readPublicEvmRpc),
    ])
    if (!primary || !independent || primary.blockHash !== independent.blockHash || primary.proof.confirmedAt !== independent.proof.confirmedAt) return null
    return primary.proof
  }
  const rpc = io.rpc ?? readEvmRpc
  const receipt = await rpc(row.network, 'eth_getTransactionReceipt', [transaction.transactionHash]) as Receipt | null
  if (!receipt || !quantity(receipt.blockNumber)) return null
  const [block, finalized] = await Promise.all([
    rpc(row.network, 'eth_getBlockByNumber', [receipt.blockNumber, false]),
    rpc(row.network, 'eth_getBlockByNumber', ['finalized', false]),
  ])
  const proof = inspectMigrationReceipt(row, transaction.transactionHash, receipt, block as Block, finalized as Block)
  if (proof) return proof
  // A healthy RPC can still lag on the finalized tag. Only try the independent
  // reader when the exact canonical transfer is valid and finality height lags.
  const primaryBlock = block as Block | null, primaryFinalized = finalized as Block | null
  if (!primaryFinalized || !quantity(primaryFinalized.number) || BigInt(primaryFinalized.number!) >= BigInt(receipt.blockNumber!)) return null
  if (!inspectMigrationReceipt(row, transaction.transactionHash, receipt, primaryBlock, primaryBlock)) return null
  const independent = io.publicRpc ?? readPublicEvmRpc
  const [publicReceipt, publicBlock, publicFinalized] = await Promise.all([
    independent(row.network, 'eth_getTransactionReceipt', [transaction.transactionHash]),
    independent(row.network, 'eth_getBlockByNumber', [receipt.blockNumber, false]),
    independent(row.network, 'eth_getBlockByNumber', ['finalized', false]),
  ]) as [Receipt | null, Block | null, Block | null]
  if (publicBlock?.hash?.toLowerCase() !== primaryBlock?.hash?.toLowerCase()) return null
  return inspectMigrationReceipt(row, transaction.transactionHash, publicReceipt, publicBlock, publicFinalized)
}

// Revalidate saved confirmations immediately before switching active wallets.
export async function verifyMigrationActivationReceipts(plan: MigrationPlan, verify: (row: Row, transfer: Transfer) => Promise<{ transactionHash: string; confirmedAt: number } | null>) {
  const checks = await Promise.all(plan.rows.map(async row => {
    if (BigInt(row.units) === 0n) return true
    const transfer = plan.transfers[row.network]
    if (!transfer || transfer.state !== 'confirmed' || !hash(transfer.transactionHash)) return false
    const proof = await verify(row, transfer)
    return !!proof && proof.transactionHash.toLowerCase() === transfer.transactionHash!.toLowerCase()
  }))
  return checks.every(Boolean)
}
