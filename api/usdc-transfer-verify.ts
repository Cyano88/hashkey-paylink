import { formatUnits, isAddress, pad, parseUnits, type Address } from 'viem'

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
  blockNumber?: `0x${string}`
  logs?: TxReceiptLog[]
}

type RpcBlock = { timestamp?: `0x${string}` }

type TransferLog = {
  transactionHash?: `0x${string}`
  blockNumber?: `0x${string}`
  logIndex?: `0x${string}`
  topics?: string[]
  data?: `0x${string}`
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
  if (!response.ok) throw new Error(`RPC HTTP ${response.status} for ${method}`)
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

async function getTransferLogs(input: {
  rpcUrl: string
  chain: EvmUsdcChain
  payer?: string
  recipient: string
  fromBlock: bigint
  toBlock: bigint
  chunkSize: bigint
}) {
  const logs: TransferLog[] = []
  const payerTopic = input.payer ? pad(input.payer as Address, { size: 32 }) : null
  const recipientTopic = pad(input.recipient as Address, { size: 32 })
  for (let from = input.fromBlock; from <= input.toBlock; from += input.chunkSize) {
    const end = from + input.chunkSize - 1n > input.toBlock ? input.toBlock : from + input.chunkSize - 1n
    logs.push(...await rpcCall<TransferLog[]>(input.rpcUrl, 'eth_getLogs', [{
      address: USDC_TOKENS[input.chain],
      fromBlock: `0x${from.toString(16)}`,
      toBlock: `0x${end.toString(16)}`,
      topics: [TRANSFER_TOPIC, payerTopic, recipientTopic],
    }]))
  }
  return logs
}

type BlockscoutTransfer = {
  block_number?: number
  log_index?: number
  timestamp?: string
  transaction_hash?: string
  from?: { hash?: string }
  to?: { hash?: string }
  token?: { address_hash?: string }
  total?: { value?: string }
}

async function findBaseBlockscoutUsdcTransfer(input: {
  payer: string
  recipient: string
  minAmount: string
  exactAmount?: boolean
  notBefore: string
  notAfter: string
}) {
  const earliest = Date.parse(input.notBefore)
  const deadline = Date.parse(input.notAfter)
  if (!Number.isFinite(earliest) || !Number.isFinite(deadline)) throw new Error('Invalid transfer recovery time.')
  const minUnits = usdcAmountUnits(input.minAmount)
  let url = `https://base.blockscout.com/api/v2/addresses/${input.recipient}/token-transfers?type=ERC-20`
  for (let page = 0; page < 10 && url; page += 1) {
    const response = await fetch(url, { headers: { accept: 'application/json' } })
    const raw = await response.text()
    if (!response.ok) throw new Error(`Base explorer HTTP ${response.status}.`)
    const data = JSON.parse(raw) as { items?: BlockscoutTransfer[]; next_page_params?: Record<string, string | number> | null }
    let reachedEarlierTransfers = false
    for (const item of data.items ?? []) {
      const timestamp = Date.parse(String(item.timestamp ?? ''))
      if (Number.isFinite(timestamp) && timestamp < earliest) reachedEarlierTransfers = true
      if (!Number.isFinite(timestamp) || timestamp < earliest || timestamp > deadline) continue
      if (String(item.from?.hash ?? '').toLowerCase() !== input.payer.toLowerCase()) continue
      if (String(item.to?.hash ?? '').toLowerCase() !== input.recipient.toLowerCase()) continue
      if (String(item.token?.address_hash ?? '').toLowerCase() !== USDC_TOKENS.base.toLowerCase()) continue
      const amountUnits = BigInt(String(item.total?.value ?? '0'))
      if (input.exactAmount ? amountUnits !== minUnits : amountUnits < minUnits) continue
      const txHash = String(item.transaction_hash ?? '')
      if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) continue
      const verified = await verifyEvmUsdcTransfer({
        chain: 'base', txHash, payer: input.payer, recipient: input.recipient,
        minAmount: input.minAmount, notBefore: input.notBefore, notAfter: input.notAfter,
      })
      return {
        txHash: txHash as `0x${string}`,
        amountUnits: amountUnits.toString(),
        amount: verified.amount,
        blockNumber: item.block_number == null ? null : String(item.block_number),
        logIndex: item.log_index ?? null,
        confirmedAt: verified.confirmedAt,
      }
    }
    const next = data.next_page_params
    if (reachedEarlierTransfers || !next) break
    const params = new URLSearchParams({ type: 'ERC-20' })
    for (const [key, value] of Object.entries(next)) params.set(key, String(value))
    url = `https://base.blockscout.com/api/v2/addresses/${input.recipient}/token-transfers?${params}`
  }
  return null
}
export async function findEvmUsdcTransfer(input: {
  chain: EvmUsdcChain
  payer?: string
  recipient: string
  minAmount: string
  exactAmount?: boolean
  notBefore?: string
  notAfter?: string
  lookbackBlocks?: bigint
  chunkSize?: bigint
}) {
  if (!isAddress(input.recipient)) throw new Error('Invalid USDC recipient.')
  if (input.payer && !isAddress(input.payer)) throw new Error('Invalid USDC payer.')
  if (input.chain === 'base' && input.payer && input.notBefore && input.notAfter) {
    return findBaseBlockscoutUsdcTransfer({
      payer: input.payer, recipient: input.recipient, minAmount: input.minAmount,
      exactAmount: input.exactAmount, notBefore: input.notBefore, notAfter: input.notAfter,
    })
  }
  const rpcUrl = rpcFor(input.chain)
  if (!rpcUrl) throw new Error(`PRIVATE_RPC_URL is not configured for ${input.chain}.`)

  const minUnits = usdcAmountUnits(input.minAmount)
  const earliest = input.notBefore ? Date.parse(input.notBefore) : Number.NEGATIVE_INFINITY
  const deadline = input.notAfter ? Date.parse(input.notAfter) : Number.POSITIVE_INFINITY
  if (!Number.isFinite(earliest) && input.notBefore) throw new Error('Invalid transfer start time.')
  if (!Number.isFinite(deadline) && input.notAfter) throw new Error('Invalid transfer end time.')
  const latestBlockHex = await rpcCall<`0x${string}`>(rpcUrl, 'eth_blockNumber', [])
  const latestBlock = BigInt(latestBlockHex)
  const lookback = input.lookbackBlocks ?? readPositiveBigInt(process.env.PAYCREST_RECONCILE_LOOKBACK_BLOCKS, 900n)
  const chunkSize = input.chunkSize ?? readPositiveBigInt(process.env.PAYCREST_RECONCILE_CHUNK_SIZE, 120n)
  const lookbackFrom = latestBlock > lookback ? latestBlock - lookback : 0n
  let fromBlock = lookbackFrom
  let toBlock = latestBlock
  if (Number.isFinite(earliest) || Number.isFinite(deadline)) {
    const latest = await rpcCall<RpcBlock>(rpcUrl, 'eth_getBlockByNumber', [latestBlockHex, false])
    if (!latest.timestamp) throw new Error('Latest block time was not available.')
    const latestMs = Number(BigInt(latest.timestamp) * 1_000n)
    const blockMs = input.chain === 'arbitrum' ? 250 : input.chain === 'arc' ? 1_000 : 2_000
    const paddingBlocks = BigInt(Math.ceil(10 * 60_000 / blockMs))
    if (Number.isFinite(earliest)) {
      const ageBlocks = BigInt(Math.ceil(Math.max(0, latestMs - earliest) / blockMs))
      const estimated = latestBlock > ageBlocks ? latestBlock - ageBlocks : 0n
      fromBlock = estimated > paddingBlocks ? estimated - paddingBlocks : 0n
      if (fromBlock < lookbackFrom) fromBlock = lookbackFrom
    }
    if (Number.isFinite(deadline)) {
      const ageBlocks = BigInt(Math.floor(Math.max(0, latestMs - deadline) / blockMs))
      const estimated = latestBlock > ageBlocks ? latestBlock - ageBlocks : 0n
      toBlock = estimated + paddingBlocks < latestBlock ? estimated + paddingBlocks : latestBlock
    }
  }
  const logs = await getTransferLogs({
    rpcUrl,
    chain: input.chain,
    payer: input.payer,
    recipient: input.recipient,
    fromBlock,
    toBlock,
    chunkSize,
  })
  const candidates = logs.filter(log => {
    const value = log.data ? BigInt(log.data) : 0n
    return !!log.transactionHash && (input.exactAmount ? value === minUnits : value >= minUnits)
  })
  let match: TransferLog | undefined
  let confirmedAt: string | undefined
  if (input.notBefore || input.notAfter) {
    for (const candidate of candidates) {
      if (!candidate.blockNumber) continue
      const block = await rpcCall<RpcBlock>(rpcUrl, 'eth_getBlockByNumber', [candidate.blockNumber, false])
      if (!block.timestamp) continue
      const timestamp = Number(BigInt(block.timestamp) * 1_000n)
      if (!Number.isSafeInteger(timestamp) || timestamp < earliest || timestamp > deadline) continue
      match = candidate
      confirmedAt = new Date(timestamp).toISOString()
      break
    }
  } else {
    match = [...candidates].reverse()[0]
  }
  if (!match?.transactionHash) return null
  const amountUnits = match.data ? BigInt(match.data) : 0n
  return {
    txHash: match.transactionHash,
    amountUnits: amountUnits.toString(),
    amount: formatUnits(amountUnits, 6),
    blockNumber: match.blockNumber ? BigInt(match.blockNumber).toString() : null,
    logIndex: match.logIndex ? Number(BigInt(match.logIndex)) : null,
    confirmedAt,
  }
}

