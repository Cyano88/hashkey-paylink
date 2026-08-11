import type { Request, Response } from 'express'
import { AnchorProvider, Program } from '@coral-xyz/anchor'
import BN from 'bn.js'
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js'
import {
  createAssociatedTokenAccountInstruction,
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
import { readCctpForwardQuote } from './cctp.js'

const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')
const BRIDGE_KIT_PROGRAM = new PublicKey('DFaauJEjmiHkPs1JG89A4p95hDWi9m9SAEERY1LQJiC3')
const CCTP_TOKEN_MESSENGER = new PublicKey('CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe')
const CCTP_MESSAGE_TRANSMITTER = new PublicKey('CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC')
const BRIDGE_WITH_HOOK_DISCRIMINATOR = Buffer.from('f2113f250ab3a918', 'hex')
const CCTP_EVENT_RENT_LAMPORTS = 3_900_000n
const RELAYER_OPERATIONAL_BUFFER_LAMPORTS = 100_000n
const MAX_TRANSACTION_BYTES = 16_384
const DESTINATION_DOMAINS = { arbitrum: 3, base: 6 } as const

type Destination = keyof typeof DESTINATION_DOMAINS
type ExpectedBridge = { destination: Destination; destinationAddress: string; amount: string }
type BuiltBridge = {
  instructions: TransactionInstruction[]
  messageSender: Keypair
  additionalRentLamports: bigint
}

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

function derivePda(program: PublicKey, ...seeds: Buffer[]) {
  return PublicKey.findProgramAddressSync(seeds, program)[0]
}

function idempotentAtaInstruction(payer: PublicKey, ata: PublicKey, owner: PublicKey) {
  const instruction = createAssociatedTokenAccountInstruction(payer, ata, owner, USDC_MINT)
  return new TransactionInstruction({
    programId: instruction.programId,
    keys: instruction.keys,
    data: Buffer.from([1]),
  })
}

async function buildManualBridge(input: {
  connection: Connection
  wallet: PublicKey
  relayer: Keypair
  expected: ExpectedBridge
}): Promise<BuiltBridge> {
  const { connection, wallet, relayer, expected } = input
  const amount = parseUsdcAmount(expected.amount)
  const sourceAta = await getAssociatedTokenAddress(USDC_MINT, wallet, true)
  const sourceAccount = await connection.getAccountInfo(sourceAta, 'confirmed')
  if (!sourceAccount) throw fail(400, 'The linked Circle Solana wallet does not have a USDC token account.')

  const quote = await readCctpForwardQuote('solana', expected.destination, amount)
  const messageSender = Keypair.generate()
  const providerWallet = {
    publicKey: relayer.publicKey,
    signTransaction: async <T>(transaction: T) => transaction,
    signAllTransactions: async <T>(transactions: T[]) => transactions,
  }
  const provider = new AnchorProvider(connection, providerWallet, { commitment: 'confirmed' })
  const bridgeKit = await Program.at(BRIDGE_KIT_PROGRAM, provider)

  const statePda = derivePda(BRIDGE_KIT_PROGRAM, Buffer.from('state'))
  const state = await (bridgeKit.account as Record<string, { fetch(address: PublicKey): Promise<Record<string, unknown>> }>).state.fetch(statePda)
  if (!state?.protocolFeeWallet) throw fail(503, 'Circle bridge configuration is temporarily unavailable.')
  const protocolFeeWallet = new PublicKey(state.protocolFeeWallet as PublicKey)
  const developerFeeWallet = PublicKey.default
  const protocolFeeAta = await getAssociatedTokenAddress(USDC_MINT, protocolFeeWallet, true)
  const developerFeeAta = await getAssociatedTokenAddress(USDC_MINT, developerFeeWallet, true)

  const ataInstructions: TransactionInstruction[] = []
  for (const [ata, owner] of [[protocolFeeAta, protocolFeeWallet], [developerFeeAta, developerFeeWallet]] as const) {
    if (!(await connection.getAccountInfo(ata, 'confirmed'))) {
      ataInstructions.push(idempotentAtaInstruction(relayer.publicKey, ata, owner))
    }
  }

  const senderAuthorityPda = derivePda(CCTP_TOKEN_MESSENGER, Buffer.from('sender_authority'))
  const tokenMessengerPda = derivePda(CCTP_TOKEN_MESSENGER, Buffer.from('token_messenger'))
  const tokenMinterPda = derivePda(CCTP_TOKEN_MESSENGER, Buffer.from('token_minter'))
  const localTokenPda = derivePda(CCTP_TOKEN_MESSENGER, Buffer.from('local_token'), USDC_MINT.toBuffer())
  const remoteTokenMessengerPda = derivePda(
    CCTP_TOKEN_MESSENGER,
    Buffer.from('remote_token_messenger'),
    Buffer.from(DESTINATION_DOMAINS[expected.destination].toString(), 'utf8'),
  )
  const messageTransmitterPda = derivePda(CCTP_MESSAGE_TRANSMITTER, Buffer.from('message_transmitter'))
  const denylistPda = derivePda(CCTP_TOKEN_MESSENGER, Buffer.from('denylist_account'), wallet.toBuffer())
  const cctpEventAuthorityPda = derivePda(CCTP_TOKEN_MESSENGER, Buffer.from('__event_authority'))
  const bridgeEventAuthorityPda = derivePda(BRIDGE_KIT_PROGRAM, Buffer.from('__event_authority'))
  const hookData = Buffer.alloc(32)
  Buffer.from('cctp-forward', 'utf8').copy(hookData)

  const bridgeInstruction = await (bridgeKit.methods as any).bridgeWithHook({
    amount: new BN(quote.totalUnits.toString()),
    destinationDomain: DESTINATION_DOMAINS[expected.destination],
    mintRecipient: new PublicKey(parseEvmRecipient(expected.destinationAddress)),
    destinationCaller: PublicKey.default,
    maxFee: new BN(quote.maxFeeUnits.toString()),
    minFinalityThreshold: quote.finalityThreshold,
    bridgingKitFee: new BN(0),
    hookData,
  }).accountsPartial({
    state: statePda,
    authority: wallet,
    eventRentPayer: relayer.publicKey,
    burnTokenAccount: sourceAta,
    protocolFeeWalletTokenAccount: protocolFeeAta,
    developerFeeRecipientTokenAccount: developerFeeAta,
    senderAuthorityPda,
    denylistAccount: denylistPda,
    messageTransmitter: messageTransmitterPda,
    tokenMessenger: tokenMessengerPda,
    remoteTokenMessenger: remoteTokenMessengerPda,
    tokenMinter: tokenMinterPda,
    localToken: localTokenPda,
    burnTokenMint: USDC_MINT,
    messageSentEventData: messageSender.publicKey,
    messageTransmitterProgram: CCTP_MESSAGE_TRANSMITTER,
    tokenMessengerMinterProgram: CCTP_TOKEN_MESSENGER,
    tokenProgram: SOLANA_TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
    eventAuthority: bridgeEventAuthorityPda,
    program: BRIDGE_KIT_PROGRAM,
    cctpEventAuthority: cctpEventAuthorityPda,
    cctpProgram: CCTP_TOKEN_MESSENGER,
  }).signers([messageSender]).instruction()

  const ataRent = ataInstructions.length
    ? BigInt(await connection.getMinimumBalanceForRentExemption(165, 'confirmed')) * BigInt(ataInstructions.length)
    : 0n
  return {
    instructions: [
      SystemProgram.transfer({
        fromPubkey: relayer.publicKey,
        toPubkey: messageSender.publicKey,
        lamports: Number(CCTP_EVENT_RENT_LAMPORTS),
      }),
      ...ataInstructions,
      bridgeInstruction,
    ],
    messageSender,
    additionalRentLamports: ataRent,
  }
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
  if (!messageSender || !instruction.keys[1]?.isWritable) {
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
  assertKey(instruction.keys[14]?.pubkey, CCTP_MESSAGE_TRANSMITTER, 'message transmitter program')
  assertKey(instruction.keys[15]?.pubkey, CCTP_TOKEN_MESSENGER, 'token messenger program')
  assertKey(instruction.keys[16]?.pubkey, SOLANA_TOKEN_PROGRAM_ID, 'token program')
  assertKey(instruction.keys[17]?.pubkey, SystemProgram.programId, 'system program')
  assertKey(instruction.keys[18]?.pubkey, CCTP_TOKEN_MESSENGER, 'CCTP program')
  assertKey(instruction.keys[22]?.pubkey, BRIDGE_KIT_PROGRAM, 'self-CPI program')
  if (!instruction.data.subarray(0, 8).equals(BRIDGE_WITH_HOOK_DISCRIMINATOR)) {
    throw fail(400, 'Only Circle CCTP forwarding burns may use the Solana sponsor.')
  }
  const requestedAmount = parseUsdcAmount(expected.amount)
  const burnAmount = instruction.data.readBigUInt64LE(8)
  const maxFee = instruction.data.readBigUInt64LE(84)
  if (burnAmount !== requestedAmount + maxFee) {
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
  if (hookLength !== 32 || instruction.data.length !== 108 + hookLength) {
    throw fail(400, 'Solana CCTP forwarding hook was invalid.')
  }
  const expectedHook = Buffer.alloc(32)
  Buffer.from('cctp-forward', 'utf8').copy(expectedHook)
  if (!instruction.data.subarray(100, 132).equals(expectedHook)) {
    throw fail(400, 'Solana CCTP forwarding hook was invalid.')
  }
  if (instruction.data.readBigUInt64LE(132) !== 0n) {
    throw fail(400, 'Solana CCTP bridging kit fee was not zero.')
  }
}

async function validateSignedTransaction(input: {
  transaction: Transaction
  wallet: PublicKey
  relayer: PublicKey
  expected: ExpectedBridge
  requireAllSignatures?: boolean
}) {
  const { transaction, wallet, relayer, expected } = input
  assertKey(transaction.feePayer, relayer, 'transaction fee payer')
  if (transaction.instructions.length < 2 || transaction.instructions.length > 4) {
    throw fail(400, 'Solana CCTP transaction contained an unexpected instruction count.')
  }
  const funding = transaction.instructions[0]
  const bridge = transaction.instructions.at(-1)
  if (!funding || !bridge) throw fail(400, 'Solana CCTP transaction was incomplete.')
  const messageSender = validateSystemFunding(funding, relayer)
  for (const instruction of transaction.instructions.slice(1, -1)) {
    await validateAtaInstruction(instruction, relayer)
  }
  await validateBridgeInstruction({
    instruction: bridge,
    wallet,
    eventRentPayer: relayer,
    messageSender,
    expected,
  })
  const expectedSignerKeys = new Set([relayer.toBase58(), wallet.toBase58(), messageSender.toBase58()])
  const actualSignerKeys = new Set(transaction.signatures.map(item => item.publicKey.toBase58()))
  if (actualSignerKeys.size !== expectedSignerKeys.size || [...expectedSignerKeys].some(key => !actualSignerKeys.has(key))) {
    throw fail(400, 'Solana CCTP transaction contained an unexpected signer.')
  }
  if (input.requireAllSignatures !== false && !transaction.verifySignatures(true)) {
    throw fail(400, 'Solana CCTP transaction signatures were invalid.')
  }
}

export async function preparePocketSolanaCctpTransaction(input: {
  walletAddress: string
  expected: ExpectedBridge
  connection?: Connection
  buildBridge?: typeof buildManualBridge
  relayer?: Keypair
}) {
  const wallet = new PublicKey(input.walletAddress)
  const relayer = input.relayer ?? loadRelayer()
  const connection = input.connection ?? new Connection(getRpc(), 'confirmed')
  const built = await (input.buildBridge ?? buildManualBridge)({
    connection,
    wallet,
    relayer,
    expected: input.expected,
  })
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
  const sponsored = new Transaction({ feePayer: relayer.publicKey, recentBlockhash: blockhash }).add(...built.instructions)
  const fee = await connection.getFeeForMessage(sponsored.compileMessage(), 'confirmed')
  if (fee.value === null) throw fail(503, 'Solana bridge sponsorship is temporarily unavailable.')
  const requiredLamports = CCTP_EVENT_RENT_LAMPORTS
    + built.additionalRentLamports
    + BigInt(fee.value)
    + RELAYER_OPERATIONAL_BUFFER_LAMPORTS
  const relayerBalance = BigInt(await connection.getBalance(relayer.publicKey, 'confirmed'))
  if (relayerBalance < requiredLamports) {
    throw fail(503, 'Solana bridge sponsorship is temporarily unavailable. Hash PayLink is replenishing its SOL fee wallet.')
  }
  sponsored.partialSign(relayer, built.messageSender)
  await validateSignedTransaction({
    transaction: sponsored,
    wallet,
    relayer: relayer.publicKey,
    expected: input.expected,
    requireAllSignatures: false,
  })
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
  await validateSignedTransaction({
    transaction,
    wallet: new PublicKey(input.walletAddress),
    relayer: relayer.publicKey,
    expected: input.expected,
  })
}

function parseExpected(body: unknown): ExpectedBridge & { transaction?: string; lastValidBlockHeight?: number } {
  if (!body || typeof body !== 'object') throw fail(400, 'Solana CCTP bridge request is invalid.')
  const value = body as Record<string, unknown>
  if (value.destination !== 'base' && value.destination !== 'arbitrum') throw fail(400, 'Solana CCTP destination is invalid.')
  if (typeof value.destinationAddress !== 'string' || typeof value.amount !== 'string') {
    throw fail(400, 'Solana CCTP bridge request is invalid.')
  }
  parseEvmRecipient(value.destinationAddress)
  parseUsdcAmount(value.amount)
  return {
    destination: value.destination,
    destinationAddress: value.destinationAddress,
    amount: value.amount,
    ...(typeof value.transaction === 'string' ? { transaction: value.transaction } : {}),
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
      if (!body.transaction) throw fail(400, 'Solana CCTP signed transaction is required.')
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
