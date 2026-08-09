import type { Request, Response } from 'express'
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js'
import {
  getAssociatedTokenAddress,
  SOLANA_ASSOCIATED_TOKEN_PROGRAM_ID,
  SOLANA_TOKEN_PROGRAM_ID,
} from '../solana-token.js'
import {
  getRpc,
  loadRelayer,
  relaySolanaTx,
} from '../relay-solana.js'
import {
  circleLinkKey,
  readCircleLink,
  verifiedPrivyUser,
  type CircleLinkRecord,
  type VerifiedLinkUser,
} from '../privy-circle-link.js'

const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')
const BRIDGE_KIT_PROGRAM = new PublicKey('DFaauJEjmiHkPs1JG89A4p95hDWi9m9SAEERY1LQJiC3')
const CCTP_TOKEN_MESSENGER = new PublicKey('CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC')
const CCTP_MESSAGE_TRANSMITTER = new PublicKey('CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe')
const BRIDGE_WITH_HOOK_DISCRIMINATOR = Buffer.from('f2113f250ab3a918', 'hex')
const CCTP_EVENT_RENT_LAMPORTS = 3_900_000n
const MAX_TRANSACTION_BYTES = 16_384
const DESTINATION_DOMAINS = { arbitrum: 3, base: 6 } as const

type Destination = keyof typeof DESTINATION_DOMAINS
type ExpectedBridge = { destination: Destination; destinationAddress: string; amount: string }
type RelayPhase = 'wallet-pays' | 'relayer-pays'

type Dependencies = {
  verifyUser(req: Request): Promise<VerifiedLinkUser>
  readLink(key: string): Promise<CircleLinkRecord | null>
  relay(req: Request, res: Response): Promise<void>
}

function fail(status: number, message: string) {
  return Object.assign(new Error(message), { status })
}

function parseUsdcAmount(value: string) {
  const match = value.trim().match(/^(\d+)(?:\.(\d{0,6})?)?$/)
  if (!match) throw fail(400, 'Enter a positive USDC amount with up to 6 decimals.')
  const raw = BigInt(match[1]) * 1_000_000n + BigInt((match[2] ?? '').padEnd(6, '0'))
  if (raw <= 0n) throw fail(400, 'Bridge amount must be greater than zero.')
  return raw
}

function parseEvmRecipient(value: string) {
  const normalized = value.trim()
  if (!/^0x[0-9a-fA-F]{40}$/.test(normalized)) throw fail(400, 'Enter a valid EVM destination address.')
  return Buffer.concat([Buffer.alloc(12), Buffer.from(normalized.slice(2), 'hex')])
}

function decodeTransaction(value: string) {
  if (!value || value.length > MAX_TRANSACTION_BYTES * 2) throw fail(400, 'Solana bridge transaction is invalid.')
  try {
    const bytes = Buffer.from(value, 'base64')
    if (bytes.length === 0 || bytes.length > MAX_TRANSACTION_BYTES) throw new Error('invalid length')
    return Transaction.from(bytes)
  } catch {
    throw fail(400, 'Solana bridge transaction is invalid.')
  }
}

function assertKey(actual: PublicKey | undefined, expected: PublicKey, label: string) {
  if (!actual?.equals(expected)) throw fail(400, `Solana CCTP ${label} did not match the approved route.`)
}

function assertMeta(
  instruction: TransactionInstruction,
  index: number,
  expected: PublicKey,
  signer: boolean,
  writable: boolean,
  label: string,
) {
  const meta = instruction.keys[index]
  assertKey(meta?.pubkey, expected, label)
  if (meta?.isSigner !== signer || meta.isWritable !== writable) {
    throw fail(400, `Solana CCTP ${label} permissions were invalid.`)
  }
}

function replaceKey(instruction: TransactionInstruction, index: number, pubkey: PublicKey) {
  return new TransactionInstruction({
    programId: instruction.programId,
    data: Buffer.from(instruction.data),
    keys: instruction.keys.map((meta, keyIndex) => keyIndex === index ? { ...meta, pubkey } : { ...meta }),
  })
}

