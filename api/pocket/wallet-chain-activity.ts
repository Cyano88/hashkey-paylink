import { Connection, PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddress } from '@solana/spl-token'
import { circleLinkKey, readCircleLink } from '../privy-circle-link.js'
import type { PocketActivityRow } from '../../src/pocket/lib/pocketSchemas.js'

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const SOLANA_USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')
const EVM = {
  base: { token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', rpc: 'PRIVATE_RPC_URL', fallback: 'https://mainnet.base.org' },
  arbitrum: { token: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', rpc: 'PRIVATE_RPC_URL_ARB', fallback: 'https://arb1.arbitrum.io/rpc' },
  arc: { token: '0x3600000000000000000000000000000000000000', rpc: 'PRIVATE_RPC_URL_ARC', fallback: 'https://rpc.testnet.arc.network' },
} as const

type EvmNetwork = keyof typeof EVM
type RpcLog = { transactionHash?: string; blockNumber?: string; logIndex?: string; topics?: string[]; data?: string }
type SolanaTokenBalance = { mint?: string; owner?: string; uiTokenAmount?: { uiAmountString?: string | null } }

async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(8_000),
  })
  const data = await response.json() as { result?: T; error?: { message?: string } }
  if (!response.ok || data.error || data.result == null) throw new Error(data.error?.message || `${method} failed`)
  return data.result
}

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

async function evmActivity(network: EvmNetwork, wallet: string): Promise<PocketActivityRow[]> {
  const config = EVM[network]
  const rpcUrl = process.env[config.rpc]?.trim() || config.fallback
  const latest = BigInt(await rpc<string>(rpcUrl, 'eth_blockNumber', []))
  const lookback = BigInt(positiveInteger(process.env.POCKET_ACTIVITY_EVM_LOOKBACK_BLOCKS, 120))
  const blockRange = BigInt(positiveInteger(process.env.POCKET_ACTIVITY_EVM_LOG_BLOCK_RANGE, 10))
  const maxChunks = positiveInteger(process.env.POCKET_ACTIVITY_EVM_MAX_LOG_CHUNKS, 12)
  const ranges = evmLogBlockRanges(latest, lookback, blockRange, maxChunks)
  const topic = addressTopic(wallet)
  const logs: RpcLog[] = []
  for (const range of ranges) {
    logs.push(...await rpc<RpcLog[]>(rpcUrl, 'eth_getLogs', [{
      address: config.token,
      ...range,
      topics: [TRANSFER_TOPIC],
    }]))
  }
  const byId = new Map<string, RpcLog>()
  for (const log of logs) {
    if (!evmTransferTouchesTopic(log.topics, topic)) continue
    if (log.transactionHash) byId.set(`${log.transactionHash}:${log.logIndex || '0'}`, log)
  }
  const blockNumbers = [...new Set([...byId.values()].map(log => log.blockNumber).filter(Boolean) as string[])].slice(0, 30)
  const timestamps = new Map<string, number>()
  await Promise.all(blockNumbers.map(async block => {
    const value = await rpc<{ timestamp?: string }>(rpcUrl, 'eth_getBlockByNumber', [block, false]).catch(() => null)
    if (value?.timestamp) timestamps.set(block, Number(BigInt(value.timestamp)) * 1000)
  }))
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
      amount: (Number(units) / 1_000_000).toFixed(6).replace(/\.?0+$/, ''),
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

async function solanaActivity(wallet: string): Promise<PocketActivityRow[]> {
  const rpcUrl = process.env.SOLANA_RPC_URL?.trim() || 'https://api.mainnet-beta.solana.com'
  const connection = new Connection(rpcUrl, 'confirmed')
  const owner = new PublicKey(wallet)
  const ata = await getAssociatedTokenAddress(SOLANA_USDC_MINT, owner, true)
  const signatures = await connection.getSignaturesForAddress(ata, { limit: 20 }, 'confirmed')
  const transactions = await connection.getParsedTransactions(signatures.map(row => row.signature), { maxSupportedTransactionVersion: 0, commitment: 'confirmed' })
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

export async function readPocketWalletChainActivity(ownerId: string) {
  const links = await Promise.all(['base', 'arbitrum', 'arc', 'solana'].map(async network => ({
    network,
    link: await readCircleLink(circleLinkKey(ownerId, network, 'payment')),
  })))
  const results = await Promise.all(links.map(async ({ network, link }) => {
    if (!link) return []
    try {
      const read = network === 'solana'
        ? solanaActivity(link.circleWalletAddress)
        : evmActivity(network as EvmNetwork, link.circleWalletAddress)
      return await Promise.race([
        read,
        new Promise<PocketActivityRow[]>((_, reject) => setTimeout(() => reject(new Error('chain activity lookup timed out')), 10_000)),
      ])
    } catch (reason) {
      console.warn('[pocket-activity] wallet chain history unavailable', { network, message: reason instanceof Error ? reason.message : 'lookup failed' })
      return []
    }
  }))
  return results.flat()
}
