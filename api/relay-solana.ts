/**
 * Solana gasless USDC relay.
 *
 * POST /api/solana-build-tx  — server builds a transaction with the relayer
 *                              as fee payer, partially signs it, and returns
 *                              the serialised bytes for the client to sign.
 *
 * POST /api/solana-relay     — receives the fully-signed transaction from the
 *                              client and submits it to the Solana network.
 *
 * GET  /api/solana-vault     — returns the deterministic temp ATA for a given
 *                              linkId (Send-via-Address flow).
 *
 * POST /api/solana-sweep     — checks temp ATA balance and sweeps to recipient
 *                              when USDC has arrived.
 *
 * Env vars required:
 *   SOLANA_RPC_URL                — RPC endpoint (defaults to mainnet public node)
 *   RELAYER_PRIVATE_KEY_SOLANA    — base64 OR JSON-array encoded 64-byte keypair
 *   SOLANA_TREASURY               — recipient Solana address for the 0.2% fee
 *                                   (optional — fee skipped if not set)
 */

import type { Request, Response } from 'express'
import {
  Connection, Keypair, PublicKey, Transaction,
} from '@solana/web3.js'
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  createCloseAccountInstruction,
  getAccount,
  TokenAccountNotFoundError,
} from '@solana/spl-token'
import crypto from 'crypto'
import bs58   from 'bs58'

// ── Constants ─────────────────────────────────────────────────────────────────
const USDC_MINT     = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')
const USDC_DECIMALS = 6
const PLATFORM_FEE_BPS = 20 // 0.2%

// ── Helpers ───────────────────────────────────────────────────────────────────

function getRpc(): string {
  return process.env.SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com'
}

function loadRelayer(): Keypair {
  const raw = process.env.RELAYER_PRIVATE_KEY_SOLANA
  if (!raw) throw new Error('RELAYER_PRIVATE_KEY_SOLANA not configured')
  // Accept three formats:
  //   JSON array  — [1,2,3,...,64]     (Solana CLI / solana-keygen output)
  //   Base64      — 88-char string      (manual export)
  //   Base58      — Phantom "Export Private Key" output
  try { return Keypair.fromSecretKey(new Uint8Array(JSON.parse(raw) as number[])) } catch { /* not JSON */ }
  try { return Keypair.fromSecretKey(bs58.decode(raw)) }                           catch { /* not base58 */ }
  return Keypair.fromSecretKey(Buffer.from(raw, 'base64'))
}

function parseSolanaAddress(label: string, value?: string): PublicKey {
  const normalized = value?.trim()
  if (!normalized) throw new Error(`${label} is required`)
  try {
    return new PublicKey(normalized)
  } catch {
    throw new Error(`${label} is not a valid Solana address`)
  }
}

function getSolanaTreasury(feeRaw: bigint): PublicKey | null {
  if (feeRaw === 0n) return null
  return parseSolanaAddress('Solana treasury address', process.env.SOLANA_TREASURY)
}

function decodeSignedTransaction(tx: string): Buffer {
  const normalized = tx.trim()
  if (normalized.length > 16_384) throw new Error('Signed Solana transaction is too large')
  try {
    const bytes = Buffer.from(normalized, 'base64')
    Transaction.from(bytes)
    return bytes
  } catch { /* try base58 below */ }

  try {
    const bytes = Buffer.from(bs58.decode(normalized))
    Transaction.from(bytes)
    return bytes
  } catch {
    throw new Error('Signed Solana transaction is not valid')
  }
}

/** Deterministically derive a vault keypair from a linkId + recipient pair. */
function deriveVaultKeypair(linkId: string, recipient: string): Keypair {
  const seed = crypto.createHash('sha256')
    .update(`hashpaylink_sol_vault_v2_${linkId}_${recipient}`)
    .digest()
  return Keypair.fromSeed(seed)
}

function parseUsdcAmount(amount: string): bigint {
  const normalized = amount.trim()
  const match = normalized.match(/^(\d+)(?:\.(\d{0,6})?)?$/)
  if (!match) throw new Error('Amount must be a positive USDC value with up to 6 decimals')
  const whole = BigInt(match[1])
  const fraction = BigInt((match[2] ?? '').padEnd(USDC_DECIMALS, '0'))
  const value = whole * 10n ** BigInt(USDC_DECIMALS) + fraction
  if (value <= 0n) throw new Error('Amount must be greater than zero')
  return value
}

