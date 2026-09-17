import { Connection, PublicKey } from '@solana/web3.js'
import { readEvmRpc } from '../evm-read.js'
import { solanaReadFetch } from '../solana-read.js'
import { createWalletActivityReader } from './wallet-activity-cache.js'
import { getAssociatedTokenAddress } from '../solana-token.js'
import { circleLinkKey, readCircleLink } from '../privy-circle-link.js'
import type { PocketActivityRow } from '../../src/pocket/lib/pocketSchemas.js'

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const SOLANA_USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')
const EVM = {
  base: { token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' },
  arbitrum: { token: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' },
  arc: { token: '0xfffffffffffffffffffffffffffffffffffffffe' },
} as const

type EvmNetwork = keyof typeof EVM
type RpcLog = { transactionHash?: string; blockNumber?: string; logIndex?: string; topics?: string[]; data?: string }
type SolanaTokenBalance = { mint?: string; owner?: string; uiTokenAmount?: { uiAmountString?: string | null } }

function addressTopic(address: string) {
  return `0x${address.toLowerCase().replace(/^0x/, '').padStart(64, '0')}`
}

function shortAddress(address: string) {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address
}

function positiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

export function evmLogBlockRanges(
  latest: bigint,
  requestedLookback: bigint,
  blockRange: bigint,
  maxChunks: number,
) {
  const safeRange = blockRange > 0n ? blockRange : 10n
  const safeChunks = Math.max(1, Math.floor(maxChunks))
  const availableBlocks = latest + 1n
  const requestedBlocks = requestedLookback > 0n ? requestedLookback : safeRange
  const boundedBlocks = requestedBlocks < safeRange * BigInt(safeChunks)
    ? requestedBlocks
    : safeRange * BigInt(safeChunks)
  const scannedBlocks = boundedBlocks < availableBlocks ? boundedBlocks : availableBlocks
  const firstBlock = availableBlocks - scannedBlocks
  const ranges: Array<{ fromBlock: string; toBlock: string }> = []
  for (let from = firstBlock; from <= latest; from += safeRange) {
    const end = from + safeRange - 1n > latest ? latest : from + safeRange - 1n
    ranges.push({
      fromBlock: `0x${from.toString(16)}`,
      toBlock: `0x${end.toString(16)}`,
    })
  }
  return ranges
}

export function evmTransferTouchesTopic(topics: readonly string[] | undefined, walletTopic: string) {
  const normalized = walletTopic.toLowerCase()
  return topics?.[1]?.toLowerCase() === normalized || topics?.[2]?.toLowerCase() === normalized
}

export async function evmActivity(network: EvmNetwork, wallet: string, signal: AbortSignal, read = readEvmRpc): Promise<PocketActivityRow[]> {
  if (!/^0x[\da-f]{40}$/i.test(wallet)) throw new Error('Invalid activity wallet.')
  async function rpc<T>(method: string, params: any[]): Promise<T> {
    signal.throwIfAborted()
    const result = await read(network, method, params, signal)
    signal.throwIfAborted()
    return result as T
  }
  const config = EVM[network]
  const latest = BigInt(await rpc<string>('eth_blockNumber', []))
  const lookback = BigInt(Math.min(2048, positiveInteger(process.env.POCKET_ACTIVITY_EVM_LOOKBACK_BLOCKS, 120)))
  const blockRange = BigInt(Math.min(2048, positiveInteger(process.env.POCKET_ACTIVITY_EVM_LOG_BLOCK_RANGE, 10)))
  const maxChunks = Math.min(12, positiveInteger(process.env.POCKET_ACTIVITY_EVM_MAX_LOG_CHUNKS, 12))
  const ranges = evmLogBlockRanges(latest, lookback, blockRange, maxChunks)
  const topic = addressTopic(wallet)
  const logs: RpcLog[] = []
  for (const range of ranges) {
    // Indexed from/to filters exclude unrelated transfers at the provider.
    // A self-transfer appears in both sets and is deduplicated below.
    const matches = await Promise.all([[TRANSFER_TOPIC, topic], [TRANSFER_TOPIC, null, topic]].map(topics =>
      rpc<RpcLog[]>('eth_getLogs', [{ address: config.token, ...range, topics }]),
    ))
    logs.push(...matches.flat())
    if (logs.length > 2_000) throw new Error('Activity result limit reached.')
  }
  const byId = new Map<string, RpcLog>()
  for (const log of logs) {
    if (!evmTransferTouchesTopic(log.topics, topic)) continue
    if (log.transactionHash) byId.set(`${log.transactionHash}:${log.logIndex || '0'}`, log)
  }
  const blockNumbers = [...new Set([...byId.values()].map(log => log.blockNumber).filter(Boolean) as string[])].slice(0, 30)
  const timestamps = new Map<string, number>()
  for (let index = 0; index < blockNumbers.length; index += 4) {
    await Promise.all(blockNumbers.slice(index, index + 4).map(async block => {
      const value = await rpc<{ timestamp?: string }>('eth_getBlockByNumber', [block, false])
      if (value?.timestamp) timestamps.set(block, Number(BigInt(value.timestamp)) * 1000)
    }))
  }
  return [...byId.entries()].flatMap(([id, log]) => {
    const topics = log.topics ?? []
    const sender = topics[1] ? `0x${topics[1].slice(-40)}` : ''
    const recipient = topics[2] ? `0x${topics[2].slice(-40)}` : ''
    const outgoingTransfer = sender.toLowerCase() === wallet.toLowerCase()
    const units = log.data ? BigInt(log.data) : 0n
    if (units <= 0n) return []
    return [{
      eventId: `${network}:${id}`,
      txHash: log.transactionHash || id,
      chain: network,
      payer: outgoingTransfer ? wallet : sender,
      memo: outgoingTransfer ? 'USDC sent' : 'USDC deposit',
      amount: (Number(units) / (network === 'arc' ? 1e18 : 1e6)).toFixed(6).replace(/\.?0+$/, ''),
      ts: timestamps.get(log.blockNumber || '') || Date.now(),
      source: outgoingTransfer ? 'wallet-withdrawal' : 'wallet-deposit',
      contextLabel: outgoingTransfer ? `To ${shortAddress(recipient)}` : `From ${shortAddress(sender)}`,
      settlementType: 'wallet_transfer',
      paycrestStatus: 'confirmed',
      direction: outgoingTransfer ? 'out' : 'in',
      recipient,
      destination: `${network} USDC wallet`,
    } satisfies PocketActivityRow]
  })
}

export function solanaUsdcTransferParties(
  owner: string,
  preBalances: readonly SolanaTokenBalance[] | null | undefined,
  postBalances: readonly SolanaTokenBalance[] | null | undefined,
) {
  const totals = (rows: readonly SolanaTokenBalance[] | null | undefined) => {
    const result = new Map<string, number>()
    for (const row of rows ?? []) {
      if (row.mint !== SOLANA_USDC_MINT.toBase58() || !row.owner) continue
      result.set(row.owner, (result.get(row.owner) || 0) + Number(row.uiTokenAmount?.uiAmountString || 0))
    }
    return result
  }
  const before = totals(preBalances)
  const after = totals(postBalances)
  const owners = new Set([...before.keys(), ...after.keys()])
  const deltas = [...owners].map(address => ({ address, delta: (after.get(address) || 0) - (before.get(address) || 0) }))
  const ownerDelta = deltas.find(row => row.address === owner)?.delta || 0
  const counterparty = deltas
    .filter(row => row.address !== owner && Math.abs(row.delta) >= 0.000001 && Math.sign(row.delta) === -Math.sign(ownerDelta))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0]?.address || ''
  return { ownerDelta, counterparty }
}

export async function findSolanaUsdcTransfer(input: {
  payer: string
  recipient: string
  amount: string
  notBefore: number
  notAfter?: number
  limit?: number
}) {
  const rpcUrl = process.env.SOLANA_RPC_URL?.trim() || 'https://api.mainnet-beta.solana.com'
  const connection = new Connection(rpcUrl, 'confirmed')
  const payer = new PublicKey(input.payer)
  const recipient = new PublicKey(input.recipient).toBase58()
  const payerAta = await getAssociatedTokenAddress(SOLANA_USDC_MINT, payer, true)
  const signatures = await connection.getSignaturesForAddress(payerAta, { limit: Math.max(1, Math.min(input.limit ?? 100, 100)) }, 'confirmed')
  const transactions = await connection.getParsedTransactions(signatures.map(row => row.signature), { maxSupportedTransactionVersion: 0, commitment: 'confirmed' })
  const expected = Number(input.amount)
  const notAfter = input.notAfter ?? Date.now() + 120_000
  for (let index = 0; index < transactions.length; index += 1) {
    const transaction = transactions[index]
    const confirmedAt = Number(transaction?.blockTime ?? signatures[index]?.blockTime ?? 0) * 1_000
    if (!transaction || transaction.meta?.err || !Number.isFinite(confirmedAt) || confirmedAt < input.notBefore || confirmedAt > notAfter) continue
    const transfer = solanaUsdcTransferParties(payer.toBase58(), transaction.meta?.preTokenBalances, transaction.meta?.postTokenBalances)
    if (transfer.counterparty !== recipient || Math.abs(Math.abs(transfer.ownerDelta) - expected) > 0.000001 || transfer.ownerDelta >= 0) continue
    const txHash = signatures[index]?.signature || transaction.transaction.signatures[0]
    if (txHash) return { txHash, confirmedAt }
  }
  return null
}
export async function solanaActivity(wallet: string, signal: AbortSignal, fetcher: typeof fetch = solanaReadFetch): Promise<PocketActivityRow[]> {
  const rpcUrl = process.env.SOLANA_RPC_URL?.trim() || 'https://api.mainnet-beta.solana.com'
  const connection = new Connection(rpcUrl, {
    commitment: 'confirmed', disableRetryOnRateLimit: true,
    fetch: async (url, init) => {
      signal.throwIfAborted()
      const response = await fetcher(url, { ...init, signal })
      if (!response.ok) {
        await response.body?.cancel()
        throw Object.assign(new Error('Activity provider unavailable.'), { code: response.status === 429 || response.status >= 500 ? -32004 : -32003 })
      }
      return response
    },
  })
  const owner = new PublicKey(wallet)
  const ata = await getAssociatedTokenAddress(SOLANA_USDC_MINT, owner, true)
  const signatures = await connection.getSignaturesForAddress(ata, { limit: 20 }, 'confirmed')
  if (!signatures.length) return []
  signal.throwIfAborted()
  const transactions = await connection.getParsedTransactions(signatures.map(row => row.signature), { maxSupportedTransactionVersion: 0, commitment: 'confirmed' })
  signal.throwIfAborted()
  return transactions.flatMap((transaction, index) => {
    if (!transaction || transaction.meta?.err) return []
    const ownerText = owner.toBase58()
    const { ownerDelta: delta, counterparty } = solanaUsdcTransferParties(
      ownerText,
      transaction.meta?.preTokenBalances,
      transaction.meta?.postTokenBalances,
    )
    if (Math.abs(delta) < 0.000001) return []
    const signature = signatures[index]?.signature || transaction.transaction.signatures[0]
    return [{
      eventId: `solana:${signature}`,
      txHash: signature,
      chain: 'solana',
      payer: delta > 0 ? counterparty || 'Solana wallet' : ownerText,
      memo: delta > 0 ? 'USDC deposit' : 'USDC sent',
      amount: Math.abs(delta).toFixed(6).replace(/\.?0+$/, ''),
      ts: (transaction.blockTime || signatures[index]?.blockTime || Math.floor(Date.now() / 1000)) * 1000,
      source: delta > 0 ? 'wallet-deposit' : 'wallet-withdrawal',
      contextLabel: counterparty
        ? `${delta > 0 ? 'From' : 'To'} ${shortAddress(counterparty)}`
        : delta > 0 ? 'Received on Solana' : 'Sent on Solana',
      settlementType: 'wallet_transfer',
      paycrestStatus: 'confirmed',
      direction: delta > 0 ? 'in' : 'out',
      recipient: delta > 0 ? ownerText : counterparty || undefined,
      destination: 'Solana USDC wallet',
    } satisfies PocketActivityRow]
  })
}

const readWalletActivity = createWalletActivityReader((network, wallet, signal) => {
  if (network === 'solana') return solanaActivity(wallet, signal)
  if (!Object.hasOwn(EVM, network)) throw new Error('Unsupported activity network.')
  return evmActivity(network as EvmNetwork, wallet, signal)
})

export async function readPocketWalletChainActivity(
  ownerId: string,
  options: { timeoutMs?: number; limit?: number } = {},
) {
  const timeoutMs = Math.max(500, Math.min(Math.trunc(options.timeoutMs ?? 10_000), 10_000))
  const limit = Math.max(1, Math.min(Math.trunc(options.limit ?? 100), 100))
  const links = await readPocketLinkedWalletAddresses(ownerId)
  const results = await Promise.all(links.map(({ network, walletAddress }) =>
    readWalletActivity(ownerId, network, walletAddress, timeoutMs),
  ))
  return results.flat().sort((a, b) => b.ts - a.ts).slice(0, limit)
}

export async function readPocketLinkedWalletAddresses(ownerId: string) {
  const links = await Promise.all(['base', 'arbitrum', 'arc', 'solana'].map(async network => ({
    network,
    link: await readCircleLink(circleLinkKey(ownerId, network, 'payment')),
  })))
  return links.flatMap(({ network, link }) => link ? [{ network, walletAddress: link.circleWalletAddress }] : [])
}
