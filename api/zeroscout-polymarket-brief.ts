import type { Request, Response } from 'express'
import { appendAgentActivity, findAgentActivity, listAgentActivity, normalizeActivitySlug, type AgentActivity } from './agent-activity.js'
import { callZeroScoutIntelligence } from './zeroscout-intelligence.js'

const POLYMARKET_SCOUT_PATH = '/api/x402/polymarket-scout'

function cleanText(value: unknown, fallback = '') {
  const text = typeof value === 'string' ? value.trim() : ''
  return text ? text.slice(0, 1200) : fallback
}

function safeScout(value: unknown) {
  if (!value || typeof value !== 'object') return {}
  const scout = value as Record<string, unknown>
  const opportunities = Array.isArray(scout.opportunities)
    ? scout.opportunities.slice(0, 3).map(item => sanitizeOpportunity(item))
    : []
  return {
    summary: cleanText(scout.summary),
    signals: Array.isArray(scout.signals) ? scout.signals.slice(0, 6).map(item => cleanText(item)).filter(Boolean) : [],
    highlights: Array.isArray(scout.highlights) ? scout.highlights.slice(0, 6).map(item => cleanText(item)).filter(Boolean) : [],
    opportunities,
    nextAction: cleanText(scout.nextAction),
    source: cleanText(scout.source),
    disclaimer: cleanText(scout.disclaimer, 'Educational LP research for human review only. Not financial advice and not an automated trading instruction.'),
  }
}

function sanitizeOpportunity(value: unknown) {
  if (!value || typeof value !== 'object') return {}
  const item = value as Record<string, unknown>
  return {
    title: cleanText(item.title),
    marketUrl: cleanText(item.marketUrl),
    daysToResolve: finiteNumber(item.daysToResolve),
    dailyReward: finiteNumber(item.dailyReward),
    maxSpread: finiteNumber(item.maxSpread),
    minSize: finiteNumber(item.minSize),
    liquidity: finiteNumber(item.liquidity),
    bestBid: finiteNumber(item.bestBid),
    bestAsk: finiteNumber(item.bestAsk),
    liveSpread: finiteNumber(item.liveSpread),
    bidDepth: finiteNumber(item.bidDepth),
    askDepth: finiteNumber(item.askDepth),
    depthAtTwoCents: finiteNumber(item.depthAtTwoCents),
    suggestedYesBid: finiteNumber(item.suggestedYesBid),
    suggestedNoBid: finiteNumber(item.suggestedNoBid),
    eligible: typeof item.eligible === 'boolean' ? item.eligible : undefined,
    lpExecutionRisk: cleanText(item.lpExecutionRisk),
    outcomeRisk: cleanText(item.outcomeRisk),
    score: finiteNumber(item.score),
    scoutReason: cleanText(item.scoutReason),
    executionPlan: Array.isArray(item.executionPlan) ? item.executionPlan.slice(0, 6).map(step => cleanText(step)).filter(Boolean) : [],
  }
}

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function getScoutPath(serviceUrl: string | undefined) {
  if (!serviceUrl) return ''
  try {
    return new URL(serviceUrl).pathname
  } catch {
    return serviceUrl.split('?')[0]
  }
}

function requestFromServiceUrl(serviceUrl: string | undefined) {
  if (!serviceUrl) return {}
  try {
    const url = new URL(serviceUrl)
    return {
      mode: cleanText(url.searchParams.get('scoutMode'), 'best'),
      context: cleanText(url.searchParams.get('context')),
      budget: cleanText(url.searchParams.get('budget')),
    }
  } catch {
    return { mode: 'best', context: '', budget: '' }
  }
}

function isStoredPolymarketScoutActivity(activity: AgentActivity | undefined) {
  return Boolean(
    activity
    && activity.type === 'scout_returned'
    && !activity.result?.zeroscout
    && getScoutPath(activity.serviceUrl) === POLYMARKET_SCOUT_PATH
    && activity.result
    && typeof activity.result === 'object',
  )
}

