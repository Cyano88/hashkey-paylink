import { formatUnits, isAddress, pad, parseUnits, type Address } from 'viem'

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const ARC_USDC_EMITTER = '0xfffffffffffffffffffffffffffffffffffffffe'
const usdcEventAddress = (chain: EvmUsdcChain) => chain === 'arc' ? ARC_USDC_EMITTER : USDC_TOKENS[chain]
const usdcEventUnits = (chain: EvmUsdcChain, data?: string) => BigInt(data || '0x0') / (chain === 'arc' ? 1_000_000_000_000n : 1n)
const BASE_PUBLIC_RPC = 'https://mainnet.base.org'

const USDC_TOKENS = {
  ethereum: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  polygon: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
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
  blockHash?: string
  status?: `0x${string}`
  blockNumber?: `0x${string}`
  logs?: TxReceiptLog[]
}

type RpcBlock = { hash?: string; timestamp?: `0x${string}`; number?: `0x${string}` }

type TransferLog = {
  transactionHash?: `0x${string}`
  blockNumber?: `0x${string}`
  logIndex?: `0x${string}`
  topics?: string[]
  data?: `0x${string}`
}

function rpcFor(chain: EvmUsdcChain) {
  if (chain === 'ethereum') return process.env.PRIVATE_RPC_URL_ETHEREUM || 'https://ethereum-rpc.publicnode.com'
  if (chain === 'polygon') return process.env.PRIVATE_RPC_URL_POLYGON || 'https://polygon-bor-rpc.publicnode.com'
  if (chain === 'arc') return process.env.PRIVATE_RPC_URL_ARC_MAINNET || 'https://rpc.mainnet.arc.io'
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
  if (value === 'ethereum' || value === 'polygon' || value === 'base' || value === 'arc' || value === 'arbitrum') return value
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
      address: usdcEventAddress(input.chain),
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
  const baseParams = { type: 'ERC-20', filter: 'to', token: USDC_TOKENS.base }
  let url = `https://base.blockscout.com/api/v2/addresses/${input.recipient}/token-transfers?${new URLSearchParams(baseParams)}`
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
    const params = new URLSearchParams(baseParams)
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
    try {
      const explorerMatch = await findBaseBlockscoutUsdcTransfer({
        payer: input.payer, recipient: input.recipient, minAmount: input.minAmount,
        exactAmount: input.exactAmount, notBefore: input.notBefore, notAfter: input.notAfter,
      })
      if (explorerMatch) return explorerMatch
    } catch (error) {
      console.warn('[usdc-transfer-verify] Base explorer unavailable; using configured RPC:', error instanceof Error ? error.message : String(error))
    }
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
  let discoveryRpcUrl = rpcUrl
  let logs: TransferLog[]
  try {
    logs = await getTransferLogs({ rpcUrl: discoveryRpcUrl, chain: input.chain, payer: input.payer, recipient: input.recipient, fromBlock, toBlock, chunkSize })
  } catch (error) {
    if (input.chain !== 'base' || discoveryRpcUrl === BASE_PUBLIC_RPC || !/eth_getLogs/i.test(error instanceof Error ? error.message : String(error))) throw error
    discoveryRpcUrl = BASE_PUBLIC_RPC
    logs = await getTransferLogs({ rpcUrl: discoveryRpcUrl, chain: input.chain, payer: input.payer, recipient: input.recipient, fromBlock, toBlock, chunkSize })
  }
  const candidates = logs.filter(log => {
    const value = usdcEventUnits(input.chain, log.data)
    return !!log.transactionHash && (input.exactAmount ? value === minUnits : value >= minUnits)
  })
  let match: TransferLog | undefined
  let confirmedAt: string | undefined
  if (input.notBefore || input.notAfter) {
    for (const candidate of candidates) {
      if (!candidate.blockNumber) continue
      const block = await rpcCall<RpcBlock>(discoveryRpcUrl, 'eth_getBlockByNumber', [candidate.blockNumber, false])
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
  // Discovery is only a hint: verify the receipt on the configured chain before accepting it.
  const verified = await verifyEvmUsdcTransfer({ ...input, txHash: match.transactionHash })
  if (input.exactAmount && BigInt(verified.amountUnits) !== minUnits) return null
  return {
    txHash: match.transactionHash,
    amountUnits: verified.amountUnits,
    amount: verified.amount,
    blockNumber: match.blockNumber ? BigInt(match.blockNumber).toString() : null,
    logIndex: match.logIndex ? Number(BigInt(match.logIndex)) : null,
    confirmedAt: verified.confirmedAt ?? confirmedAt,
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
  confirmation?: 'finalized' | 'base-included'
}) {
  if (!/^0x[a-fA-F0-9]{64}$/.test(input.txHash)) throw new Error('Invalid transaction hash.')
  if (!isAddress(input.recipient)) throw new Error('Invalid USDC recipient.')
  if (input.payer && !isAddress(input.payer)) throw new Error('Invalid USDC payer.')
  if (input.confirmation === 'base-included' && input.chain !== 'base') throw new Error('Base inclusion confirmation is only supported for Base.')
  const rpcUrl = rpcFor(input.chain)
  if (!rpcUrl) throw new Error(`PRIVATE_RPC_URL is not configured for ${input.chain}.`)

  const expectedChainId = { base: 8453n, arbitrum: 42161n, arc: 5042n, ethereum: 1n, polygon: 137n }[input.chain]
  const actualChainId = await rpcCall<string>(rpcUrl, 'eth_chainId', [])
  if (!/^0x[0-9a-f]+$/i.test(actualChainId) || BigInt(actualChainId) !== expectedChainId) {
    throw new Error('Payment RPC chain does not match the requested mainnet.')
  }
  const receipt = await rpcCall<TxReceipt | null>(rpcUrl, 'eth_getTransactionReceipt', [input.txHash])
  if (!receipt) throw new Error('Transaction receipt was not found yet.')
  if (receipt.status !== '0x1') throw new Error('Transaction did not succeed.')
  if (!receipt.blockNumber || !/^0x[0-9a-f]+$/i.test(receipt.blockNumber)) throw new Error('Transaction confirmation block was not available.')
  let inclusionBlock: RpcBlock | undefined
  if (input.confirmation === 'base-included') {
    // Pocket bills deliberately accept two sealed L2 blocks, not L1 finality.
    // A submitted hash or Flashblock preconfirmation is insufficient evidence.
    const [head, block] = await Promise.all([
      rpcCall<RpcBlock>(rpcUrl, 'eth_getBlockByNumber', ['latest', false]),
      rpcCall<RpcBlock>(rpcUrl, 'eth_getBlockByNumber', [receipt.blockNumber, false]),
    ])
    if (!head.number || !/^0x[0-9a-f]+$/i.test(head.number) || BigInt(head.number) < BigInt(receipt.blockNumber) + 1n) {
      throw new Error('Transaction confirmation block needs another Base block.')
    }
    if (!receipt.blockHash || !/^0x[0-9a-f]{64}$/i.test(receipt.blockHash)
      || !block.hash || block.hash.toLowerCase() !== receipt.blockHash.toLowerCase()
      || !block.number || !/^0x[0-9a-f]+$/i.test(block.number) || BigInt(block.number) !== BigInt(receipt.blockNumber)) {
      throw new Error('Transaction confirmation block is not canonical yet.')
    }
    inclusionBlock = block
  } else {
    // All other callers retain the existing finalized payment-proof policy.
    const finalized = await rpcCall<RpcBlock>(rpcUrl, 'eth_getBlockByNumber', ['finalized', false])
    if (!finalized.number || !/^0x[0-9a-f]+$/i.test(finalized.number) || BigInt(receipt.blockNumber) > BigInt(finalized.number)) {
      throw new Error('Transaction is not finalized yet.')
    }
  }

  let confirmedAt: string | undefined
  if (input.notBefore || input.notAfter) {
    const earliest = input.notBefore ? Date.parse(input.notBefore) : Number.NEGATIVE_INFINITY
    const deadline = input.notAfter ? Date.parse(input.notAfter) : Number.POSITIVE_INFINITY
    if (!Number.isFinite(earliest) && input.notBefore) throw new Error('Invalid checkout creation time.')
    if (!Number.isFinite(deadline) && input.notAfter) throw new Error('Invalid checkout expiry.')
    if (!receipt.blockNumber) throw new Error('Transaction confirmation block was not available.')
    const block = inclusionBlock ?? await rpcCall<RpcBlock>(rpcUrl, 'eth_getBlockByNumber', [receipt.blockNumber, false])
    if (!block.timestamp) throw new Error('Transaction confirmation time was not available.')
    const confirmedAtMs = Number(BigInt(block.timestamp) * 1_000n)
    if (!Number.isSafeInteger(confirmedAtMs)) throw new Error('Transaction confirmation time was invalid.')
    if (confirmedAtMs < earliest) throw new Error('Transaction confirmed before the checkout was created.')
    if (confirmedAtMs > deadline) throw new Error('Transaction confirmed after the checkout expired.')
    confirmedAt = new Date(confirmedAtMs).toISOString()
  }

  const token = usdcEventAddress(input.chain).toLowerCase()
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
    const value = usdcEventUnits(input.chain, log.data)
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
