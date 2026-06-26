/**
 * GET /api/agent-verify?eventId=X&payer=Alice
 *
 * Trustless payment verification for AI agents.
 *
 * Queries the PayLinkArchive contract on 0G Mainnet (Chain ID 16661) directly —
 * no Hash PayLink server state involved. Any agent, anywhere, can call this
 * endpoint and receive a cryptographically verifiable payment proof.
 *
 * Response (verified):
 *   { verified: true, payment: { payer, chain, amount, ts }, proof: { ogTxHash, ogExplorer, rootHash } }
 *
 * Response (not verified):
 *   { verified: false, error: "No verified payment found" }
 */

import type { Request, Response } from 'express'
import { ethers } from 'ethers'

// ─── 0G Mainnet config ────────────────────────────────────────────────────────
const OG_RPC       = (process.env.OG_RPC_URL ?? process.env.OG_EVM_RPC_URL ?? process.env.ZG_RPC_URL ?? 'https://evmrpc.0g.ai').trim()
const ARCHIVE_ADDR = '0x79a804C49e1E5EBC279A228Ab73a7570A0D0819a'
const FROM_BLOCK   = parseInt(process.env.OG_FROM_BLOCK ?? '32498000', 10)

const ARCHIVE_ABI = [
  'event PaymentArchived(string indexed eventId, bytes32 indexed rootHash, string chain, string payer, string amount, uint256 ts)',
]

const MAX_EVENT_ID_LENGTH = 128
const MAX_PAYER_LENGTH = 128
const VERIFY_TIMEOUT_MS = Math.max(5_000, parseInt(process.env.HELPER_VERIFY_TIMEOUT_MS ?? '15000', 10) || 15_000)

function normalizeBoundedString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string') throw new Error(`${field} must be a string`)
  const normalized = value.trim()
  if (!normalized) throw new Error(`${field} is required`)
  if (normalized.length > maxLength) throw new Error(`${field} is too long`)
  return normalized
}

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), VERIFY_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: Request, res: Response) {
  let eventId: string
  let payer: string

  try {
    eventId = normalizeBoundedString(req.query.eventId ?? req.body?.eventId, 'eventId', MAX_EVENT_ID_LENGTH)
    payer = normalizeBoundedString(req.query.payer ?? req.body?.payer, 'payer', MAX_PAYER_LENGTH)
  } catch (err) {
    return res.status(400).json({
      verified: false,
      error: err instanceof Error ? err.message : 'Invalid request',
    })
  }

  try {
    const provider = new ethers.JsonRpcProvider(OG_RPC)
    const contract = new ethers.Contract(ARCHIVE_ADDR, ARCHIVE_ABI, provider)
    const latest   = await withTimeout(provider.getBlockNumber(), '0G payment verification')

    // Query PaymentArchived events filtered by eventId (indexed — ethers handles keccak256)
    const events = await withTimeout(contract.queryFilter(
      contract.filters.PaymentArchived(eventId),
      FROM_BLOCK,
      latest,
    ), '0G payment proof lookup')

    // Match by payer name (case-insensitive, non-indexed so readable from log data)
    const match = events.find(
      e => 'args' in e && (e.args[3] as string).toLowerCase() === payer.toLowerCase(),
    )

    if (!match || !('args' in match)) {
      return res.status(402).json({
        verified: false,
        error:    'No verified payment found for this payer on 0G Storage',
        hint:     'Payment may still be archiving (~30–60s after confirmation)',
      })
    }

    return res.json({
      verified: true,
      payment: {
        eventId,
        payer:  match.args[3] as string,
        chain:  match.args[2] as string,
        amount: match.args[4] as string,
        ts:     Number(match.args[5]),
      },
      proof: {
        ogTxHash:   match.transactionHash,
        ogExplorer: `https://chainscan.0g.ai/tx/${match.transactionHash}`,
        rootHash:   match.args[1] as string,
        contract:   ARCHIVE_ADDR,
        network:    '0G Mainnet (Chain ID 16661)',
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[agent-verify]', msg)
    const timedOut = /timed out/i.test(msg)
    return res.status(timedOut ? 504 : 500).json({
      verified: false,
      error: timedOut ? 'Verification is still syncing. Try again shortly.' : 'Verification service unavailable',
    })
  }
}
