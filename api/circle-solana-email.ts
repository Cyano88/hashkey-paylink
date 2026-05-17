import type { Request, Response } from 'express'
import crypto from 'crypto'
import { PublicKey } from '@solana/web3.js'
import { encodeFunctionData, isAddress, parseAbi } from 'viem'

const CIRCLE_BASE_URL = (process.env.CIRCLE_BASE_URL ?? 'https://api.circle.com').replace(/\/+$/, '')
const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY
const CIRCLE_TEST_API_KEY = process.env.CIRCLE_TEST_API_KEY ?? process.env.CIRCLE_API_KEY_TEST
const SOLANA_BLOCKCHAIN = process.env.CIRCLE_SOLANA_BLOCKCHAIN ?? 'SOL'
const EVM_TREASURY = '0xcE5dF9e1115F81a2Fc2F65941B20B820d508e753'
const PLATFORM_FEE_BPS = 20n
const BPS_DENOMINATOR = 10_000n

const EVM_CHAINS = {
  base: {
    blockchain: 'BASE',
    tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    gasRecoveryEnv: 'BASE_GAS_RECOVERY_USDC',
    defaultGasRecoveryUnits: 10_000n,
  },
  arbitrum: {
    blockchain: 'ARB',
    tokenAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    gasRecoveryEnv: 'ARBITRUM_GAS_RECOVERY_USDC',
    defaultGasRecoveryUnits: 30_000n,
  },
  arc: {
    blockchain: 'ARC-TESTNET',
    tokenAddress: '0x3600000000000000000000000000000000000000',
    gasRecoveryEnv: 'ARC_GAS_RECOVERY_USDC',
    defaultGasRecoveryUnits: 0n,
  },
} as const

const ERC20_TRANSFER_ABI = parseAbi(['function transfer(address to, uint256 amount) returns (bool)'])
const SMART_WALLET_BATCH_ABI = parseAbi(['function executeBatch((address target,uint256 value,bytes data)[] calls)'])
const STREAM_FACTORY_ABI = parseAbi([
  'function createStream(address recipient,uint256 totalAmount,uint64 startTime,uint64 endTime,bytes32 salt) returns (address vault)',
])

type CircleResponse<T = unknown> = {
  data?: T
  code?: number
  message?: string
  error?: string
}

function isTestnetBlockchain(blockchain: string | undefined) {
  return !!blockchain && blockchain.toUpperCase().includes('TESTNET')
}

function circleApiKey(input?: { chain?: string; blockchain?: string }) {
  const chain = input?.chain?.toLowerCase()
  const needsTestKey = chain === 'arc' || isTestnetBlockchain(input?.blockchain)
  if (needsTestKey) {
    if (CIRCLE_TEST_API_KEY) return CIRCLE_TEST_API_KEY
    if (CIRCLE_API_KEY?.startsWith('TEST_API')) return CIRCLE_API_KEY
    throw new Error('CIRCLE_TEST_API_KEY not configured for Arc testnet')
  }
  if (CIRCLE_API_KEY) return CIRCLE_API_KEY
  if (CIRCLE_TEST_API_KEY) return CIRCLE_TEST_API_KEY
  throw new Error('CIRCLE_API_KEY not configured')
}

function circleHeaders(userToken?: string, apiKey = circleApiKey()) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    'X-Request-Id': crypto.randomUUID(),
    ...(userToken ? { 'X-User-Token': userToken } : {}),
  }
}

type CircleInit = {
  method?: string
  body?: string
  userToken?: string
  apiKey?: string
  headers?: Record<string, string>
}

async function circleJson<T extends Record<string, unknown> = Record<string, unknown>>(path: string, init: CircleInit = {}) {
  const { apiKey, ...requestInit } = init
  const res = await fetch(`${CIRCLE_BASE_URL}${path}`, {
    ...requestInit,
    headers: {
      ...circleHeaders(init.userToken, apiKey),
      ...(init.headers ?? {}),
    },
  })
  const body = await res.json().catch(() => ({})) as CircleResponse<T>
  if (!res.ok) {
    console.error('[circle-solana-email] Circle API failed', {
      path,
      status: res.status,
      code: body.code,
      message: body.message ?? body.error,
    })
    const err = new Error(body.message ?? body.error ?? `Circle request failed: ${res.status}`)
    ;(err as Error & { status?: number; code?: number; body?: CircleResponse }).status = res.status
    ;(err as Error & { status?: number; code?: number; body?: CircleResponse }).code = body.code
    ;(err as Error & { status?: number; code?: number; body?: CircleResponse }).body = body
    throw err
  }
  return body.data as T
}

