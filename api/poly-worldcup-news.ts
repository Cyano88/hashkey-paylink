import type { Request, Response } from 'express'
export type PolyWorldCupArticle = {
  title: string
  description: string
  source: string
  image: string
  url: string
  publishedAt: string
  tag: string
}

export function polyWorldcupArticleId(article: Pick<PolyWorldCupArticle, 'title' | 'url'>, index = 0) {
  const input = `${article.title}|${article.url}|${index}`.toLowerCase()
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  const slug = article.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42) || 'headline'
  return `worldcup-news-${slug}-${(hash >>> 0).toString(36)}`
}
// Preserve historical IDs without generating or charging for new sports content.
export async function getPolyWorldcupNewsFeed() {
  return { ok: true as const, providerConfigured: false, source: 'retired', updatedAt: new Date().toISOString(), articles: [] as PolyWorldCupArticle[] }
}
export default function handler(_req: Request, res: Response) {
  return res.status(410).json({ ok: false, code: 'SPORTS_RETIRED', error: 'Sports feeds have been retired from Hash PayLink.' })
}
