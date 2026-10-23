export function isRetiredSportsContent(id: unknown, category?: unknown, kind?: unknown): boolean {
  return /^worldcup-(?:scores?|news)(?:-|$)/i.test(String(id ?? '').trim())
    || ['live-scores', 'worldcup-news', 'sports', 'news'].includes(String(category ?? '').trim().toLowerCase())
    || String(kind ?? '').trim().toLowerCase() === 'scores'
}
export const RETIRED_SPORTS_MESSAGE = 'Sports content is no longer available on Hash PayLink.'
