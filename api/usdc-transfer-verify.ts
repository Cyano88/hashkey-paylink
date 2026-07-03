import { isAddress, pad, parseUnits, type Address } from 'viem'

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

const USDC_TOKENS = {
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  arc: '0x3600000000000000000000000000000000000000',
  arbitrum: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
} as const

export type EvmUsdcChain = keyof typeof USDC_TOKENS

type TxReceiptLog = {
  address?: string
  topics?: string[]
  data?: `0x${string}`
}

type TxReceipt = {
  status?: `0x${string}`
  logs?: TxReceiptLog[]
}

function rpcFor(chain: EvmUsdcChain) {
  if (chain === 'arc') return process.env.PRIVATE_RPC_URL_ARC
  if (chain === 'arbitrum') return process.env.PRIVATE_RPC_URL_ARB
  return process.env.PRIVATE_RPC_URL
}

async function rpcCall<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const raw = await response.text()
  if (!response.ok) throw new Error(`RPC HTTP ${response.status}`)
  const data = JSON.parse(raw) as { result?: T; error?: { code?: number; message?: string } }
  if (data.error) throw new Error(`RPC ${data.error.code ?? 'error'}: ${data.error.message ?? method}`)
  if (data.result == null) throw new Error(`RPC returned no result for ${method}`)
  return data.result
}

export function normalizeEvmUsdcChain(value: unknown): EvmUsdcChain | null {
  if (value === 'base' || value === 'arc' || value === 'arbitrum') return value
  return null
}

export function usdcAmountUnits(amount: string) {
  const normalized = String(amount ?? '').replace(/,/g, '').trim()
  if (!/^\d+(?:\.\d{1,6})?$/.test(normalized)) throw new Error('Invalid USDC amount.')
  const units = parseUnits(normalized, 6)
  if (units <= 0n) throw new Error('Invalid USDC amount.')
  return units
}

export async function verifyEvmUsdcTransfer(input: {
  chain: EvmUsdcChain
  txHash: string
  recipient: string
  minAmount: string
}) {
  if (!/^0x[a-fA-F0-9]{64}$/.test(input.txHash)) throw new Error('Invalid transaction hash.')
  if (!isAddress(input.recipient)) throw new Error('Invalid USDC recipient.')
  const rpcUrl = rpcFor(input.chain)
  if (!rpcUrl) throw new Error(`PRIVATE_RPC_URL is not configured for ${input.chain}.`)

  const receipt = await rpcCall<TxReceipt | null>(rpcUrl, 'eth_getTransactionReceipt', [input.txHash])
  if (!receipt) throw new Error('Transaction receipt was not found yet.')
  if (receipt.status && receipt.status !== '0x1') throw new Error('Transaction did not succeed.')

  const token = USDC_TOKENS[input.chain].toLowerCase()
  const recipientTopic = pad(input.recipient as Address, { size: 32 }).toLowerCase()
  const minUnits = usdcAmountUnits(input.minAmount)
  let matchedUnits = 0n

  for (const log of receipt.logs ?? []) {
    const topics = (log.topics ?? []).map(topic => topic.toLowerCase())
    if (String(log.address ?? '').toLowerCase() !== token) continue
    if (topics[0] !== TRANSFER_TOPIC) continue
    if (topics[2] !== recipientTopic) continue
    const value = log.data ? BigInt(log.data) : 0n
    if (value > matchedUnits) matchedUnits = value
    if (value >= minUnits) {
      return {
        ok: true,
        amountUnits: value.toString(),
        amount: (Number(value) / 1_000_000).toFixed(6).replace(/\.?0+$/, ''),
      }
    }
  }

  throw new Error(`No matching USDC transfer to recipient for at least ${input.minAmount} USDC.`)
}