/** Create the ATA for a wallet if it doesn't already exist, returns the ATA pubkey */
async function ensureATA(
  connection: Connection,
  tx: Transaction,
  mint: PublicKey,
  owner: PublicKey,
  payer: PublicKey,
): Promise<PublicKey> {
  const ata = await getAssociatedTokenAddress(mint, owner)
  try {
    await getAccount(connection, ata)
  } catch (e) {
    if (e instanceof TokenAccountNotFoundError) {
      tx.add(createAssociatedTokenAccountInstruction(payer, ata, owner, mint))
    }
  }
  return ata
}

// ── POST /api/solana-build-tx ─────────────────────────────────────────────────
export async function buildSolanaTx(req: Request, res: Response): Promise<void> {
  const { from, to, amount } = req.body as { from?: string; to?: string; amount?: string }

  if (!from || !to || !amount) {
    res.status(400).json({ ok: false, error: 'Missing from / to / amount' })
    return
  }

  let relayer: Keypair
  try { relayer = loadRelayer() }
  catch { res.status(503).json({ ok: false, error: 'Solana relay not configured' }); return }

  try {
    const connection = new Connection(getRpc(), 'confirmed')

    const fromPubkey = parseSolanaAddress('Sender address', from)
    const toPubkey   = parseSolanaAddress('Recipient address', to)

    const totalRaw      = parseUsdcAmount(amount)
    const feeRaw        = totalRaw * BigInt(PLATFORM_FEE_BPS) / 10_000n
    const recipientRaw  = totalRaw - feeRaw
    if (recipientRaw <= 0n) throw new Error('Payment amount is too small after fees')

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
    const tx = new Transaction({ feePayer: relayer.publicKey, recentBlockhash: blockhash })

    // Ensure sender ATA exists (if it doesn't, payment will fail — sender must have USDC)
    const fromATA = await getAssociatedTokenAddress(USDC_MINT, fromPubkey)
    const fromAccount = await getAccount(connection, fromATA)
    if (BigInt(fromAccount.amount.toString()) < totalRaw) {
      throw new Error('Sender has insufficient Solana USDC for this payment')
    }
    // Ensure recipient ATA exists (relayer creates it if needed, covers rent)
    const toATA = await ensureATA(connection, tx, USDC_MINT, toPubkey, relayer.publicKey)

    // Transfer to recipient
    tx.add(createTransferCheckedInstruction(
      fromATA, USDC_MINT, toATA, fromPubkey, recipientRaw, USDC_DECIMALS,
    ))

    // Transfer fee to treasury. Fail closed when configured fees cannot be routed.
    const treasuryPubkey = getSolanaTreasury(feeRaw)
    if (treasuryPubkey) {
      const treasuryATA = await ensureATA(connection, tx, USDC_MINT, treasuryPubkey, relayer.publicKey)
      tx.add(createTransferCheckedInstruction(
        fromATA, USDC_MINT, treasuryATA, fromPubkey, feeRaw, USDC_DECIMALS,
      ))
    }

    // Relayer partial-signs as fee payer
    tx.partialSign(relayer)

    const serialised = tx.serialize({ requireAllSignatures: false })
    res.json({
      ok: true,
      tx: Buffer.from(serialised).toString('base64'),
      lastValidBlockHeight,
      feeAmount: (Number(feeRaw) / Math.pow(10, USDC_DECIMALS)).toFixed(USDC_DECIMALS),
    })
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message })
  }
}

// ── POST /api/solana-relay ────────────────────────────────────────────────────
export async function relaySolanaTx(req: Request, res: Response): Promise<void> {
  const { tx: txBase64 } = req.body as { tx?: string }

  if (!txBase64) { res.status(400).json({ ok: false, error: 'Missing tx' }); return }

  try { loadRelayer() }
  catch { res.status(503).json({ ok: false, error: 'Solana relay not configured' }); return }

  try {
    const connection = new Connection(getRpc(), 'confirmed')
    const txBytes    = decodeSignedTransaction(txBase64)
    const tx         = Transaction.from(txBytes)

    const txHash = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    })

    // Confirm with a 30s timeout
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
    await connection.confirmTransaction({ signature: txHash, blockhash, lastValidBlockHeight }, 'confirmed')

    res.json({ ok: true, txHash })
  } catch (err) {
    res.status(400).json({ ok: false, error: (err as Error).message })
  }
}