function validateSystemFunding(
  instruction: TransactionInstruction,
  payer: PublicKey,
) {
  assertKey(instruction.programId, SystemProgram.programId, 'event-rent program')
  if (instruction.keys.length !== 2 || instruction.data.length !== 12 || instruction.data.readUInt32LE(0) !== 2) {
    throw fail(400, 'Solana CCTP event-rent instruction was invalid.')
  }
  assertMeta(instruction, 0, payer, true, true, 'event-rent payer')
  const messageSender = instruction.keys[1]?.pubkey
  if (!messageSender || !instruction.keys[1]?.isSigner || !instruction.keys[1]?.isWritable) {
    throw fail(400, 'Solana CCTP message account was invalid.')
  }
  if (instruction.data.readBigUInt64LE(4) !== CCTP_EVENT_RENT_LAMPORTS) {
    throw fail(400, 'Solana CCTP event-rent amount was invalid.')
  }
  return messageSender
}

async function validateAtaInstruction(
  instruction: TransactionInstruction,
  payer: PublicKey,
) {
  assertKey(instruction.programId, SOLANA_ASSOCIATED_TOKEN_PROGRAM_ID, 'token-account program')
  if (instruction.keys.length !== 6 || instruction.data.length !== 1 || instruction.data[0] !== 1) {
    throw fail(400, 'Solana CCTP token-account instruction was invalid.')
  }
  assertMeta(instruction, 0, payer, true, true, 'token-account payer')
  assertKey(instruction.keys[3]?.pubkey, USDC_MINT, 'token-account mint')
  assertKey(instruction.keys[4]?.pubkey, SystemProgram.programId, 'token-account system program')
  assertKey(instruction.keys[5]?.pubkey, SOLANA_TOKEN_PROGRAM_ID, 'token program')
  const owner = instruction.keys[2]?.pubkey
  const ata = instruction.keys[1]?.pubkey
  if (!owner || !ata || !(await getAssociatedTokenAddress(USDC_MINT, owner, true)).equals(ata)) {
    throw fail(400, 'Solana CCTP associated token account was invalid.')
  }
}

async function validateBridgeInstruction(input: {
  instruction: TransactionInstruction
  wallet: PublicKey
  eventRentPayer: PublicKey
  messageSender: PublicKey
  expected: ExpectedBridge
}) {
  const { instruction, wallet, eventRentPayer, messageSender, expected } = input
  assertKey(instruction.programId, BRIDGE_KIT_PROGRAM, 'bridge program')
  if (instruction.keys.length !== 23 || instruction.data.length < 100) {
    throw fail(400, 'Solana CCTP bridge instruction was invalid.')
  }
  assertMeta(instruction, 1, wallet, true, true, 'USDC authority')
  assertMeta(instruction, 2, eventRentPayer, true, true, 'bridge event-rent payer')
  assertMeta(instruction, 4, await getAssociatedTokenAddress(USDC_MINT, wallet, true), false, true, 'source USDC account')
  assertKey(instruction.keys[12]?.pubkey, USDC_MINT, 'USDC mint')
  assertMeta(instruction, 13, messageSender, true, true, 'message signer')
  assertKey(instruction.keys[14]?.pubkey, CCTP_TOKEN_MESSENGER, 'token messenger')
  assertKey(instruction.keys[15]?.pubkey, CCTP_MESSAGE_TRANSMITTER, 'message transmitter')
  assertKey(instruction.keys[16]?.pubkey, SOLANA_TOKEN_PROGRAM_ID, 'token program')
  assertKey(instruction.keys[17]?.pubkey, SystemProgram.programId, 'system program')
  assertKey(instruction.keys[18]?.pubkey, CCTP_MESSAGE_TRANSMITTER, 'CCTP program')
  assertKey(instruction.keys[22]?.pubkey, BRIDGE_KIT_PROGRAM, 'self-CPI program')
  if (!instruction.data.subarray(0, 8).equals(BRIDGE_WITH_HOOK_DISCRIMINATOR)) {
    throw fail(400, 'Only Circle CCTP forwarding burns may use the Solana sponsor.')
  }
  const requestedAmount = parseUsdcAmount(expected.amount)
  if (instruction.data.readBigUInt64LE(8) !== requestedAmount) {
    throw fail(400, 'Solana CCTP amount did not match the requested bridge.')
  }
  if (instruction.data.readUInt32LE(16) !== DESTINATION_DOMAINS[expected.destination]) {
    throw fail(400, 'Solana CCTP destination domain did not match the requested bridge.')
  }
  if (!instruction.data.subarray(20, 52).equals(parseEvmRecipient(expected.destinationAddress))) {
    throw fail(400, 'Solana CCTP recipient did not match the requested bridge.')
  }
  if (instruction.data.subarray(52, 84).some(byte => byte !== 0)) {
    throw fail(400, 'Solana CCTP destination caller was not permissionless.')
  }
  if (instruction.data.readUInt32LE(92) !== 1_000) {
    throw fail(400, 'Solana CCTP finality threshold was not the approved fast route.')
  }
  const hookLength = instruction.data.readUInt32LE(96)
  if (hookLength !== 32 || instruction.data.length !== 100 + hookLength) {
    throw fail(400, 'Solana CCTP forwarding hook was invalid.')
  }
  if (instruction.data.subarray(100, 112).toString('utf8') !== 'cctp-forward') {
    throw fail(400, 'Solana CCTP forwarding hook was invalid.')
  }
}

