/**
 * POST /api/agent-ask
 *
 * Payment-gated AI service endpoint — demonstrates the Hash PayLink agentic
 * economy primitive. Any AI service can use this pattern to require verified
 * payment before rendering a response.
 *
 * Body: { eventId: string, payer: string, question: string }
 *
 * Flow:
 *   1. Verify payment on 0G Mainnet via PayLinkArchive contract (trustless)
 *   2. If verified → return AI response + on-chain proof
 *   3. If not verified → 402 Payment Required + payment link
 *
 * The AI response uses ANTHROPIC_API_KEY if configured, otherwise returns a
 * structured demo response that still fully demonstrates the verification flow.
 */

import type { Request, Response } from 'express'
import { ethers }                  from 'ethers'
import Anthropic                   from '@anthropic-ai/sdk'

// ─── 0G Mainnet config ────────────────────────────────────────────────────────
const OG_RPC       = 'https://evmrpc.0g.ai'
const ARCHIVE_ADDR = '0x79a804C49e1E5EBC279A228Ab73a7570A0D0819a'
const FROM_BLOCK   = parseInt(process.env.OG_FROM_BLOCK ?? '32498000', 10)

const ARCHIVE_ABI = [
  'event PaymentArchived(string indexed eventId, bytes32 indexed rootHash, string chain, string payer, string amount, uint256 ts)',
]

const MAX_EVENT_ID_LENGTH = 128
const MAX_PAYER_LENGTH = 128
const MAX_QUESTION_LENGTH = 4_000

const CIRCLE_ARC_SYSTEM_PROMPT = [
  'You are the Hash PayLink Circle/Arc Strategy Agent.',
  'Access is only granted after a verified Hash PayLink payment archived on 0G.',
  '',
  'Your specialty:',
  '- Circle Developer Platform and USDC-native product strategy',
  '- Arc ecosystem product ideas and migration planning',
  '- agentic economic activity with stablecoin payments',
  '- Hash PayLink instant payments, StreamPay, paid AI access, and 0G verification',
  '- practical MVPs, grant positioning, technical architecture, and milestone design',
  '',
  'Response standards:',
  '- Give specific, high-signal recommendations, not generic startup advice.',
  '- Prefer concrete build plans, integration steps, and grant-ready positioning.',
  '- Distinguish clearly between what is already built, what is testnet, and what is a future milestone.',
  '- Be honest that Arc is testnet when relevant.',
  '- Do not claim official Circle, Arc, or 0G partnership, endorsement, grant approval, or guaranteed acceptance.',
  '- Do not provide financial, legal, tax, or compliance advice. For regulated questions, give product/technical framing and advise professional review.',
  '- Keep answers concise but valuable.',
].join('\n')

function normalizeBoundedString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string') throw new Error(`${field} must be a string`)
  const normalized = value.trim()
  if (!normalized) throw new Error(`${field} is required`)
  if (normalized.length > maxLength) throw new Error(`${field} is too long`)
  return normalized
}

// ─── Payment verification (same logic as agent-verify, kept local) ────────────

async function verifyPayment(eventId: string, payer: string) {
  const provider = new ethers.JsonRpcProvider(OG_RPC)
  const contract = new ethers.Contract(ARCHIVE_ADDR, ARCHIVE_ABI, provider)
  const latest   = await provider.getBlockNumber()

  const events = await contract.queryFilter(
    contract.filters.PaymentArchived(eventId),
    FROM_BLOCK,
    latest,
  )

  const match = events.find(
    e => 'args' in e && (e.args[3] as string).toLowerCase() === payer.toLowerCase(),
  )

  if (!match || !('args' in match)) return null

  return {
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
  }
}

// ─── AI response ──────────────────────────────────────────────────────────────

async function getAiResponse(question: string, payerName: string, chain: string, amount: string): Promise<string> {
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const client  = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      const message = await client.messages.create({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 900,
        system:     `${CIRCLE_ARC_SYSTEM_PROMPT}\n\nVerified access context: ${payerName} paid ${amount} on ${chain}, confirmed on 0G decentralized storage.`,
        messages:   [{ role: 'user', content: question }],
      })
      const block = message.content[0]
      if (block.type === 'text') {
        console.log('[agent-ask] Claude responded successfully')
        return block.text
      }
    } catch (err) {
      console.error('[agent-ask] Claude error:', err instanceof Error ? err.message : String(err))
    }
  } else {
    console.warn('[agent-ask] ANTHROPIC_API_KEY not set')
  }

  const fallbackLines = [
    `Access granted. Your payment of ${amount} on ${chain} has been verified on 0G decentralized storage.`,
    '',
    `You asked: "${question}"`,
    '',
    'Hash PayLink Circle/Arc Strategy Agent guidance:',
    '',
    'Build around agentic USDC commerce: instant PayLinks for one-time settlement, StreamPay on Arc for time-based budgets and retainers, and 0G proofs for verifiable AI access. A strong MVP should show a paid request, a verified 0G archive proof, and either an AI answer unlock or an Arc USDC stream for ongoing work. Frame Arc as the programmable USDC settlement environment and Circle as the stablecoin platform layer.',
  ]
  return fallbackLines.join('\n')
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' })

  const { eventId: rawEventId, payer: rawPayer, question: rawQuestion } = (req.body ?? {}) as Record<string, unknown>
  let eventId: string
  let payer: string
  let question: string

  try {
    eventId = normalizeBoundedString(rawEventId, 'eventId', MAX_EVENT_ID_LENGTH)
    payer = normalizeBoundedString(rawPayer, 'payer', MAX_PAYER_LENGTH)
    question = normalizeBoundedString(rawQuestion, 'question', MAX_QUESTION_LENGTH)
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid request' })
  }

  try {
    // 1. Verify payment on 0G Mainnet
    const result = await verifyPayment(eventId, payer)

    if (!result) {
      return res.status(402).json({
        error:           'Payment required',
        paymentRequired: true,
        message:         `No verified payment found for "${payer}" on event ${eventId}.`,
        hint:            'Payment may still be archiving to 0G (~30–60s after confirmation)',
        paymentLink:     `https://hashpaylink.com/pay?v=1&id=${encodeURIComponent(eventId)}`,
      })
    }

    // 2. Payment verified — get AI response
    const answer = await getAiResponse(
      question,
      result.payment.payer,
      result.payment.chain,
      result.payment.amount,
    )

    return res.json({
      answer,
      paymentVerified: true,
      payment:         result.payment,
      proof:           result.proof,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[agent-ask]', msg)
    return res.status(500).json({ error: 'Service temporarily unavailable' })
  }
}
