import type { Request, Response } from 'express'

type ProviderMatch = Record<string, unknown>

type ScoreMatch = {
  fixtureId?: string
  tag: string
  title: string
  time: string
  kickoffAt?: string
  venue: string
  status: string
  homeScore?: number | string
  awayScore?: number | string
  clock?: string
  homeCoach?: string
  awayCoach?: string
  probability?: string
  homeMarketPrice?: string
  awayMarketPrice?: string
  drawMarketPrice?: string
  polymarketTitle?: string
  polymarketLiquidity?: string
  polymarketVolume?: string
  polymarketTradeOptions?: PolymarketTradeOption[]
  goalScorers?: string[]
  weather?: string
  h2h?: string
  form?: string
  events?: string[]
  stats?: string[]
  marketStatus?: 'matched' | 'pending'
  marketContext: string
  sourceUrl: string
  polymarketUrl?: string
}

type PolymarketTradeOption = {
  label: string
  outcome: 'home' | 'draw' | 'away'
  tokenId: string
  price?: string
  conditionId?: string
  tickSize?: number
  minSize?: number
  negRisk?: boolean
}

type ScoreFeed = {
  ok: true
  providerConfigured: boolean
  source: string
  providerStatus: string
  selectedDate: string
  displayDate: string
  updatedAt: string
  matches: ScoreMatch[]
}

// Compatibility shape for historical content readers; never calls a sports provider.
export async function getPolyStreamFeed(selectedDate: string): Promise<ScoreFeed & { providerError?: string }> {
  return { ok: true, providerConfigured: false, source: 'retired', providerStatus: 'retired', selectedDate, displayDate: selectedDate, updatedAt: new Date().toISOString(), matches: [] }
}
export default function handler(_req: Request, res: Response) {
  return res.status(410).json({ ok: false, code: 'SPORTS_RETIRED', error: 'Sports feeds have been retired from Hash PayLink.' })
}
