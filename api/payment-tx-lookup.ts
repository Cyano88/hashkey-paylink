import type { Request, Response } from 'express'
import { isAddress, pad, type Address } from 'viem'

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

const TOKENS = {
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  arc: '0x3600000000000000000000000000000000000000',
  arbitrum: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
} as const

const DEFAULT_LOOKBACK_BLOCKS = 600n
const RECOVERY_LOOKBACK_BLOCKS = 10_000n
const DEFAULT_CHUNK_SIZE = 300n

type ChainKey = keyof typeof TOKENS

type TransferLog = {
  transactionHash?: `0x${string}`
  blockNumber?: `0x${string}`
  logIndex?: `0x${string}`
  data?: `0x${string}`
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

async function rpcCall<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params,
    }),
  })
  const rawText = await response.text()
  if (!response.ok) {
    const safeText = rawText
      .replace(/https?:\/\/[^\s"',)]+/gi, '[rpc-url]')
      .replace(/\/v2\/[A-Za-z0-9_-]+/g, '/v2/[redacted]')
      .slice(0, 240)
    throw new Error(`RPC HTTP ${response.status}: ${safeText || response.statusText}`)
  }
  const data = JSON.parse(rawText) as { result?: T; error?: { code?: number; message?: string } }
  if (data.error) {
    throw new Error(`RPC ${data.error.code ?? 'error'}: ${data.error.message ?? method}`)
  }
  if (data.result == null) {
    throw new Error(`RPC returned no result for ${method}`)
  }
  return data.result
}

async function getLogsChunked(
  rpcUrl: string,
  tokenAddress: string,
  recipient: string,
  fromBlock: bigint,
  toBlock: bigint,
) {
  const logs: TransferLog[] = []
  const chunkSize = readPositiveBigInt(process.env.PAYMENT_TX_LOOKUP_CHUNK_SIZE, DEFAULT_CHUNK_SIZE)
  const recipientTopic = pad(recipient as Address, { size: 32 })
  for (let from = fromBlock; from <= toBlock; from += chunkSize) {
    const end = from + chunkSize - 1n > toBlock ? toBlock : from + chunkSize - 1n
    logs.push(...await rpcCall<TransferLog[]>(rpcUrl, 'eth_getLogs', [{
      address: tokenAddress,
      fromBlock: `0x${from.toString(16)}`,
      toBlock: `0x${end.toString(16)}`,
      topics: [TRANSFER_TOPIC, null, recipientTopic],
    }]))
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
  const strict = body.strict === true
  const minUnits = amountUnits > 0n ? (strict ? amountUnits : amountUnits * 98n / 100n) : 1n
  const recovery = body.recovery === true || body.deep === true

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

  try {
    const latestBlockHex = await rpcCall<`0x${string}`>(rpcUrl, 'eth_blockNumber', [])
    const latestBlock = BigInt(latestBlockHex)
    const envDefault = recovery
      ? process.env.PAYMENT_TX_LOOKUP_RECOVERY_BLOCKS
      : process.env.PAYMENT_TX_LOOKUP_BLOCKS
    const lookback = readPositiveBigInt(envDefault, recovery ? RECOVERY_LOOKBACK_BLOCKS : DEFAULT_LOOKBACK_BLOCKS)
    const fromBlock = latestBlock > lookback ? latestBlock - lookback : 0n
    const logs = await getLogsChunked(
      rpcUrl,
      TOKENS[chain],
      recipient,
      fromBlock,
      latestBlock,
    )
    const match = [...logs].reverse().find(log => {
      const value = log.data ? BigInt(log.data) : 0n
      return !!log.transactionHash && value >= minUnits
    })

    if (!match?.transactionHash) {
      return res.json({ ok: true, found: false, latestBlock: latestBlock.toString() })
    }

    return res.json({
      ok: true,
      found: true,
      txHash: match.transactionHash,
      amountUnits: (match.data ? BigInt(match.data) : 0n).toString(),
      blockNumber: match.blockNumber ? BigInt(match.blockNumber).toString() : null,
      logIndex: match.logIndex ? Number(BigInt(match.logIndex)) : null,
    })
  } catch (err) {
    console.error('[payment-tx-lookup] failed:', err instanceof Error ? err.message : err)
    return res.status(502).json({ ok: false, error: 'Payment transaction lookup failed' })
  }
}