async function validateAndTransform(input: {
  transaction: Transaction
  wallet: PublicKey
  relayer: PublicKey
  expected: ExpectedBridge
  phase: RelayPhase
}) {
  const { transaction, wallet, relayer, expected, phase } = input
  const payer = phase === 'wallet-pays' ? wallet : relayer
  assertKey(transaction.feePayer, payer, 'transaction fee payer')
  if (transaction.instructions.length < 2 || transaction.instructions.length > 4) {
    throw fail(400, 'Solana CCTP transaction contained an unexpected instruction count.')
  }
  const funding = transaction.instructions[0]
  const bridge = transaction.instructions.at(-1)
  if (!funding || !bridge) throw fail(400, 'Solana CCTP transaction was incomplete.')
  const messageSender = validateSystemFunding(funding, payer)
  for (const instruction of transaction.instructions.slice(1, -1)) {
    await validateAtaInstruction(instruction, payer)
  }
  await validateBridgeInstruction({
    instruction: bridge,
    wallet,
    eventRentPayer: payer,
    messageSender,
    expected,
  })
  const expectedSignerKeys = new Set([payer.toBase58(), wallet.toBase58(), messageSender.toBase58()])
  const actualSignerKeys = new Set(transaction.signatures.map(item => item.publicKey.toBase58()))
  if (actualSignerKeys.size !== expectedSignerKeys.size || [...expectedSignerKeys].some(key => !actualSignerKeys.has(key))) {
    throw fail(400, 'Solana CCTP transaction contained an unexpected signer.')
  }
  if (phase === 'relayer-pays' && !transaction.verifySignatures(true)) {
    throw fail(400, 'Solana CCTP transaction signatures were invalid.')
  }
  return {
    messageSender,
    instructions: phase === 'wallet-pays'
      ? [
          replaceKey(funding, 0, relayer),
          ...transaction.instructions.slice(1, -1).map(instruction => replaceKey(instruction, 0, relayer)),
          replaceKey(bridge, 2, relayer),
        ]
      : transaction.instructions,
  }
}

export async function preparePocketSolanaCctpTransaction(input: {
  transaction: string
  walletAddress: string
  expected: ExpectedBridge
  connection?: Connection
}) {
  const transaction = decodeTransaction(input.transaction)
  const wallet = new PublicKey(input.walletAddress)
  const relayer = loadRelayer()
  const { instructions } = await validateAndTransform({
    transaction,
    wallet,
    relayer: relayer.publicKey,
    expected: input.expected,
    phase: 'wallet-pays',
  })
  const connection = input.connection ?? new Connection(getRpc(), 'confirmed')
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
  const sponsored = new Transaction({ feePayer: relayer.publicKey, recentBlockhash: blockhash }).add(...instructions)
  sponsored.partialSign(relayer)
  return {
    transaction: sponsored.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64'),
    lastValidBlockHeight,
  }
}