export async function verifyEvmUsdcTransfer(input: {
  chain: EvmUsdcChain
  txHash: string
  payer?: string
  recipient: string
  minAmount: string
  notBefore?: string
  notAfter?: string
}) {
  if (!/^0x[a-fA-F0-9]{64}$/.test(input.txHash)) throw new Error('Invalid transaction hash.')
  if (!isAddress(input.recipient)) throw new Error('Invalid USDC recipient.')
  if (input.payer && !isAddress(input.payer)) throw new Error('Invalid USDC payer.')
  const rpcUrl = rpcFor(input.chain)
  if (!rpcUrl) throw new Error(`PRIVATE_RPC_URL is not configured for ${input.chain}.`)

  const receipt = await rpcCall<TxReceipt | null>(rpcUrl, 'eth_getTransactionReceipt', [input.txHash])
  if (!receipt) throw new Error('Transaction receipt was not found yet.')
  if (receipt.status !== '0x1') throw new Error('Transaction did not succeed.')

  let confirmedAt: string | undefined
  if (input.notBefore || input.notAfter) {
    const earliest = input.notBefore ? Date.parse(input.notBefore) : Number.NEGATIVE_INFINITY
    const deadline = input.notAfter ? Date.parse(input.notAfter) : Number.POSITIVE_INFINITY
    if (!Number.isFinite(earliest) && input.notBefore) throw new Error('Invalid checkout creation time.')
    if (!Number.isFinite(deadline) && input.notAfter) throw new Error('Invalid checkout expiry.')
    if (!receipt.blockNumber) throw new Error('Transaction confirmation block was not available.')
    const block = await rpcCall<RpcBlock>(rpcUrl, 'eth_getBlockByNumber', [receipt.blockNumber, false])
    if (!block.timestamp) throw new Error('Transaction confirmation time was not available.')
    const confirmedAtMs = Number(BigInt(block.timestamp) * 1_000n)
    if (!Number.isSafeInteger(confirmedAtMs)) throw new Error('Transaction confirmation time was invalid.')
    if (confirmedAtMs < earliest) throw new Error('Transaction confirmed before the checkout was created.')
    if (confirmedAtMs > deadline) throw new Error('Transaction confirmed after the checkout expired.')
    confirmedAt = new Date(confirmedAtMs).toISOString()
  }

  const token = USDC_TOKENS[input.chain].toLowerCase()
  const recipientTopic = pad(input.recipient as Address, { size: 32 }).toLowerCase()
  const payerTopic = input.payer ? pad(input.payer as Address, { size: 32 }).toLowerCase() : ''
  const minUnits = usdcAmountUnits(input.minAmount)
  let matchedUnits = 0n

  for (const log of receipt.logs ?? []) {
    const topics = (log.topics ?? []).map(topic => topic.toLowerCase())
    if (String(log.address ?? '').toLowerCase() !== token) continue
    if (topics[0] !== TRANSFER_TOPIC) continue
    if (payerTopic && topics[1] !== payerTopic) continue
    if (topics[2] !== recipientTopic) continue
    const value = log.data ? BigInt(log.data) : 0n
    if (value > matchedUnits) matchedUnits = value
    if (value >= minUnits) {
      return {
        ok: true,
        amountUnits: value.toString(),
        amount: formatUnits(value, 6),
        confirmedAt,
      }
    }
  }

  throw new Error(`No matching USDC transfer to recipient for at least ${input.minAmount} USDC.`)
}
