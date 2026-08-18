import type { Request, Response } from 'express'
import {
  verifiedPrivyUser,
  type VerifiedLinkUser,
} from '../privy-circle-link.js'
import {
  isCirclePocketAgentRequest,
  type CirclePocketAgentResponse,
  type PocketErrorCode,
} from '../../src/pocket/lib/pocketSchemas.js'
import { routeCirclePocketQuestion } from './agent-router.js'
import { readHelperProfileMemory } from '../helper-profile.js'
import { readPocketPaycrestQuote } from './fx-quote.js'
import { readPocketBankPayoutLimit } from './spending-limits.js'
import { readPocketBillsLimitUsage } from './bills.js'

type PocketAgentLimitSummary = {
  bankPayout: { maxUsdc: number; ngnEquivalent: number }
  bills: {
    airtime: { perPaymentNgn: number; dailyLimitNgn: number; usedTodayNgn: number; remainingTodayNgn: number }
    otherBills: { dailyLimitNgn: number; usedTodayNgn: number; remainingTodayNgn: number }
  }
}

type PocketAgentAskDependencies = {
  verifyUser(req: Request): Promise<VerifiedLinkUser>
  readMemory?(user: VerifiedLinkUser): Promise<string>
  readRate?(): Promise<{ rate: number; stale?: boolean }>
  readLimits?(user: VerifiedLinkUser): Promise<PocketAgentLimitSummary>
}

const ngn = (value: number) => `₦${new Intl.NumberFormat('en-NG', { maximumFractionDigits: 2 }).format(value)}`
const usdc = (value: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)

async function liveAnswer(route: ReturnType<typeof routeCirclePocketQuestion>, user: VerifiedLinkUser, dependencies: PocketAgentAskDependencies) {
  if (!route) return ''
  if (route.capability === 'rates' && dependencies.readRate) {
    const quote = await dependencies.readRate().catch(() => undefined)
    if (quote && Number.isFinite(quote.rate) && quote.rate > 0) {
      return `The current direct rate is 1 USDC = ${ngn(quote.rate)}.${quote.stale ? ' This is the last confirmed rate; Pocket will request a fresh amount-specific quote before payment.' : ' Pocket requests an amount-specific quote again before payment.'}`
    }
  }
  if (route.capability === 'spending-limits' && dependencies.readLimits) {
    const limits = await dependencies.readLimits(user).catch(() => undefined)
    if (limits) {
      const airtime = limits.bills.airtime
      const other = limits.bills.otherBills
      return `Your current bank-payout capacity is ${usdc(limits.bankPayout.maxUsdc)} USDC (about ${ngn(limits.bankPayout.ngnEquivalent)}). Airtime is up to ${ngn(airtime.perPaymentNgn)} per payment and ${ngn(airtime.dailyLimitNgn)} daily; you have used ${ngn(airtime.usedTodayNgn)} today and have ${ngn(airtime.remainingTodayNgn)} remaining. Data, TV, and electricity share a ${ngn(other.dailyLimitNgn)} daily limit; you have used ${ngn(other.usedTodayNgn)} and have ${ngn(other.remainingTodayNgn)} remaining today.`
    }
  }
  return route.answer
}

export function createPocketAgentAskHandler(dependencies: PocketAgentAskDependencies) {
  return async function pocketAgentAskHandler(req: Request, res: Response) {
    function fail(status: number, code: PocketErrorCode, message: string, retryable: boolean) {
      return res.status(status).json({ ok: false, error: { code, message, retryable } })
    }

    if (req.method !== 'POST') return fail(405, 'VALIDATION_FAILED', 'Method not allowed.', false)
    if (!isCirclePocketAgentRequest(req.body)) {
      return fail(400, 'VALIDATION_FAILED', 'Circle Pocket assistant request was invalid.', false)
    }
    if (req.body.identityToken !== undefined) {
      return fail(400, 'VALIDATION_FAILED', 'Send the Circle Pocket session token in the Authorization header.', false)
    }
    if (req.body.draft !== undefined || req.body.confirmationId !== undefined) {
      return fail(400, 'VALIDATION_FAILED', 'Assistant mutations are not available on this read-only endpoint.', false)
    }

    try {
      const user = await dependencies.verifyUser(req)
      const memorySummary = dependencies.readMemory ? await dependencies.readMemory(user).catch(() => '') : ''
      const route = routeCirclePocketQuestion(req.body.message, 'circle-pocket', { memorySummary })
      if (!route) return fail(500, 'INTERNAL_ERROR', 'Circle Pocket routing failed.', true)

      const response: CirclePocketAgentResponse = {
        answer: await liveAnswer(route, user, dependencies),
        intent: route.supported
          ? `circle-pocket-${route.capability}`
          : 'circle-pocket-closest-assistance',
        actions: [{ id: route.capability, label: route.action.label, href: route.action.url, style: 'primary' }],
        proof: {
          source: route.source,
          capability: route.capability,
          supported: route.supported,
          confidence: route.confidence,
          readOnly: true,
          memoryAvailable: Boolean(memorySummary),
        },
      }
      return res.json(response)
    } catch (error) {
      const normalized = error as Error & { status?: number }
      if (normalized.status === 401) return fail(401, 'AUTH_REQUIRED', normalized.message, false)
      if (normalized.status === 403) return fail(403, 'FORBIDDEN', normalized.message, false)
      if (normalized.status === 429) return fail(429, 'RATE_LIMITED', normalized.message, true)
      if ((normalized.status ?? 0) >= 500) return fail(503, 'PROVIDER_UNAVAILABLE', 'Circle Pocket assistant is temporarily unavailable.', true)
      return fail(500, 'INTERNAL_ERROR', 'Circle Pocket assistant is temporarily unavailable.', true)
    }
  }
}

export default createPocketAgentAskHandler({
  verifyUser: verifiedPrivyUser,
  readMemory: user => readHelperProfileMemory({ kind: 'privy', storageKey: `privy:${user.userId}`, subject: user.userId }),
  readRate: () => readPocketPaycrestQuote('1'),
  readLimits: async user => {
    const [bankPayout, bills] = await Promise.all([
      readPocketBankPayoutLimit(),
      readPocketBillsLimitUsage(user.userId),
    ])
    return { bankPayout, bills }
  },
})