function circleError(res: Response, err: unknown) {
  const e = err as Error & { status?: number; code?: number; body?: CircleResponse }
  if (e.message === 'CIRCLE_API_KEY not configured' || e.message === 'CIRCLE_TEST_API_KEY not configured for Arc testnet') {
    return res.status(503).json({ ok: false, error: e.message })
  }
  const detail = (() => {
    try {
      return e.body ? JSON.stringify(e.body).slice(0, 400) : undefined
    } catch {
      return undefined
    }
  })()
  return res.status(e.status ?? 500).json({
    ok: false,
    code: e.code ?? e.body?.code,
    error: e.body?.message ?? e.body?.error ?? e.message ?? 'Circle request failed',
    detail,
  })
}

function isSolanaAddress(address: string) {
  try {
    const key = new PublicKey(address)
    return key.toBase58() === address
  } catch {
    return false
  }
}

function solanaWallet(wallets: Array<{ id: string; address: string; blockchain: string }>) {
  return wallets.find((wallet) =>
    (wallet.blockchain === SOLANA_BLOCKCHAIN || wallet.blockchain === 'SOL') &&
    isSolanaAddress(wallet.address),
  )
}

function evmWallet(wallets: Array<{ id: string; address: string; blockchain: string }>, chain: keyof typeof EVM_CHAINS) {
  const blockchain = EVM_CHAINS[chain].blockchain
  return wallets.find((wallet) => wallet.blockchain === blockchain && isAddress(wallet.address))
}

function isBytes32(value: string | undefined): value is `0x${string}` {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{64}$/.test(value)
}

function parseUsdcUnits(value: string | undefined, fallback: bigint) {
  if (!value) return fallback
  const match = value.trim().match(/^(\d+)(?:\.(\d{0,6})?)?$/)
  if (!match) return fallback
  const whole = BigInt(match[1])
  const frac = BigInt((match[2] ?? '').padEnd(6, '0'))
  return whole * 1_000_000n + frac
}

