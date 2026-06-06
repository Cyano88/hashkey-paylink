import type { Request, Response } from 'express'
import { createPublicClient, defineChain, http, isAddress, parseAbi, type Address } from 'viem'
import { base, arbitrum } from 'viem/chains'

const ERC20_TRANSFER_ABI = parseAbi([
  'event Transfer(address indexed from, address indexed to, uint256 value)',
])

const arcChain = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { decimals: 18, name: 'USD Coin', symbol: 'USDC' },
  rpcUrls: { default: { http: ['http://render-rpc-env-required.invalid'] } },
})

const TOKENS = {
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  arc: '0x3600000000000000000000000000000000000000',
  arbitrum: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
} as const

const DEFAULT_LOOKBACK_BLOCKS = 30_000n
const DEFAULT_CHUNK_SIZE = 2_000n

type ChainKey = keyof typeof TOKENS

type TransferLog = {
  transactionHash: `0x${string}` | null
  blockNumber: bigint | null
  logIndex: number
  args: {
    from?: Address
    to?: Address
    value?: bigint
  }
}

function readChain(value: unknown): ChainKey {
  return value === 'arc' || value === 'arbitrum' ? value : 'base'
}

function readPositiveBigInt(value: unknown, fallback: bigint) {
  try {
    const raw = typeof value === 'string' ? value.trim() : ''
    if (!raw) return fallback
    const parsed = BigInt(raw)
    return parsed > 0n ? parsed : fallback
  } catch {
    return fallback
  }
}

function rpcFor(chain: ChainKey) {
  if (chain === 'arc') return process.env.PRIVATE_RPC_URL_ARC
  if (chain === 'arbitrum') return process.env.PRIVATE_RPC_URL_ARB
  return process.env.PRIVATE_RPC_URL
}

function viemChainFor(chain: ChainKey) {
  if (chain === 'arc') return arcChain
  if (chain === 'arbitrum') return arbitrum
  return base
}

async function getLogsChunked(
  publicClient: any,
  tokenAddress: Address,
  recipient: Address,
  fromBlock: bigint,
  toBlock: bigint,
) {
  const logs: TransferLog[] = []
  const chunkSize = readPositiveBigInt(process.env.PAYMENT_TX_LOOKUP_CHUNK_SIZE, DEFAULT_CHUNK_SIZE)
  for (let from = fromBlock; from <= toBlock; from += chunkSize) {
    const end = from + chunkSize - 1n > toBlock ? toBlock : from + chunkSize - 1n
    logs.push(...await publicClient.getLogs({
      address: tokenAddress,
      event: ERC20_TRANSFER_ABI[0],
      args: { to: recipient },
      fromBlock: from,
      toBlock: end,
    }))
  }
  return logs
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  const body = (req.body ?? {}) as Record<string, unknown>
  const chain = readChain(body.chain)
  const recipient = typeof body.recipient === 'string' ? body.recipient.trim() : ''
  const amountUnits = readPositiveBigInt(body.amountUnits, 0n)
  const minUnits = amountUnits > 0n ? amountUnits * 98n / 100n : 1n

  if (!isAddress(recipient)) {
    return res.status(400).json({ ok: false, error: 'Invalid recipient address' })
  }
  if (amountUnits <= 0n) {
    return res.status(400).json({ ok: false, error: 'amountUnits is required' })
  }

  const rpcUrl = rpcFor(chain)
  if (!rpcUrl) {
    return res.status(500).json({ ok: false, error: `PRIVATE_RPC_URL is not configured for ${chain}` })
  }

  const publicClient = createPublicClient({
    chain: viemChainFor(chain),
    transport: http(rpcUrl),
  }) as any

  try {
    const latestBlock = await publicClient.getBlockNumber() as bigint
    const lookback = readPositiveBigInt(process.env.PAYMENT_TX_LOOKUP_BLOCKS, DEFAULT_LOOKBACK_BLOCKS)
    const fromBlock = latestBlock > lookback ? latestBlock - lookback : 0n
    const logs = await getLogsChunked(
      publicClient,
      TOKENS[chain] as Address,
      recipient as Address,
      fromBlock,
      latestBlock,
    )
    const match = [...logs].reverse().find(log => {
      const value = log.args.value ?? 0n
      return !!log.transactionHash && value >= minUnits
    })

    if (!match?.transactionHash) {
      return res.json({ ok: true, found: false, latestBlock: latestBlock.toString() })
    }

    return res.json({
      ok: true,
      found: true,
      txHash: match.transactionHash,
      amountUnits: ((match.args.value ?? 0n) as bigint).toString(),
      blockNumber: match.blockNumber?.toString() ?? null,
      logIndex: match.logIndex,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Payment transaction lookup failed'
    return res.status(502).json({ ok: false, error: message.slice(0, 180) })
  }
}
