import type { Request, Response } from 'express'
import { appendAgentActivity, normalizeActivitySlug } from './agent-activity.js'
import { callZeroScoutIntelligence } from './zeroscout-intelligence.js'

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

export default async function zeroScoutPolymarketBriefHandler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ ok: false, error: 'Method not allowed' })
    return
  }

  try {
    const agentSlug = normalizeActivitySlug(req.body?.agentSlug)
    const scout = safeScout(req.body?.scout)
    const request = req.body?.request && typeof req.body.request === 'object' ? req.body.request as Record<string, unknown> : {}
    const payload = {
      partner: 'HashKey PayLink',
      productType: 'prediction-market',
      analysisType: 'lp-market-alpha',
      objective: 'Find useful LP intelligence signals from supplied Polymarket market, rewards, spread, and depth data.',
      outputStyle: 'operator-brief',
      data: {
        request: {
          mode: cleanText(request.mode, 'best'),
          context: cleanText(request.context),
          budget: cleanText(request.budget),
        },
        source: 'Hash PayLink LP Scout using Polymarket Gamma, CLOB rewards, and order book APIs.',
        scout,
        disclaimer: 'Educational LP research for human review only. Not financial advice and not an automated trading instruction.',
      },
      includeClaudeReview: req.body?.includeClaudeReview !== false,
      includeOpenAiReview: req.body?.includeOpenAiReview !== false,
    }
    const result = await callZeroScoutIntelligence(payload)

    if (agentSlug) {
      await appendAgentActivity({
        agentSlug,
        type: 'scout_returned',
        title: 'ZeroScout LP operator signal',
        direction: 'result',
        network: result.network || 'ZeroScout',
        detail: result.summary || 'ZeroScout generated a stored LP intelligence signal.',
        result: { zeroscout: result } as Record<string, unknown>,
      })
    }

    res.status(201).json({ ok: true, zeroscout: result })
  } catch (error) {
    const status = typeof (error as { status?: unknown }).status === 'number' ? (error as { status: number }).status : 500
    res.status(status).json({ ok: false, error: error instanceof Error ? error.message : 'ZeroScout operator signal failed' })
  }
}