export async function validatePocketSolanaCctpSignedTransaction(input: {
  transaction: string
  walletAddress: string
  expected: ExpectedBridge
}) {
  const transaction = decodeTransaction(input.transaction)
  const relayer = loadRelayer()
  await validateAndTransform({
    transaction,
    wallet: new PublicKey(input.walletAddress),
    relayer: relayer.publicKey,
    expected: input.expected,
    phase: 'relayer-pays',
  })
}

function parseExpected(body: unknown): ExpectedBridge & { transaction: string; lastValidBlockHeight?: number } {
  if (!body || typeof body !== 'object') throw fail(400, 'Solana CCTP bridge request is invalid.')
  const value = body as Record<string, unknown>
  if (value.destination !== 'base' && value.destination !== 'arbitrum') throw fail(400, 'Solana CCTP destination is invalid.')
  if (typeof value.destinationAddress !== 'string' || typeof value.amount !== 'string' || typeof value.transaction !== 'string') {
    throw fail(400, 'Solana CCTP bridge request is invalid.')
  }
  parseEvmRecipient(value.destinationAddress)
  parseUsdcAmount(value.amount)
  return {
    destination: value.destination,
    destinationAddress: value.destinationAddress,
    amount: value.amount,
    transaction: value.transaction,
    ...(Number.isSafeInteger(value.lastValidBlockHeight) ? { lastValidBlockHeight: value.lastValidBlockHeight as number } : {}),
  }
}

async function linkedWallet(dependencies: Dependencies, req: Request) {
  const identity = await dependencies.verifyUser(req)
  const link = await dependencies.readLink(circleLinkKey(identity.userId, 'solana', 'payment'))
  if (!link) throw fail(404, 'Link a Circle Solana wallet before bridging.')
  if (link.chain !== 'solana' || (link.purpose ?? 'payment') !== 'payment') {
    throw fail(500, 'Stored Circle wallet link did not match the Solana payment wallet.')
  }
  return link.circleWalletAddress
}

function sendError(res: Response, error: unknown) {
  const parsed = error as Error & { status?: number }
  const status = parsed.status ?? 500
  return res.status(status).json({
    ok: false,
    error: {
      code: status === 401 ? 'AUTH_REQUIRED' : status === 403 ? 'FORBIDDEN' : status === 404 ? 'RESOURCE_NOT_FOUND' : status >= 500 ? 'PROVIDER_UNAVAILABLE' : 'VALIDATION_FAILED',
      message: parsed.message || 'Solana CCTP relay failed.',
      retryable: status >= 500,
    },
  })
}

export function createPocketSolanaCctpPrepareHandler(dependencies: Dependencies) {
  return async function pocketSolanaCctpPrepareHandler(req: Request, res: Response) {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Method not allowed.', retryable: false } })
    try {
      const body = parseExpected(req.body)
      const walletAddress = await linkedWallet(dependencies, req)
      const prepared = await preparePocketSolanaCctpTransaction({
        transaction: body.transaction,
        walletAddress,
        expected: body,
      })
      return res.json({ ok: true, ...prepared })
    } catch (error) {
      return sendError(res, error)
    }
  }
}

export function createPocketSolanaCctpSubmitHandler(dependencies: Dependencies) {
  return async function pocketSolanaCctpSubmitHandler(req: Request, res: Response) {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Method not allowed.', retryable: false } })
    try {
      const body = parseExpected(req.body)
      if (!Number.isSafeInteger(body.lastValidBlockHeight)) throw fail(400, 'Solana CCTP block height is required.')
      const walletAddress = await linkedWallet(dependencies, req)
      await validatePocketSolanaCctpSignedTransaction({
        transaction: body.transaction,
        walletAddress,
        expected: body,
      })
      return dependencies.relay({
        ...req,
        body: { tx: body.transaction, lastValidBlockHeight: body.lastValidBlockHeight },
      } as Request, res)
    } catch (error) {
      return sendError(res, error)
    }
  }
}

const dependencies: Dependencies = {
  verifyUser: verifiedPrivyUser,
  readLink: readCircleLink,
  relay: relaySolanaTx,
}

export const pocketSolanaCctpPrepareHandler = createPocketSolanaCctpPrepareHandler(dependencies)
export const pocketSolanaCctpSubmitHandler = createPocketSolanaCctpSubmitHandler(dependencies)