// ── GET /api/solana-vault ─────────────────────────────────────────────────────
export async function getSolanaVaultAddress(req: Request, res: Response): Promise<void> {
  const { linkId, recipient } = req.query as { linkId?: string; recipient?: string }
  if (!linkId || !recipient) { res.status(400).json({ ok: false, error: 'Missing linkId / recipient' }); return }
  try { parseSolanaAddress('Recipient address', recipient) }
  catch (err) { res.status(400).json({ ok: false, error: (err as Error).message }); return }

  // Return the vault WALLET address (public key), not the ATA.
  // Standard Solana UX: sender sends USDC to a wallet address and their
  // wallet auto-creates the ATA. The sweep reads the ATA derived from this key.
  const vaultKeypair = deriveVaultKeypair(linkId, recipient)
  res.json({ ok: true, vaultAddress: vaultKeypair.publicKey.toString() })
}

// ── POST /api/solana-sweep ────────────────────────────────────────────────────
export async function sweepSolanaVault(req: Request, res: Response): Promise<void> {
  const { linkId, recipient } = req.body as { linkId?: string; recipient?: string }
  if (!linkId || !recipient) { res.status(400).json({ ok: false, error: 'Missing linkId / recipient' }); return }

  let relayer: Keypair
  try { relayer = loadRelayer() }
  catch { res.status(503).json({ ok: false, error: 'Solana relay not configured' }); return }

  try {
    const connection   = new Connection(getRpc(), 'confirmed')
    const recipientPubkey = parseSolanaAddress('Recipient address', recipient)
    const vaultKeypair = deriveVaultKeypair(linkId, recipient)
    const vaultATA     = await getAssociatedTokenAddress(USDC_MINT, vaultKeypair.publicKey)

    // Check USDC balance at vault ATA
    let balanceRaw = 0n
    try {
      const acct = await getAccount(connection, vaultATA)
      balanceRaw = BigInt(acct.amount.toString())
    } catch {
      res.json({ ok: false, status: 'waiting' }); return
    }

    if (balanceRaw === 0n) { res.json({ ok: false, status: 'waiting' }); return }

    const feeRaw       = balanceRaw * BigInt(PLATFORM_FEE_BPS) / 10_000n
    const recipientRaw = balanceRaw - feeRaw

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
    const tx = new Transaction({ feePayer: relayer.publicKey, recentBlockhash: blockhash })

    const recipientATA = await ensureATA(connection, tx, USDC_MINT, recipientPubkey, relayer.publicKey)

    tx.add(createTransferCheckedInstruction(
      vaultATA, USDC_MINT, recipientATA, vaultKeypair.publicKey, recipientRaw, USDC_DECIMALS,
    ))

    const treasuryPubkey = getSolanaTreasury(feeRaw)
    if (treasuryPubkey) {
      const treasuryATA = await ensureATA(connection, tx, USDC_MINT, treasuryPubkey, relayer.publicKey)
      tx.add(createTransferCheckedInstruction(
        vaultATA, USDC_MINT, treasuryATA, vaultKeypair.publicKey, feeRaw, USDC_DECIMALS,
      ))
    }

    // Close the vault ATA after sweeping — returns the ~0.002 SOL rent back to
    // the relayer, keeping the relayer self-funded without manual top-ups.
    tx.add(createCloseAccountInstruction(
      vaultATA,                // account to close (now empty)
      relayer.publicKey,       // rent destination → relayer recoups SOL
      vaultKeypair.publicKey,  // authority
    ))

    tx.partialSign(relayer)
    tx.partialSign(vaultKeypair)

    const txHash = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight:        false,
      preflightCommitment:  'confirmed',
      maxRetries:           5,
    })
    await connection.confirmTransaction({ signature: txHash, blockhash, lastValidBlockHeight }, 'confirmed')

    res.json({ ok: true, status: 'swept', txHash, recipientAmount: recipientRaw.toString() })
  } catch (err) {
    const msg = (err as Error).message ?? 'Unknown sweep error'
    console.error('[solana-sweep] failed:', msg)
    res.status(500).json({ ok: false, error: msg })
  }
}