function findMatchingPaidScoutProof(activity: AgentActivity, items: AgentActivity[]) {
  const serviceUrl = String(activity.serviceUrl ?? '')
  return items.find(item => (
    item.type === 'x402_spent'
    && item.proof?.proofHash
    && getScoutPath(item.serviceUrl) === POLYMARKET_SCOUT_PATH
    && String(item.serviceUrl ?? '') === serviceUrl
    && item.createdAt <= activity.createdAt
    && activity.createdAt - item.createdAt < 15 * 60 * 1000
  ))
}

export default async function zeroScoutPolymarketBriefHandler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ ok: false, error: 'Method not allowed' })
    return
  }

  try {
    const agentSlug = normalizeActivitySlug(req.body?.agentSlug)
    const activityId = String(req.body?.activityId ?? '').trim()
    if (!agentSlug || !activityId) {
      res.status(400).json({ ok: false, error: 'Run a paid LP Scout first, then generate a ZeroScout operator signal from that saved result.' })
      return
    }

    const scoutActivity = await findAgentActivity(activityId)
    if (!isStoredPolymarketScoutActivity(scoutActivity) || scoutActivity?.agentSlug !== agentSlug) {
      res.status(403).json({ ok: false, error: 'ZeroScout can only review a saved Polymarket LP Scout result from this agent.' })
      return
    }

    const activity = await listAgentActivity(agentSlug, 80)
    const paidScout = findMatchingPaidScoutProof(scoutActivity, activity)
    if (!paidScout?.proof?.proofHash) {
      res.status(403).json({ ok: false, error: 'No matching x402 payment proof was found for this LP Scout result.' })
      return
    }

    const existing = activity.find(item => (
      item.type === 'scout_returned'
      && item.result?.zeroscout
      && item.result?.sourceActivityId === scoutActivity.id
    ))
    if (existing?.result?.zeroscout) {
      res.status(200).json({ ok: true, zeroscout: existing.result.zeroscout })
      return
    }

    const scout = safeScout(scoutActivity.result)
    const request = requestFromServiceUrl(scoutActivity.serviceUrl)
    const payload = {
      partner: 'HashKey PayLink',
      productType: 'prediction-market',
      analysisType: 'lp-market-intelligence',
      objective: 'Find useful LP intelligence signals from supplied Polymarket market, rewards, spread, and depth data.',
      outputStyle: 'operator-brief',
      data: {
        request: {
          mode: request.mode,
          context: request.context,
          budget: request.budget,
        },
        source: 'Hash PayLink LP Scout using Polymarket Gamma, CLOB rewards, and order book APIs.',
        scout,
        x402ProofHash: paidScout.proof.proofHash,
        disclaimer: 'Educational LP research for human review only. Not financial advice and not an automated trading instruction.',
      },
      includeClaudeReview: req.body?.includeClaudeReview !== false,
      includeOpenAiReview: req.body?.includeOpenAiReview !== false,
    }
    const result = await callZeroScoutIntelligence(payload, { requireProof: true })

    await appendAgentActivity({
      agentSlug,
      type: 'scout_returned',
      title: 'ZeroScout LP operator signal',
      direction: 'result',
      network: result.network || 'ZeroScout',
      serviceUrl: scoutActivity.serviceUrl,
      detail: result.summary || 'ZeroScout generated a stored LP intelligence signal.',
      result: {
        sourceActivityId: scoutActivity.id,
        x402ProofHash: paidScout.proof.proofHash,
        zeroscout: result,
      } as Record<string, unknown>,
    })

    res.status(201).json({ ok: true, zeroscout: result })
  } catch (error) {
    const status = typeof (error as { status?: unknown }).status === 'number' ? (error as { status: number }).status : 500
    res.status(status).json({ ok: false, error: error instanceof Error ? error.message : 'ZeroScout operator signal failed' })
  }
}