function gasRecoveryUnits(chain: keyof typeof EVM_CHAINS, totalUnits: bigint, feeUnits: bigint) {
  const cfg = EVM_CHAINS[chain]
  const configured = parseUsdcUnits(process.env[cfg.gasRecoveryEnv], cfg.defaultGasRecoveryUnits)
  if (configured <= 0n) return 0n
  const maxRecoverable = totalUnits - feeUnits - 1n
  if (maxRecoverable <= 0n) return 0n
  return configured > maxRecoverable ? maxRecoverable : configured
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  const { action, ...params } = (req.body ?? {}) as Record<string, string>
  if (!action) return res.status(400).json({ ok: false, error: 'Missing action' })

  try {
    if (action === 'requestEmailOtp') {
      const { deviceId, email, chain } = params
      if (!deviceId || !email) return res.status(400).json({ ok: false, error: 'Missing deviceId or email' })
      const data = await circleJson('/v1/w3s/users/email/token', {
        method: 'POST',
        apiKey: circleApiKey({ chain }),
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), deviceId, email }),
      })
      return res.json({ ok: true, ...data })
    }

    if (action === 'initializeUser') {
      const { userToken, blockchain, accountType } = params
      if (!userToken) return res.status(400).json({ ok: false, error: 'Missing userToken' })
      const data = await circleJson('/v1/w3s/user/initialize', {
        method: 'POST',
        userToken,
        apiKey: circleApiKey({ blockchain }),
        body: JSON.stringify({
          idempotencyKey: crypto.randomUUID(),
          accountType: accountType || 'EOA',
          blockchains: [blockchain || SOLANA_BLOCKCHAIN],
        }),
      })
      return res.json({ ok: true, ...data })
    }

    if (action === 'createWallet') {
      const { userToken, blockchain, accountType, name } = params
      if (!userToken) return res.status(400).json({ ok: false, error: 'Missing userToken' })
      const data = await circleJson('/v1/w3s/user/wallets', {
        method: 'POST',
        userToken,
        apiKey: circleApiKey({ blockchain }),
        body: JSON.stringify({
          idempotencyKey: crypto.randomUUID(),
          accountType: accountType || 'EOA',
          blockchains: [blockchain || SOLANA_BLOCKCHAIN],
          metadata: [{ name: name || 'Hash PayLink Solana' }],
        }),
      })
      return res.json({ ok: true, ...data })
    }

    if (action === 'listWallets') {
      const { userToken, chain } = params
      if (!userToken) return res.status(400).json({ ok: false, error: 'Missing userToken' })
      const data = await circleJson<{ wallets: Array<{ id: string; address: string; blockchain: string }> }>('/v1/w3s/wallets', {
        method: 'GET',
        userToken,
        apiKey: circleApiKey({ chain }),
        headers: { accept: 'application/json' },
      })
      const wallet = chain === 'base' || chain === 'arbitrum' || chain === 'arc'
        ? evmWallet(data.wallets ?? [], chain)
        : solanaWallet(data.wallets ?? [])
      return res.json({ ok: true, wallets: data.wallets ?? [], wallet })
    }

    if (action === 'executeEvmPayment') {
      const { userToken, walletId, walletAddress, chain, recipient, totalUnits } = params
      if (!userToken || !walletId || !walletAddress || !chain || !recipient || !totalUnits) {
        return res.status(400).json({ ok: false, error: 'Missing userToken, walletId, walletAddress, chain, recipient, or totalUnits' })
      }
      if (chain !== 'base' && chain !== 'arbitrum' && chain !== 'arc') {
        return res.status(400).json({ ok: false, error: 'Unsupported EVM email wallet chain' })
      }
      if (!isAddress(walletAddress) || !isAddress(recipient)) {
        return res.status(400).json({ ok: false, error: 'Invalid EVM wallet or recipient address' })
      }

      const total = BigInt(totalUnits)
      const fee = total * PLATFORM_FEE_BPS / BPS_DENOMINATOR
      const recovery = gasRecoveryUnits(chain, total, fee)
      const treasuryAmount = fee + recovery
      const recipientAmount = total - treasuryAmount
      if (total <= 0n || recipientAmount <= 0n) {
        return res.status(400).json({ ok: false, error: 'Invalid payment amount' })
      }

      const tokenAddress = EVM_CHAINS[chain].tokenAddress
      const recipientCallData = encodeFunctionData({
        abi: ERC20_TRANSFER_ABI,
        functionName: 'transfer',
        args: [recipient as `0x${string}`, recipientAmount],
      })
      const treasuryCallData = encodeFunctionData({
        abi: ERC20_TRANSFER_ABI,
        functionName: 'transfer',
        args: [EVM_TREASURY as `0x${string}`, treasuryAmount],
      })
      const batchCallData = encodeFunctionData({
        abi: SMART_WALLET_BATCH_ABI,
        functionName: 'executeBatch',
        args: [[
          { target: tokenAddress as `0x${string}`, value: 0n, data: recipientCallData },
          { target: tokenAddress as `0x${string}`, value: 0n, data: treasuryCallData },
        ]],
      })

      const data = await circleJson('/v1/w3s/user/transactions/contractExecution', {
        method: 'POST',
        userToken,
        apiKey: circleApiKey({ chain }),
        body: JSON.stringify({
          idempotencyKey: crypto.randomUUID(),
          walletId,
          feeLevel: 'HIGH',
          refId: `hashpaylink-${chain}`,
          contractAddress: walletAddress,
          callData: batchCallData,
        }),
      })
      return res.json({ ok: true, ...data })
    }

    if (action === 'executeArcStream') {
      const { userToken, walletId, walletAddress, factoryAddress, recipient, amountUnits, startTime, endTime, salt, predictedVault } = params
      if (!userToken || !walletId || !walletAddress || !factoryAddress || !recipient || !amountUnits || !startTime || !endTime || !salt || !predictedVault) {
        return res.status(400).json({ ok: false, error: 'Missing Arc stream parameters' })
      }
      if (!isAddress(walletAddress) || !isAddress(factoryAddress) || !isAddress(recipient) || !isAddress(predictedVault) || !isBytes32(salt)) {
        return res.status(400).json({ ok: false, error: 'Invalid Arc stream address or salt' })
      }
      const totalAmount = BigInt(amountUnits)
      const start = BigInt(startTime)
      const end = BigInt(endTime)
      if (totalAmount <= 0n || end <= start) {
        return res.status(400).json({ ok: false, error: 'Invalid Arc stream amount or duration' })
      }

      const tokenAddress = EVM_CHAINS.arc.tokenAddress
      const fundCallData = encodeFunctionData({
        abi: ERC20_TRANSFER_ABI,
        functionName: 'transfer',
        args: [predictedVault as `0x${string}`, totalAmount],
      })
      const createCallData = encodeFunctionData({
        abi: STREAM_FACTORY_ABI,
        functionName: 'createStream',
        args: [recipient as `0x${string}`, totalAmount, start, end, salt],
      })
      const batchCallData = encodeFunctionData({
        abi: SMART_WALLET_BATCH_ABI,
        functionName: 'executeBatch',
        args: [[
          { target: tokenAddress as `0x${string}`, value: 0n, data: fundCallData },
          { target: factoryAddress as `0x${string}`, value: 0n, data: createCallData },
        ]],
      })

      const data = await circleJson('/v1/w3s/user/transactions/contractExecution', {
        method: 'POST',
        userToken,
        apiKey: circleApiKey({ chain: 'arc' }),
        body: JSON.stringify({
          idempotencyKey: crypto.randomUUID(),
          walletId,
          feeLevel: 'HIGH',
          refId: 'hashpaylink-arc-streampay',
          contractAddress: walletAddress,
          callData: batchCallData,
        }),
      })
      return res.json({ ok: true, vault: predictedVault, ...data })
    }

    if (action === 'deployEvmWallet') {
      const { userToken, walletId, walletAddress, chain } = params
      if (!userToken || !walletId || !walletAddress || !chain) {
        return res.status(400).json({ ok: false, error: 'Missing userToken, walletId, walletAddress, or chain' })
      }
      if (chain !== 'base' && chain !== 'arbitrum' && chain !== 'arc') {
        return res.status(400).json({ ok: false, error: 'Unsupported EVM email wallet chain' })
      }
      if (!isAddress(walletAddress)) {
        return res.status(400).json({ ok: false, error: 'Invalid EVM wallet address' })
      }

      const tokenAddress = EVM_CHAINS[chain].tokenAddress
      const selfTransferCallData = encodeFunctionData({
        abi: ERC20_TRANSFER_ABI,
        functionName: 'transfer',
        args: [walletAddress as `0x${string}`, 0n],
      })
      const batchCallData = encodeFunctionData({
        abi: SMART_WALLET_BATCH_ABI,
        functionName: 'executeBatch',
        args: [[
          { target: tokenAddress as `0x${string}`, value: 0n, data: selfTransferCallData },
        ]],
      })

      const data = await circleJson('/v1/w3s/user/transactions/contractExecution', {
        method: 'POST',
        userToken,
        apiKey: circleApiKey({ chain }),
        body: JSON.stringify({
          idempotencyKey: crypto.randomUUID(),
          walletId,
          feeLevel: 'HIGH',
          refId: `hashpaylink-${chain}-wallet-activate`,
          contractAddress: walletAddress,
          callData: batchCallData,
        }),
      })
      return res.json({ ok: true, ...data })
    }

    if (action === 'getTransaction') {
      const { userToken, transactionId, chain } = params
      if (!userToken || !transactionId) return res.status(400).json({ ok: false, error: 'Missing userToken or transactionId' })
      const data = await circleJson<{ transaction?: Record<string, unknown> }>(`/v1/w3s/transactions/${encodeURIComponent(transactionId)}`, {
        method: 'GET',
        userToken,
        apiKey: circleApiKey({ chain }),
        headers: { accept: 'application/json' },
      })
      return res.json({ ok: true, transaction: data.transaction ?? data })
    }

    if (action === 'signTypedData') {
      const { userToken, walletId, data: typedData, memo, chain } = params
      if (!userToken || !walletId || !typedData) {
        return res.status(400).json({ ok: false, error: 'Missing userToken, walletId, or typed data' })
      }
      const result = await circleJson('/v1/w3s/user/sign/typedData', {
        method: 'POST',
        userToken,
        apiKey: circleApiKey({ chain }),
        body: JSON.stringify({
          walletId,
          data: typedData,
          memo: memo || 'Hash PayLink typed-data signature',
        }),
      })
      return res.json({ ok: true, ...result })
    }

    if (action === 'signPayment') {
      const { userToken, walletId, rawTransaction, memo } = params
      if (!userToken || !walletId || !rawTransaction) {
        return res.status(400).json({ ok: false, error: 'Missing userToken, walletId, or rawTransaction' })
      }
      const walletData = await circleJson<{ wallets: Array<{ id: string; address: string; blockchain: string }> }>('/v1/w3s/wallets', {
        method: 'GET',
        userToken,
        apiKey: circleApiKey(),
        headers: { accept: 'application/json' },
      })
      const wallet = walletData.wallets?.find((item) => item.id === walletId)
      if (!wallet || !isSolanaAddress(wallet.address)) {
        return res.status(400).json({ ok: false, error: 'Circle did not return a valid Solana wallet address. Reconnect with email and try again.' })
      }
      const data = await circleJson('/v1/w3s/user/sign/transaction', {
        method: 'POST',
        userToken,
        apiKey: circleApiKey(),
        body: JSON.stringify({
          walletId,
          rawTransaction,
          memo: memo || 'Hash PayLink USDC payment on Solana',
        }),
      })
      if (!data.challengeId) {
        console.error('[circle-solana-email] Missing signing challenge', {
          walletId,
          keys: Object.keys(data),
        })
      }
      return res.json({ ok: true, ...data })
    }

    return res.status(400).json({ ok: false, error: `Unknown action: ${action}` })
  } catch (err) {
    return circleError(res, err)
  }
}
