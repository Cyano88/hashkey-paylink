import type { Request, Response } from 'express'
import { createPublicClient, defineChain, http, isAddress, parseAbi, type Address } from 'viem'

const DEFAULT_LOG_CHUNK_SIZE = 2_000n
const DEFAULT_FROM_BLOCK = 0n
const MAX_ROWS = 25

const arcChain = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { decimals: 18, name: 'USD Coin', symbol: 'USDC' },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.network'] } },
})

const STREAM_FACTORY_ABI = parseAbi([
  'event StreamCreated(bytes32 indexed streamId, address indexed vault, address indexed sender, address recipient, uint256 totalAmount, uint64 startTime, uint64 endTime)',
])

const STREAM_VAULT_ABI = parseAbi([
  'function streamInfo() view returns (address _sender, address _recipient, uint256 _totalAmount, uint64 _startTime, uint64 _endTime, uint256 _alreadyWithdrawn, bool _cancelled, uint256 _unlocked, uint256 _claimable)',
])

interface StreamLog {
  transactionHash: `0x${string}` | null
  blockNumber: bigint | null
  logIndex: number
  args: {
    vault?: Address
    sender?: Address
    recipient?: Address
    totalAmount?: bigint
    startTime?: number
    endTime?: number
  }
}

function readBlock(value: unknown, fallback: bigint) {
  try {
    const raw = typeof value === 'string' ? value.trim() : ''
    if (!raw) return fallback
    const parsed = BigInt(raw)
    return parsed >= 0n ? parsed : fallback
  } catch {
    return fallback
  }
}

function readChunkSize() {
  const parsed = readBlock(process.env.STREAM_HISTORY_LOG_CHUNK_SIZE, DEFAULT_LOG_CHUNK_SIZE)
  return parsed > 0n ? parsed : DEFAULT_LOG_CHUNK_SIZE
}

async function getLogsChunked<TLog>(
  getLogs: (fromBlock: bigint, toBlock: bigint) => Promise<TLog[]>,
  fromBlock: bigint,
  toBlock: bigint,
) {
  if (fromBlock > toBlock) return []
  const logs: TLog[] = []
  const chunkSize = readChunkSize()
  for (let from = fromBlock; from <= toBlock; from += chunkSize) {
    const end = from + chunkSize - 1n > toBlock ? toBlock : from + chunkSize - 1n
    try {
      logs.push(...await getLogs(from, end))
    } catch (err) {
      if (end > from) {
        const mid = from + ((end - from) / 2n)
        logs.push(...await getLogsChunked(getLogs, from, mid))
        logs.push(...await getLogsChunked(getLogs, mid + 1n, end))
        continue
      }
      throw err
    }
  }
  return logs
}

export default async function handler(req: Request, res: Response) {
  const recipient = typeof req.query.recipient === 'string' ? req.query.recipient.trim() : ''
  const sender = typeof req.query.sender === 'string' ? req.query.sender.trim() : ''
  if (recipient && !isAddress(recipient)) return res.status(400).json({ ok: false, error: 'Invalid recipient address' })
  if (sender && !isAddress(sender)) return res.status(400).json({ ok: false, error: 'Invalid sender address' })
  if (!recipient && !sender) return res.status(400).json({ ok: false, error: 'recipient or sender is required' })

  const factory = process.env.STREAM_FACTORY_ADDRESS
  if (!factory || !isAddress(factory)) return res.status(500).json({ ok: false, error: 'STREAM_FACTORY_ADDRESS is not configured' })

  const client = createPublicClient({
    chain: arcChain,
    transport: http(process.env.PRIVATE_RPC_URL_ARC ?? 'https://rpc.testnet.arc.network'),
  })
  const publicClient = client as any

  const envFromBlock = readBlock(process.env.STREAM_FACTORY_FROM_BLOCK, DEFAULT_FROM_BLOCK)
  const fromBlock = readBlock(req.query.fromBlock, envFromBlock)

  try {
    const latestBlock = await publicClient.getBlockNumber() as bigint
    const logs = await getLogsChunked<StreamLog>(
      (start, end) => publicClient.getLogs({
        address: factory as Address,
        event: STREAM_FACTORY_ABI[0],
        fromBlock: start,
        toBlock: end,
        args: sender ? { sender: sender as Address } : undefined,
      }),
      fromBlock,
      latestBlock,
    )

    const filtered = logs
      .filter(log => log.args.vault)
      .filter(log => !recipient || log.args.recipient?.toLowerCase() === recipient.toLowerCase())
      .sort((a, b) => Number((b.blockNumber ?? 0n) - (a.blockNumber ?? 0n)))
      .slice(0, MAX_ROWS)

    const nowSec = BigInt(Math.floor(Date.now() / 1000))
    const streams = []
    for (const log of filtered) {
      const vault = log.args.vault as Address
      const info = await publicClient.readContract({
        address: vault,
        abi: STREAM_VAULT_ABI,
        functionName: 'streamInfo',
      }) as readonly [Address, Address, bigint, bigint, bigint, bigint, boolean, bigint, bigint]
      const [, infoRecipient, totalAmount, startTime, endTime, alreadyWithdrawn, cancelled, unlocked, claimable] = info
      const active = !cancelled && nowSec < endTime
      streams.push({
        vault,
        txHash: log.transactionHash,
        blockNumber: log.blockNumber?.toString() ?? null,
        sender: info[0],
        recipient: infoRecipient,
        totalAmount: totalAmount.toString(),
        startTime: startTime.toString(),
        endTime: endTime.toString(),
        alreadyWithdrawn: alreadyWithdrawn.toString(),
        unlocked: unlocked.toString(),
        claimable: claimable.toString(),
        cancelled,
        active,
      })
    }

    return res.json({ ok: true, streams })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not load stream history'
    return res.status(500).json({ ok: false, error: message.slice(0, 180) })
  }
}
