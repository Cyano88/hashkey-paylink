/**
 * GET /api/dashboard-payments?evm=0x...&fromBlock=...
 *
 * Server-side payment history reader for the recipient dashboard.
 * Keeps heavy eth_getLogs calls off the browser and uses backend RPC config.
 */

import type { Request, Response } from 'express'
import { createPublicClient, http, isAddress, parseAbi, type Address } from 'viem'
import { base } from 'viem/chains'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const
const ROUTER_FACTORY = '0x70Dd5226eB973268263A9AcD8BC48b4E59E7beCA' as const
const DEFAULT_FROM_BLOCK = 45_786_000n
const DEFAULT_LOG_CHUNK_SIZE = 2_000n

const FACTORY_ABI = parseAbi([
  'function getRouterAddress(address recipient) view returns (address)',
])

const PAYMENT_ROUTED_ABI = parseAbi([
  'event PaymentRouted(address indexed token, address indexed sender, uint256 recipientAmount, uint256 treasuryAmount)',
])

const PAYMENT_RELAYED_ABI = parseAbi([
  'event PaymentRelayed(bytes32 indexed linkId, address indexed recipient, uint256 payout, uint256 platformFee, uint256 gasReimb)',
])

interface PaymentRow {
  id: string
  txHash: `0x${string}`
  blockNumber: string
  timestamp: number | null
  sender: `0x${string}`
  recipientAmount: string
  treasuryAmount: string
  gasCostWei: string
  gasReimbUsdc: string
  status: 'settled' | 'incoming'
  flow: 'v1' | 'v2'
}

interface DashboardLog {
  transactionHash: `0x${string}` | null
  blockNumber: bigint | null
  logIndex: number
  args: Record<string, unknown>
}

function readBlock(value: unknown, fallback: bigint) {
  try {
    const clean = typeof value === 'string' ? value.trim() : ''
    if (!clean) return fallback
    const parsed = BigInt(clean)
    return parsed > fallback ? parsed : fallback
  } catch {
    return fallback
  }
}

function readPositiveBlock(value: unknown, fallback: bigint) {
  const parsed = readBlock(value, fallback)
  return parsed > 0n ? parsed : fallback
}

async function getLogsChunked<TLog>(
  getLogs: (fromBlock: bigint, toBlock: bigint) => Promise<TLog[]>,
  fromBlock: bigint,
  toBlock: bigint,
) {
  if (fromBlock > toBlock) return []
  const logs: TLog[] = []
  const chunkSize = readPositiveBlock(process.env.DASHBOARD_LOG_CHUNK_SIZE, DEFAULT_LOG_CHUNK_SIZE)
  for (let from = fromBlock; from <= toBlock; from += chunkSize) {
    const end = from + chunkSize - 1n > toBlock ? toBlock : from + chunkSize - 1n
    try {
      logs.push(...await getLogs(from, end))
    } catch (err) {
      // Some hosted RPCs still reject dense ranges. Split once more before
      // surfacing an error to the dashboard.
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
  const evm = typeof req.query.evm === 'string' ? req.query.evm.trim() : ''
  if (!isAddress(evm)) {
    return res.status(400).json({ ok: false, error: 'Invalid EVM recipient address' })
  }

  const rpcUrl = process.env.PRIVATE_RPC_URL
  if (!rpcUrl) {
    return res.status(500).json({ ok: false, error: 'PRIVATE_RPC_URL is not configured' })
  }

  const client = createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  })
  const publicClient = client as any

  const envFromBlock = readBlock(process.env.FACTORY_FROM_BLOCK, DEFAULT_FROM_BLOCK)
  const fromBlock = readBlock(req.query.fromBlock, envFromBlock)
  const factoryV2 = process.env.PAYLINK_FACTORY_V2
  const rows: PaymentRow[] = []

  try {
    const [routerAddr, latestBlock] = await Promise.all([
      publicClient.readContract({
        address: ROUTER_FACTORY,
        abi: FACTORY_ABI,
        functionName: 'getRouterAddress',
        args: [evm as Address],
      }) as Promise<Address>,
      publicClient.getBlockNumber() as Promise<bigint>,
    ])

    const v1Logs = await getLogsChunked<DashboardLog>(
      (start, end) => publicClient.getLogs({
        address: routerAddr,
        event: PAYMENT_ROUTED_ABI[0],
        fromBlock: start,
        toBlock: end,
      }),
      fromBlock,
      latestBlock,
    )

    const v2Logs = factoryV2 && isAddress(factoryV2)
      ? await getLogsChunked<DashboardLog>(
          (start, end) => publicClient.getLogs({
            address: factoryV2 as Address,
            event: PAYMENT_RELAYED_ABI[0],
            fromBlock: start,
            toBlock: end,
            args: { recipient: evm as Address },
          }),
          fromBlock,
          latestBlock,
        )
      : []

    for (const log of v1Logs) {
      if (!log.transactionHash || log.blockNumber == null) continue
      const [receipt, block] = await Promise.all([
        publicClient.getTransactionReceipt({ hash: log.transactionHash }),
        publicClient.getBlock({ blockNumber: log.blockNumber }),
      ])
      rows.push({
        id: `${log.transactionHash}-${log.logIndex}`,
        txHash: log.transactionHash,
        blockNumber: log.blockNumber.toString(),
        timestamp: block.timestamp ? Number(block.timestamp) * 1_000 : null,
        sender: (log.args.sender as `0x${string}` | undefined) ?? ZERO_ADDRESS,
        recipientAmount: ((log.args.recipientAmount as bigint | undefined) ?? 0n).toString(),
        treasuryAmount: ((log.args.treasuryAmount as bigint | undefined) ?? 0n).toString(),
        gasCostWei: (receipt.gasUsed * receipt.effectiveGasPrice).toString(),
        gasReimbUsdc: '0',
        status: 'settled',
        flow: 'v1',
      })
    }

    for (const log of v2Logs) {
      if (!log.transactionHash || log.blockNumber == null) continue
      const block = await publicClient.getBlock({ blockNumber: log.blockNumber })
      rows.push({
        id: `v2-${log.transactionHash}-${log.logIndex}`,
        txHash: log.transactionHash,
        blockNumber: log.blockNumber.toString(),
        timestamp: block.timestamp ? Number(block.timestamp) * 1_000 : null,
        sender: ZERO_ADDRESS,
        recipientAmount: ((log.args.payout as bigint | undefined) ?? 0n).toString(),
        treasuryAmount: ((log.args.platformFee as bigint | undefined) ?? 0n).toString(),
        gasCostWei: '0',
        gasReimbUsdc: ((log.args.gasReimb as bigint | undefined) ?? 0n).toString(),
        status: 'settled',
        flow: 'v2',
      })
    }

    rows.sort((a, b) => Number(BigInt(b.blockNumber) - BigInt(a.blockNumber)))
    return res.json({
      ok: true,
      routerAddr,
      latestBlock: latestBlock.toString(),
      rows,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load dashboard payments'
    return res.status(500).json({ ok: false, error: message.slice(0, 180) })
  }
}
