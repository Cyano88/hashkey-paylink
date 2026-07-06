/**
 * POST /api/agent-ask
 *
 * Payment-gated AI service endpoint — demonstrates the Hash PayLink agentic
 * economy primitive. Any AI service can use this pattern to require verified
 * payment before rendering a response.
 *
 * Body: { eventId?: string, payer: string, question: string, accessMode?: 'helper-free', helperMode?: string }
 *
 * Flow:
 *   1. Verify payment on 0G Mainnet via PayLinkArchive contract (trustless)
 *   2. If verified → return AI response + on-chain proof
 *   3. If not verified → 402 Payment Required + payment link
 *
 * Ask Hash gets model intelligence through ZeroScout guidance and only returns
 * after final ZeroScout sponsorship succeeds.
 */

import type { Request, Response } from 'express'
import { ethers }                  from 'ethers'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import crypto from 'node:crypto'
import {
  getZeroScoutHelperGuidance,
  sponsorZeroScoutAction,
  type ZeroScoutHelperGuidance,
  type ZeroScoutSponsoredAction,
} from './zeroscout-sponsored-action.js'
import { readDurableJson, writeDurableJson } from './render-durable-store.js'
import { buildHashpayStreamAgentContext } from '../modules/streampay/api/content.js'

// ─── 0G Mainnet config ────────────────────────────────────────────────────────
const OG_RPC       = (process.env.OG_RPC_URL ?? process.env.OG_EVM_RPC_URL ?? process.env.ZG_RPC_URL ?? 'https://evmrpc.0g.ai').trim()
const ARCHIVE_ADDR = '0x79a804C49e1E5EBC279A228Ab73a7570A0D0819a'
const FROM_BLOCK   = parseInt(process.env.OG_FROM_BLOCK ?? '32498000', 10)

const ARCHIVE_ABI = [
  'event PaymentArchived(string indexed eventId, bytes32 indexed rootHash, string chain, string payer, string amount, uint256 ts)',
]

const MAX_EVENT_ID_LENGTH = 128
const MAX_PAYER_LENGTH = 128
const MAX_QUESTION_LENGTH = 4_000
const MAX_MEMORY_LENGTH = 2_600
const HELPER_FREE_ACCESS_MODE = 'helper-free'
const HELPER_MODES = new Set(['payments', 'daily', 'services', 'polydesk', 'support', 'streampay'])
const HELPER_SIMPLE_DAILY_PROMPT_LIMIT = Math.max(1, parseInt(process.env.HELPER_SIMPLE_DAILY_PROMPT_LIMIT ?? process.env.HELPER_DAILY_PROMPT_LIMIT ?? '100', 10) || 100)
const HELPER_DEEP_DAILY_PROMPT_LIMIT = Math.max(1, parseInt(process.env.HELPER_DEEP_DAILY_PROMPT_LIMIT ?? '2', 10) || 2)
const HELPER_USAGE_WINDOW_MS = 24 * 60 * 60 * 1000
const HELPER_USAGE_STORE = process.env.HELPER_USAGE_STORE
  ?? (process.env.DATA_PATH ? `${process.env.DATA_PATH}/helper-usage.json` : './data/helper-usage.json')
const HELPER_VERIFY_TIMEOUT_MS = Math.max(5_000, parseInt(process.env.HELPER_VERIFY_TIMEOUT_MS ?? '15000', 10) || 15_000)
const AGENT_HASH_PRO_TREASURY = (process.env.AGENT_HASH_PRO_TREASURY ?? process.env.TREASURY_ADDRESS ?? '0xcE5dF9e1115F81a2Fc2F65941B20B820d508e753').trim()
const HELPER_USAGE_STORE_KEY = (process.env.HELPER_USAGE_STORE_KEY ?? 'hashpaylink:helper-usage').trim()
const GENERIC_STRATEGY_PHRASE = 'Build around agentic USDC commerce'
const GENERIC_STRATEGY_PATTERNS = [
  /Hash PayLink Strategy Agent guidance/i,
  /Build around agentic USDC commerce/i,
  /strong MVP should show/i,
  /Frame Arc as/i,
  /Circle as the stablecoin platform layer/i,
  /Polymarket as a high-signal consumer workflow/i,
  /This is product strategy/i,
]

type UsageRecord = {
  count: number
  resetAt: number
}

type UsageStore = {
  usage: Record<string, UsageRecord>
}

function normalizeBoundedString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string') throw new Error(`${field} must be a string`)
  const normalized = value.trim()
  if (!normalized) throw new Error(`${field} is required`)
  if (normalized.length > maxLength) throw new Error(`${field} is too long`)
  return normalized
}

async function readUsageStore(): Promise<UsageStore> {
  try {
    const remote = await readDurableJson<Partial<UsageStore>>(HELPER_USAGE_STORE_KEY)
    if (remote) return { usage: remote.usage ?? {} }
  } catch (err) {
    console.warn('[agent-ask] durable usage load failed; using file fallback.', err instanceof Error ? err.message : String(err))
  }

  try {
    return JSON.parse(await readFile(HELPER_USAGE_STORE, 'utf8')) as UsageStore
  } catch {
    return { usage: {} }
  }
}

async function writeUsageStore(store: UsageStore) {
  await mkdir(dirname(HELPER_USAGE_STORE), { recursive: true })
  await writeFile(HELPER_USAGE_STORE, JSON.stringify(store, null, 2), 'utf8')
  try {
    await writeDurableJson(HELPER_USAGE_STORE_KEY, store)
  } catch (err) {
    console.warn('[agent-ask] durable usage save failed; file fallback saved.', err instanceof Error ? err.message : String(err))
  }
}

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), HELPER_VERIFY_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

type HelperUsageTier = 'simple' | 'deep'

function helperLimitForTier(tier: HelperUsageTier) {
  return tier === 'deep' ? HELPER_DEEP_DAILY_PROMPT_LIMIT : HELPER_SIMPLE_DAILY_PROMPT_LIMIT
}

function usageKey(eventId: string, payer: string, tier: HelperUsageTier) {
  return crypto.createHash('sha256').update(`${tier}:${eventId.toLowerCase()}:${payer.toLowerCase()}`).digest('hex')
}

function agentHashProPaymentLink(payer: string) {
  const params = new URLSearchParams({
    e: AGENT_HASH_PRO_TREASURY,
    a: '10',
    m: 'Agent Hash Pro monthly subscription',
    v: '1',
    id: `agent-hash-pro-${crypto.createHash('sha256').update(payer.toLowerCase()).digest('hex').slice(0, 16)}`,
  })
  return `https://hashpaylink.com/pay?${params.toString()}`
}

function compactContentCard(card: Record<string, unknown>) {
  const social = (card.social && typeof card.social === 'object' ? card.social : {}) as Record<string, unknown>
  const insights = (card.insights && typeof card.insights === 'object' ? card.insights : {}) as Record<string, unknown>
  return {
    id: card.contentId ?? card.id,
    title: card.title,
    description: card.description,
    category: card.category,
    author: card.authorName,
    priceUsdc: card.priceUsdc,
    mode: card.mode,
    type: card.type,
    gateLink: card.gateLink,
    createdAt: card.createdAt,
    summary: insights.summary,
    explainPrompt: insights.explainPrompt,
    suggestedQuestions: insights.suggestedQuestions,
    views: social.views,
    likes: social.likes,
    comments: social.comments,
    unlocks: social.unlocks,
  }
}

function extractCreatorFromMemory(memorySummary: string) {
  const match = /[?&]cr=(0x[a-fA-F0-9]{40})\b/i.exec(memorySummary)
    || /\bcreator(?: wallet)?:?\s*(0x[a-fA-F0-9]{40})\b/i.exec(memorySummary)
  return match?.[1] ?? ''
}

function extractActiveContentIdFromMemory(memorySummary: string) {
  const match = /Active content ID:\s*([a-zA-Z0-9_-]{1,128})/i.exec(memorySummary)
    || /[?&]id=([a-zA-Z0-9_-]{1,128})\b/i.exec(memorySummary)
    || /"contentId"\s*:\s*"([^"]{1,128})"/i.exec(memorySummary)
  return match?.[1] ?? ''
}

function extractActiveContentTitleFromMemory(memorySummary: string) {
  const match = /"([^"]{4,180}?(?:Digital Art|HashWatch|video|tutorial|guide)[^"]{0,180})"/i.exec(memorySummary)
    || /unlocked\s+'([^']{4,180})'/i.exec(memorySummary)
    || /unlocked\s+"([^"]{4,180})"/i.exec(memorySummary)
    || /video\s+([^.\n]{4,180}?(?:Digital Art|tutorial|guide)[^.\n]{0,80})/i.exec(memorySummary)
  return match?.[1]?.replace(/\s+/g, ' ').trim() ?? ''
}

function extractReaderWalletFromMemory(memorySummary: string) {
  const match = /"walletAddress"\s*:\s*"(0x[a-fA-F0-9]{40})"/i.exec(memorySummary)
    || /reader wallet:?\s*(0x[a-fA-F0-9]{40})/i.exec(memorySummary)
    || /walletAddress[=:]\s*(0x[a-fA-F0-9]{40})/i.exec(memorySummary)
  return match?.[1] ?? ''
}

function compactHashpayStreamContext(context: unknown) {
  const data = context && typeof context === 'object' ? context as Record<string, unknown> : {}
  const discovery = data.discovery && typeof data.discovery === 'object' ? data.discovery as Record<string, unknown> : {}
  const takeCards = (key: string, limit: number) => Array.isArray(discovery[key])
    ? (discovery[key] as Array<Record<string, unknown>>).slice(0, limit).map(compactContentCard)
    : []
  return {
    product: data.product,
    updatedAt: data.updatedAt,
    x402: data.x402,
    unlockModes: data.unlockModes,
    statsCapabilities: data.statsCapabilities,
    categoryCounts: discovery.categoryCounts,
    trending: takeCards('trending', 8),
    topViewed: takeCards('topViewed', 5),
    mostLiked: takeCards('mostLiked', 5),
    mostDiscussed: takeCards('mostDiscussed', 5),
    mostUnlocked: takeCards('mostUnlocked', 5),
    latestPosts: takeCards('latestPosts', 8),
    hashWatch: takeCards('hashWatch', 12),
    latestHashWatch: takeCards('latestHashWatch', 6),
    bestEbooks: takeCards('bestEbooks', 12),
    latestBooks: takeCards('latestBooks', 6),
    latestByType: data.latestByType,
    assistantPlaybook: data.assistantPlaybook,
    activeContent: data.activeContent,
    latestWorldCupNews: takeCards('latestWorldCupNews', 5),
    liveScores: takeCards('liveScores', 8),
    creatorEarnings: data.creatorEarnings,
  }
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizedHashpayStreamMediaUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^(youtu\.be|youtube\.com|www\.youtube\.com|m\.youtube\.com)\//i.test(trimmed)) return `https://${trimmed}`
  return trimmed
}

function clientHashpayStreamHint(rawContext: unknown) {
  const context = recordValue(rawContext)
  const activeContent = recordValue(context.activeContent)
  const activeMetadata = recordValue(activeContent.metadata)
  const activeHint = recordValue(context.activeContentHint)
  return {
    creator: stringValue(context.creator)
      || stringValue(activeMetadata.creator)
      || stringValue(activeHint.creator),
    wallet: stringValue(context.wallet)
      || stringValue(context.readerWallet)
      || stringValue(activeHint.walletAddress),
    contentId: stringValue(activeContent.contentId)
      || stringValue(activeHint.contentId)
      || stringValue(activeHint.accessHintContentId),
    contentTitle: stringValue(activeMetadata.title)
      || stringValue(activeHint.title),
  }
}

function firstCard(value: unknown): Record<string, unknown> {
  return Array.isArray(value) && value[0] && typeof value[0] === 'object' ? value[0] as Record<string, unknown> : {}
}

function firstAvailableCard(...values: unknown[]) {
  for (const value of values) {
    const card = firstCard(value)
    if (Object.keys(card).length) return card
  }
  return {}
}

function cardList(...values: unknown[]) {
  return values.flatMap(value => Array.isArray(value) ? value : [])
    .filter((card): card is Record<string, unknown> => Boolean(card && typeof card === 'object'))
}

function normalizedWords(value: string) {
  return new Set(value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter(word => word.length > 2))
}

function scoreCardForQuestion(card: Record<string, unknown>, question: string) {
  const questionWords = normalizedWords(question)
  if (!questionWords.size) return 0
  const haystack = [
    stringValue(card.title),
    stringValue(card.description),
    stringValue(card.summary),
    stringValue(card.author),
    stringValue(card.category),
    stringValue(card.type),
  ].join(' ').toLowerCase()
  if (/\bdigital\s+art\b/i.test(question) && !/\bdigital\s+art\b/i.test(haystack)) return 0
  let score = 0
  for (const word of questionWords) {
    if (haystack.includes(word)) score += word.length > 4 ? 2 : 1
  }
  if (/\bdigital\s+art\b/i.test(question) && /\bdigital\s+art\b/i.test(haystack)) score += 8
  if (/\bhash\s*watch|hashwatch|video\b/i.test(question) && /\bvideo|hashwatch\b/i.test(haystack)) score += 3
  if (/\bcreate|creation|tutorial|guide\b/i.test(question) && /\bcreate|creation|tutorial|guide\b/i.test(haystack)) score += 3
  return score
}

function findContentCardForQuestion(question: string, context: Record<string, unknown>) {
  const cards = cardList(context.latestHashWatch, context.hashWatch, context.latestPosts, context.trending, context.topViewed, context.mostUnlocked)
  return cards
    .map(card => ({ card, score: scoreCardForQuestion(card, question) }))
    .filter(item => item.score >= 4)
    .sort((a, b) => b.score - a.score)[0]?.card ?? {}
}

function cardLine(card: Record<string, unknown>) {
  const title = stringValue(card.title) || 'Untitled content'
  const summary = stringValue(card.summary) || stringValue(card.description)
  const price = typeof card.priceUsdc === 'number' ? ` Price: ${card.priceUsdc} USDC.` : ''
  const gateLink = stringValue(card.gateLink)
  return `${title}${summary ? `: ${summary}` : ''}.${price}${gateLink ? ` Open: ${gateLink}` : ''}`.replace(/\.\./g, '.')
}

function explainCard(card: Record<string, unknown>) {
  const title = stringValue(card.title) || 'this HashpayStream content'
  const summary = stringValue(card.summary) || stringValue(card.description)
  const author = stringValue(card.author)
  const gateLink = stringValue(card.gateLink)
  const accessNote = 'If your unlock receipt/session is verified, Agent Hash should not ask you to unlock it again. If the private video itself is not available to this chat, I can still explain the verified title, creator, description, and access context.'
  return [
    `"${title}" is a HashWatch video${author ? ` by ${author}` : ''}.`,
    summary ? `Context: ${summary}` : '',
    'It is positioned as creator education: a practical video for learning or onboarding around the topic, with HashpayStream handling paid access and watch-based monetization.',
    accessNote,
    gateLink ? `Gate: ${gateLink}` : '',
  ].filter(Boolean).join(' ')
}

function visibleHashpayStreamMemoryAnswer(question: string, memorySummary: string) {
  if (!/\b(explain|context|about|summar|unlocked|video|hash\s*watch|hashwatch|digital\s+art)\b/i.test(question)) return ''
  if (!/\bdigital\s+art\b/i.test(question) || !/\bdigital\s+art\b/i.test(memorySummary)) return ''
  const digitalArtIndex = memorySummary.toLowerCase().indexOf('digital art')
  const snippet = digitalArtIndex >= 0
    ? memorySummary.slice(Math.max(0, digitalArtIndex - 260), Math.min(memorySummary.length, digitalArtIndex + 520)).replace(/\s+/g, ' ').trim()
    : ''
  return [
    'The Digital Art HashWatch video is presented as a creator tutorial for onboarding someone into 3D animated digital art creation.',
    snippet ? `Visible HashpayStream context: ${snippet}` : '',
    'From the public metadata, its value is practical education: it helps a viewer understand the creation workflow while HashpayStream handles paid access, receipts, and watch-based release checkpoints.',
    'If your unlock receipt/session is verified, Agent Hash should not ask you to unlock it again. Full private video analysis still depends on the unlocked session or ZeroScout media inspection being available.',
  ].filter(Boolean).join(' ')
}

function isHashpayStreamLinkRequest(question: string) {
  return /\b(link|url|watch|open|play|view)\b/i.test(question)
    && /\b(video|content|it|that|this|hash\s*watch|hashwatch)\b/i.test(question)
}

function isZeroScoutVideoInspectionRequest(question: string) {
  const asksNamedCompute = /\b(zeroscout|zero\s*scout|0g|og compute|compute)\b/i.test(question)
    && (
      /\b(inspect|analy[sz]e|analysis|scan|break\s*down|watch|read|review|use|run|send|forward|foward|route)\b/i.test(question)
      || question.trim().split(/\s+/).length <= 5
    )
    && (
      /\b(url|link|video|media|content|it|this|that|analysis|tutorial|guide)\b/i.test(question)
      || question.trim().split(/\s+/).length <= 5
    )
  const asksForDeepVideoAnalysis = /\b(deep|deeper|detailed|frame[-\s]*by[-\s]*frame|break\s*down|inspect|analy[sz]e|analysis|scan|review)\b/i.test(question)
    && /\b(video|media|content|it|this|that|tutorial|guide|analysis)\b/i.test(question)
  return asksNamedCompute || asksForDeepVideoAnalysis
}

function isHashWatchVideoBreakdownRequest(question: string, activeTitle = '') {
  const combined = `${question} ${activeTitle}`.toLowerCase()
  const mentionsVideo = /\b(hash\s*watch|hashwatch|video|watch|tutorial|guide|digital\s+art|url|link)\b/i.test(combined)
  const wantsBreakdown = /\b(explain|context|summar[yi]ze|summary|break\s*down|breakdown|analysis|analy[sz]e|detailed|inspect|scan|review|frame[-\s]*by[-\s]*frame|what\s+is\s+it\s+about|what\s+this\s+is\s+about)\b/i.test(question)
  return mentionsVideo && wantsBreakdown
}

function explainUnlockedHashpayStreamContent(title: string, summary: string, unlockedSummary: string) {
  const suppliedContext = unlockedSummary && unlockedSummary !== summary ? unlockedSummary : summary
  if (!suppliedContext) {
    return `This unlocked content is "${title}". I can explain the verified metadata I have here, and I can give a deeper breakdown if ZeroScout/0G compute inspects the media URL.`
  }
  return [
    `In plain context, "${title}" is a creator tutorial about ${suppliedContext.charAt(0).toLowerCase()}${suppliedContext.slice(1)}.`,
    'It is positioned as an onboarding guide, so the expected value is helping a beginner understand the basic workflow, tools, and steps needed to start creating 3D animated digital art.',
    'I can explain from the verified unlock context without charging again; deeper frame-by-frame analysis needs ZeroScout/0G compute to inspect the actual media URL.',
  ].join(' ')
}

function hashpayStreamContextAnswer(question: string, hashpayStreamContext?: unknown, memorySummary = '') {
  const context = recordValue(hashpayStreamContext)
  if (!Object.keys(context).length) return ''
  const value = question.toLowerCase()
  const activeContent = recordValue(context.activeContent)
  const activeMetadata = recordValue(activeContent.metadata)
  const activeTitle = stringValue(activeMetadata.title) || 'this content'
  const activeSummary = stringValue(activeMetadata.summary)
    || stringValue(activeMetadata.description)
    || stringValue(activeContent.preview)
  const activeStatus = stringValue(activeContent.status)
  const unlockedContent = recordValue(activeContent.unlockedContent)
  const unlockedSummary = stringValue(unlockedContent.summary)
  const unlockedUrl = normalizedHashpayStreamMediaUrl(stringValue(unlockedContent.videoUrl) || stringValue(unlockedContent.privateUrl))
  const activeGateLink = stringValue(activeMetadata.gateLink)
  const wantsCurrentContent = Boolean(activeStatus) && /\b(this|recent|recently|unlocked|video|book|post|context|about|summar|explain)\b/i.test(question)
  const wantsVideoInspection = isZeroScoutVideoInspectionRequest(question) || (activeStatus === 'unlocked' && Boolean(unlockedUrl) && isHashWatchVideoBreakdownRequest(question, activeTitle))

  if (Boolean(activeStatus) && wantsVideoInspection) {
    if (activeStatus === 'unlocked' && unlockedUrl) {
      return `Your unlock is verified for "${activeTitle}". I tried to route the unlocked video URL to ZeroScout/0G compute, but the compute layer did not return a usable analysis in this request. Media URL attempted: ${unlockedUrl}`
    }
    return activeStatus === 'unlocked'
      ? `Your unlock is verified for "${activeTitle}", but I do not have a direct video URL in this chat context to forward to ZeroScout/0G compute.`
      : `I cannot forward a private video URL to ZeroScout/0G compute until the original reader wallet/session is verified as unlocked.`
  }

  if (Boolean(activeStatus) && isHashpayStreamLinkRequest(question)) {
    if (activeStatus === 'unlocked' && unlockedUrl) {
      return `You do not need to unlock it again. Here is the unlocked video link for "${activeTitle}": ${unlockedUrl}`
    }
    if (activeGateLink) {
      return activeStatus === 'unlocked'
        ? `Your unlock is verified, but I do not have a direct media URL in this chat context. Open the HashpayStream watch page here: ${activeGateLink}`
        : `I can share the public gate link for "${activeTitle}". Reopen it with the original unlocked wallet/session to watch without paying again: ${activeGateLink}`
    }
  }

  if (wantsCurrentContent && activeStatus === 'unlocked') {
    const mediaNote = stringValue(unlockedContent.note)
    return [
      `You do not need to unlock it again. I found a verified unlock/session for "${activeTitle}".`,
      explainUnlockedHashpayStreamContent(activeTitle, activeSummary, unlockedSummary),
      mediaNote && !/do not claim|frame-level|supplied metadata/i.test(mediaNote) ? `Note: ${mediaNote}` : '',
    ].filter(Boolean).join(' ')
  }

  if (wantsCurrentContent && activeStatus === 'locked') {
    return [
      `I can see "${activeTitle}", but this chat is not currently tied to the wallet/session that unlocked it.`,
      activeSummary ? `Public preview: ${activeSummary}` : '',
      'For the full private summary, reopen Agent Hash from the same unlocked gate/session or reconnect the original reader wallet. I will not ask for a second unlock if that receipt/session is verified.',
    ].filter(Boolean).join(' ')
  }

  if (/\b(explain|context|about|summar|unlocked|video|hash\s*watch|hashwatch|digital\s+art)\b/i.test(question)) {
    const matchedCard = findContentCardForQuestion(question, context)
    if (Object.keys(matchedCard).length) return explainCard(matchedCard)
    const visibleAnswer = visibleHashpayStreamMemoryAnswer(question, memorySummary)
    if (visibleAnswer) return visibleAnswer
  }

  if (/\b(latest|newest|recent)\b.*\b(hashwatch|video)\b|\bhashwatch\b.*\b(latest|newest|recent)\b/i.test(value)) {
    const card = firstAvailableCard(context.latestHashWatch, context.hashWatch)
    return Object.keys(card).length ? `Latest HashWatch: ${cardLine(card)}` : 'I do not have a verified HashWatch video in the current HashpayStream context.'
  }

  if (/\b(latest|newest|recent)\b.*\b(book|ebook)\b|\b(book|ebook)\b.*\b(latest|newest|recent)\b/i.test(value)) {
    const card = firstAvailableCard(context.latestBooks, context.bestEbooks)
    return Object.keys(card).length ? `Latest book: ${cardLine(card)}` : 'I do not have a verified book in the current HashpayStream context.'
  }

  if (/\b(earning|earned|revenue|claim|released)\b/i.test(value)) {
    const earnings = recordValue(context.creatorEarnings)
    if (Object.keys(earnings).length) return `Creator earnings are available in the verified HashpayStream context. Open the earnings card for the exact fixed, reading/checkpoint, total, and claim state.`
    return 'I need the creator wallet context to read verified HashpayStream earnings. Open Creator Hub earnings or use Agent Hash from that creator wallet page.'
  }

  return ''
}

async function consumeHelperPrompt(eventId: string, payer: string, tier: HelperUsageTier) {
  const now = Date.now()
  const limit = helperLimitForTier(tier)
  const key = usageKey(eventId, payer, tier)
  const store = await readUsageStore()
  const current = store.usage[key]

  if (!current || current.resetAt <= now) {
    store.usage[key] = { count: 1, resetAt: now + HELPER_USAGE_WINDOW_MS }
    await writeUsageStore(store)
    return { allowed: true, remaining: limit - 1, resetAt: store.usage[key].resetAt, limit, tier }
  }

  if (current.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: current.resetAt, limit, tier }
  }

  current.count += 1
  store.usage[key] = current
  await writeUsageStore(store)
  return { allowed: true, remaining: Math.max(0, limit - current.count), resetAt: current.resetAt, limit, tier }
}

// ─── Payment verification (same logic as agent-verify, kept local) ────────────

async function getHelperPromptUsageStatus(eventId: string, payer: string, tier: HelperUsageTier) {
  const now = Date.now()
  const limit = helperLimitForTier(tier)
  const key = usageKey(eventId, payer, tier)
  const store = await readUsageStore()
  const current = store.usage[key]

  if (!current || current.resetAt <= now) {
    return { allowed: true, remaining: limit - 1, resetAt: now + HELPER_USAGE_WINDOW_MS, limit, tier }
  }

  if (current.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: current.resetAt, limit, tier }
  }

  return { allowed: true, remaining: Math.max(0, limit - current.count - 1), resetAt: current.resetAt, limit, tier }
}

async function verifyPayment(eventId: string, payer: string) {
  const provider = new ethers.JsonRpcProvider(OG_RPC)
  const contract = new ethers.Contract(ARCHIVE_ADDR, ARCHIVE_ABI, provider)
  const latest   = await withTimeout(provider.getBlockNumber(), '0G payment verification')

  const events = await withTimeout(contract.queryFilter(
    contract.filters.PaymentArchived(eventId),
    FROM_BLOCK,
    latest,
  ), '0G payment proof lookup')

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

function isNameQuestion(question: string) {
  return /\b(what'?s|what is|who am i|do you know)\b/i.test(question)
    && /\b(my name|me as|call me|who i am)\b/i.test(question)
}

function isLikelyIdentifier(value: string) {
  return !value
    || value.includes('@')
    || /^0x[a-fA-F0-9]{40}$/.test(value)
    || /^helper-free-/i.test(value)
}

function titleName(value: string) {
  return value
    .trim()
    .replace(/^@+/, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function nameFromMemory(memorySummary: string, payerName: string) {
  const candidates = [
    /\b(?:user is known as|known as|called|call(?:ed)?|prefers to be called)\s+([A-Za-z][A-Za-z0-9_-]{1,40}(?:\s+[A-Za-z][A-Za-z0-9_-]{1,40}){0,2})(?=[\s.!,;:]|$)/i.exec(memorySummary)?.[1],
    /\bHi\s+([A-Za-z][A-Za-z0-9_.-]{1,40})\b/i.exec(memorySummary)?.[1],
    !isLikelyIdentifier(payerName) ? payerName : '',
  ]
  const picked = candidates
    .map(item => String(item ?? '').trim().replace(/\b(?:not|is not|isn't)\s+@?[a-zA-Z0-9_.-]+.*$/i, '').replace(/\banymore\b.*$/i, '').trim())
    .find(Boolean)
  return picked ? titleName(picked) : ''
}

function cleanZeroScoutGuidanceText(value: string) {
  return value
    .split('\n')
    .map(line => line.replace(/^(Signal|Use|Boundary|Missing):\s*/i, '').trim())
    .filter(line => line && !/ZeroScout sponsorship is required/i.test(line))
    .filter(line => !line.includes(GENERIC_STRATEGY_PHRASE))
    .filter(line => !GENERIC_STRATEGY_PATTERNS.some(pattern => pattern.test(line)))
    .filter(line => !/^I can help with payments,\s*PayLinks,\s*HashpayStream,\s*PolyDesk,\s*wallets,\s*and setup/i.test(line))
    .slice(0, 5)
    .join('\n')
    .trim()
}

function fallbackHelperAnswer(question: string) {
  if (/\blocal_action=remember_name\b/i.test(question)) {
    const name = /preferred_name=([^\n]+)/i.exec(question)?.[1]?.trim()
    return name ? `Got it. I will call you ${name}.` : 'Got it. I will remember that.'
  }
  if (/\blocal_action=remember_relationship\b/i.test(question)) {
    const relationship = /relationship=([^\n]+)/i.exec(question)?.[1]?.trim() || 'friend'
    const name = /name=([^\n]+)/i.exec(question)?.[1]?.trim()
    return name ? `Got it. I will remember that your ${relationship} is ${name}.` : 'Got it. I will remember that.'
  }
  if (/\blocal_action=personal_memory_answer\b/i.test(question)) {
    const name = /known_name=([^\n]+)/i.exec(question)?.[1]?.trim()
    return name ? `You are ${name}.` : 'I do not know your preferred name yet. Tell me what to call you and I will remember it.'
  }
  if (/\blocal_action=personal_context_correction\b/i.test(question)) {
    return "You're right. I won't treat that as your name. Tell me what's on your mind."
  }
  if (/\blocal_action=payment_request_saved_wallet_choice\b/i.test(question)) {
    const network = /network=([^\n]+)/i.exec(question)?.[1]?.trim() || 'payment'
    const wallet = /saved_wallet=([^\n]+)/i.exec(question)?.[1]?.trim() || 'saved'
    return `I can prepare that PayLink. Continue with your saved ${network} wallet ${wallet}, or use a new receive wallet?`
  }
  if (/\blocal_action=payment_request_new_wallet_needed\b/i.test(question)) {
    return 'Send the new receive wallet. I will use it for this PayLink.'
  }
  if (/\blocal_action=payment_request_saved_wallet_network_mismatch\b/i.test(question)) {
    const savedWallet = /saved_wallet=([^\n]+)/i.exec(question)?.[1]?.trim() || 'saved wallet'
    const savedNetwork = /saved_wallet_network=([^\n]+)/i.exec(question)?.[1]?.trim() || 'saved network'
    const requestedNetwork = /requested_network=([^\n]+)/i.exec(question)?.[1]?.trim() || 'that network'
    return `I only have your saved ${savedNetwork} wallet ${savedWallet}. For ${requestedNetwork}, send a matching receive wallet or switch this PayLink back to ${savedNetwork.includes('Base') ? 'Base' : savedNetwork}.`
  }
  if (/\blocal_action=payment_request_missing_fields\b/i.test(question)) {
    const missing = /missing_fields=([^\n]+)/i.exec(question)?.[1]?.trim()
    return missing ? `I need ${missing}. You can send it in one line.` : 'I need the missing payment details. You can send them in one line.'
  }
  if (/\blocal_action=payment_request_draft_question\b/i.test(question)) {
    const userQuestion = /user_question=([^\n]+)/i.exec(question)?.[1]?.trim() ?? ''
    const payer = /payer=([^\n]+)/i.exec(question)?.[1]?.trim() || 'the payer'
    const missing = /missing_fields=([^\n]+)/i.exec(question)?.[1]?.trim()
    if (/\b(network|send through|send with|chain)\b/i.test(userQuestion)) {
      return `Yes. Ask ${payer} which network they can use first. I will keep this PayLink draft open while you confirm.`
    }
    if (/\b(answered|answer my question|not answered)\b/i.test(userQuestion)) {
      return missing
        ? `You're right. I should answer the question first. You can confirm with ${payer}, then send ${missing} when ready.`
        : `You're right. I should answer the question first. This draft is still open, and I can continue from here.`
    }
    return missing
      ? `Yes. You can confirm that first. I will keep this PayLink draft open; send ${missing} when ready.`
      : `Yes. This PayLink draft is still open, and I can continue from here.`
  }
  if (/\bpaylink_ready\b/i.test(question)) {
    return /\bgroup|collection/i.test(question) ? 'Collection ready.' : 'PayLink ready.'
  }
  if (/\bmeaning of love\b|\bwhat does love mean\b|\bdefine love\b/i.test(question)) {
    return 'Love is deep care, trust, and commitment shown through attention, patience, respect, and action. It is not only a feeling; it is how people choose to value and support each other.'
  }
  if (/\b(receipt|proof|0g archive|share receipt)\b/i.test(question)) {
    return 'After a PayLink is paid, the payer success screen shows the transaction, then the 0G archive and receipt actions appear once the proof is ready.'
  }
  if (/\b(x402|activate x402|service balance|wallet balance|circle balance)\b/i.test(question)) {
    return 'Circle wallet balance is the USDC in your wallet. x402 service balance is the amount activated for paid services. Fund the wallet first, then activate x402 before using paid services.'
  }
  if (/\b(paylink|payment link|request|invoice|collect|charge|receive (?:a )?payment|get paid)\b/i.test(question)) {
    return 'Tell me the payer, amount, network, purpose, and receive wallet. I can then prepare a clean PayLink for sharing.'
  }
  if (/\b(what can you do|help me|how can you help|what do you help with)\b/i.test(question)) {
    return 'I can help with PayLinks, payment receipts, wallet funding, x402 activation, PolyDesk, HashpayStream, setup questions, and everyday planning.'
  }
  if (isPersonalContextQuestion(question)) {
    return personalContextFallback(question)
  }
  if (requiresLiveExternalData(question)) {
    return 'I cannot verify live schedules or current events from this chat yet, so I should not guess. Ask me to create a PayLink or check payment details here, and use an official source for the latest fixture.'
  }
  return ''
}

function isGreetingQuestion(question: string) {
  return /^\s*(hi|hello|hey|yo|gm|good morning|good afternoon|good evening)\b/i.test(question)
}

function cleanQuestionForFallback(question: string) {
  return question
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[<>]/g, '')
    .slice(0, 180)
}

function requiresLiveExternalData(question: string) {
  return /\b(when is|when are|next game|next match|playing next|fixture|fixtures|schedule|score|scores|live|today|tomorrow|latest|current|near me|nearby|open now|restaurant around|weather|price|prices)\b/i.test(question)
}

function isPersonalContextQuestion(question: string) {
  return /\b(i am|i'm|i feel|feeling|my friend|i have a friend|i have a|i'm sad|i am sad|mood|not my name|that's not my name|years old|personal assistant|helpful everyday|everyday for me|do you love me)\b/i.test(question)
}

function personalContextFallback(question: string) {
  if (/\b\d{1,3}\s+years?\s+old\b/i.test(question)) {
    return 'Got it. I can remember that as part of your personal context and use it when it helps.'
  }
  if (/\bpersonal assistant|helpful everyday|everyday for me\b/i.test(question)) {
    return 'Yes. I can help as your everyday assistant: planning, simple questions, ideas, payment tasks, reminders to yourself, and next steps.'
  }
  if (/\bdo you love me\b/i.test(question)) {
    return "I care about helping you well. I am not a person, but I can be steady, useful, and kind whenever you need support."
  }
  if (/\b(i am|i'm|i feel|feeling)\s+(sad|down|upset|stressed|anxious|lonely|tired|confused|angry)\b/i.test(question)) {
    return "I'm sorry you're feeling that way. I can stay with you for a bit: tell me what happened, or we can slow it down and take it one step at a time."
  }
  if (/\bfriend called|friend named|friend is|i have a friend\b/i.test(question)) {
    return 'Got it. I can remember that context and use it naturally when you ask about them.'
  }
  if (/\bnot my name|my mood|that's not my name\b/i.test(question)) {
    return "You're right. I won't treat that as your name. Tell me what's on your mind."
  }
  return 'I understand. Tell me a little more, and I will respond like a normal chat, not just a payment tool.'
}

function normalizeHelperMode(value: unknown) {
  const mode = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return HELPER_MODES.has(mode) ? mode : ''
}

function classifyHelperRequest(question: string, helperMode = ''): { helperIntent: string; qualityMode: 'fast' | 'standard' | 'deep' } {
  const value = question.toLowerCase()
  if (isNameQuestion(question)) return { helperIntent: 'personal-memory', qualityMode: 'fast' }
  if (isGreetingQuestion(question)) return { helperIntent: 'greeting', qualityMode: 'fast' }
  if (helperMode === 'polydesk') return { helperIntent: 'polydesk', qualityMode: 'deep' }
  if (helperMode === 'streampay') return { helperIntent: 'hashpaystream-creator', qualityMode: 'standard' }
  if (helperMode === 'daily') return { helperIntent: 'daily-assistant', qualityMode: 'fast' }
  if (helperMode === 'services') return { helperIntent: 'hashpaylink-services', qualityMode: 'standard' }
  if (helperMode === 'support') return { helperIntent: 'support', qualityMode: 'standard' }
  if (helperMode === 'payments') return { helperIntent: 'payment-help', qualityMode: 'standard' }
  if (/^\s*(hi|hello|hey|yo|gm|good morning|good afternoon|good evening)\b/.test(value)) {
    return { helperIntent: 'greeting', qualityMode: 'fast' }
  }
  if (/\b(what can you do|how can you help|help me|capabilities|what do you help with)\b/.test(value)) {
    return { helperIntent: 'capabilities', qualityMode: 'fast' }
  }
  if (requiresLiveExternalData(question)) {
    return { helperIntent: 'live-data-question', qualityMode: 'deep' }
  }
  if (isPersonalContextQuestion(question)) {
    return { helperIntent: 'personal-context', qualityMode: 'standard' }
  }
  if (/\b(research|analyze|analysis|strategy|investor|pitch|grant|roadmap|architecture|design|compare|plan|proposal|polymarket|lp scout|liquidity|market|x402 architecture|product strategy|look up|find|near me|nearby|restaurant|wuse|abuja)\b/.test(value)) {
    return { helperIntent: 'deep-research', qualityMode: 'deep' }
  }
  if (/\b(receipt|proof|0g archive|share receipt)\b/.test(value)) {
    return { helperIntent: 'receipt-help', qualityMode: 'standard' }
  }
  if (/\b(x402|activate x402|service balance|wallet balance|circle balance)\b/.test(value)) {
    return { helperIntent: 'x402-help', qualityMode: 'standard' }
  }
  if (/\b(paylink|payment link|request|invoice|collect|charge|receive (?:a )?payment|get paid|wallet|base|arc|arbitrum|solana|usdc)\b/.test(value)) {
    return { helperIntent: 'payment-help', qualityMode: 'standard' }
  }
  if (question.length > 220) {
    return { helperIntent: 'long-form-helper', qualityMode: 'deep' }
  }
  return { helperIntent: 'general-helper', qualityMode: 'standard' }
}

function answerFromZeroScoutGuidance(question: string, zeroScoutGuidance?: ZeroScoutHelperGuidance) {
  const guidance = cleanZeroScoutGuidanceText(zeroScoutGuidance?.guidance ?? '')
  if (!guidance) return ''
  const limit = /\b(payment|paylink|request|invoice|usdc|wallet|base|arc|arbitrum|solana)\b/i.test(question) ? 900 : 700
  return guidance.length <= limit ? guidance : `${guidance.slice(0, limit - 20).trim()}...`
}

function isBadHashpayStreamMediaInspectionDenial(answer: string) {
  const deniesMediaInspection = /\b(hashpaystream|streaming access|payments)\b/i.test(answer)
    && /\b(doesn'?t|does not|isn'?t|is not|currently offers?|not something)\b/i.test(answer)
    && /\b(video analysis|frame[-\s]*by[-\s]*frame|deeper analysis|ai vision|dedicated video analysis)\b/i.test(answer)
  const genericCapabilityAnswer = /\b(i'?m Agent Hash|I can help|What would you like)\b/i.test(answer)
    && /\b(HashpayStream|ZeroScout|content|creator tools|access status)\b/i.test(answer)
    && !/\b(inspect|analysis|analy[sz]ed|breakdown|frame|media URL|video URL|unlocked|verified)\b/i.test(answer)
  return deniesMediaInspection || genericCapabilityAnswer
}

function safeZeroScoutGuidanceError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return message
    .replace(/Bearer\s+[a-zA-Z0-9._-]{8,}/gi, 'Bearer [redacted-token]')
    .replace(/sk-[a-zA-Z0-9_-]{8,}/g, '[redacted-api-key]')
    .slice(0, 220)
}

function userFacingZeroScoutGuidanceError(error: unknown) {
  const message = safeZeroScoutGuidanceError(error)
  if (/\b(credit|credits|top up|quota|billing|wallet that owns this integration key)\b/i.test(message)) {
    return 'Agent Hash is undergoing self-maintenance so we can keep offering you the best service. Please try again shortly.'
  }
  return `Agent Hash could not reach its ZeroScout intelligence layer just now. Please try again shortly.`
}

function getHelperResponse(question: string, payerName: string, chain: string, amount: string, memorySummary = '', zeroScoutGuidance?: ZeroScoutHelperGuidance, accessMode = 'paid', helperMode = '', hashpayStreamContext?: unknown): string {
  const zeroScoutAnswer = answerFromZeroScoutGuidance(question, zeroScoutGuidance)

  if (isNameQuestion(question)) {
    const knownName = nameFromMemory(memorySummary, payerName)
    return knownName
      ? `You are ${knownName}.`
      : "I do not know your preferred name yet. Tell me what to call you and I will remember it for future chats."
  }

  if (isGreetingQuestion(question)) {
    const knownName = nameFromMemory(memorySummary, payerName)
    if (helperMode === 'streampay') {
      return `Hey${knownName ? ` ${knownName}` : ''}. I can help you publish paid content, price a drop, explain pay-as-you-read, summarize unlocked content, or understand creator earnings.`
    }
    return `Hey${knownName ? ` ${knownName}` : ''}. I can help you create a PayLink, check a receipt, set up wallets, use HashpayStream, or research PolyDesk and Polymarket flows.`
  }

  if (helperMode === 'streampay' && isZeroScoutVideoInspectionRequest(question) && zeroScoutAnswer && !isBadHashpayStreamMediaInspectionDenial(zeroScoutAnswer)) return zeroScoutAnswer

  if (helperMode === 'streampay') {
    const streamAnswer = hashpayStreamContextAnswer(question, hashpayStreamContext, memorySummary)
    if (streamAnswer) return streamAnswer
  }

  if (zeroScoutAnswer) return zeroScoutAnswer

  const fallbackAnswer = fallbackHelperAnswer(question)
  if (fallbackAnswer) return fallbackAnswer

  if (helperMode === 'services') {
    return 'I can help with Hash PayLink services. Tell me if you mean PayLinks, HashpayStream, Agent Wallets, x402, Circle wallet setup, or PolyDesk.'
  }

  if (helperMode === 'streampay') {
    return 'I can help with HashpayStream Creator. Ask me to improve a post, suggest pricing, explain pay-as-you-read checkpoints, summarize unlocked content, or read your earnings state.'
  }

  if (helperMode === 'support') {
    return 'I can help troubleshoot that. Tell me what you are trying to do, what happened, and where you got stuck.'
  }

  if (helperMode === 'polydesk') {
    return 'I could not complete the PolyDesk answer just now. Open Portfolio, World Cup, or LP Scout and I will use that exact Polymarket path.'
  }

  if (accessMode !== HELPER_FREE_ACCESS_MODE) {
    return `Your paid helper access is verified: ${amount} on ${chain}. What would you like to do next?`
  }

  const cleanQuestion = cleanQuestionForFallback(question)
  return cleanQuestion
    ? `I did not get the full refined answer just now, but I can still respond. For "${cleanQuestion}", tell me a little more about what you mean and I will help from there.`
    : 'I did not get the full refined answer just now. Send that again in a shorter way and I will help from there.'
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' })

  const { eventId: rawEventId, payer: rawPayer, question: rawQuestion, memorySummary: rawMemorySummary, accessMode: rawAccessMode, helperMode: rawHelperMode, hashpayStreamContext: rawHashpayStreamContext } = (req.body ?? {}) as Record<string, unknown>
  let eventId: string
  let payer: string
  let question: string
  let memorySummary = ''
  const accessMode = rawAccessMode === HELPER_FREE_ACCESS_MODE ? HELPER_FREE_ACCESS_MODE : 'paid'
  const helperMode = normalizeHelperMode(rawHelperMode)

  try {
    payer = normalizeBoundedString(rawPayer, 'payer', MAX_PAYER_LENGTH)
    question = normalizeBoundedString(rawQuestion, 'question', MAX_QUESTION_LENGTH)
    eventId = accessMode === HELPER_FREE_ACCESS_MODE
      ? String(rawEventId || `helper-free-${crypto.createHash('sha256').update(payer.toLowerCase()).digest('hex').slice(0, 18)}`).slice(0, MAX_EVENT_ID_LENGTH)
      : normalizeBoundedString(rawEventId, 'eventId', MAX_EVENT_ID_LENGTH)
    if (typeof rawMemorySummary === 'string') memorySummary = rawMemorySummary.trim().slice(0, MAX_MEMORY_LENGTH)
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid request' })
  }

  try {
    // 1. Verify payment on 0G Mainnet unless this is the free Ask Hash helper.
    const result = accessMode === HELPER_FREE_ACCESS_MODE ? null : await verifyPayment(eventId, payer)
    const access = result ?? {
      payment: {
        eventId,
        payer,
        chain: 'Ask Hash',
        amount: '0',
        ts: Math.floor(Date.now() / 1000),
      },
      proof: {
        contract: '',
        network: 'Ask Hash helper',
        rootHash: '',
        ogTxHash: '',
      },
    }

    if (!result && accessMode !== HELPER_FREE_ACCESS_MODE) {
      return res.status(402).json({
        error:           'Payment required',
        paymentRequired: true,
        message:         `No verified payment found for "${payer}" on event ${eventId}.`,
        hint:            'Payment may still be archiving to 0G (~30–60s after confirmation)',
        paymentLink:     `https://hashpaylink.com/pay?v=1&id=${encodeURIComponent(eventId)}`,
      })
    }

    // 2. Payment verified — get AI response
    const helperRouting = classifyHelperRequest(question, helperMode)
    const usageTier: HelperUsageTier = helperRouting.qualityMode === 'deep' ? 'deep' : 'simple'
    const usagePreview = await getHelperPromptUsageStatus(eventId, access.payment.payer, usageTier)
    if (!usagePreview.allowed) {
      res.setHeader('Retry-After', Math.ceil((usagePreview.resetAt - Date.now()) / 1000).toString())
      return res.status(429).json({
        error: usageTier === 'deep'
          ? 'Deep research limit reached for today. Upgrade to Agent Hash Pro to continue deeper Ask Hash research.'
          : 'Daily Ask Hash chat limit reached. Payment Links, HashpayStream, and other manual tools remain available.',
        cooldown: true,
        upgradeRequired: usageTier === 'deep',
        upgradeAmount: usageTier === 'deep' ? '10' : undefined,
        upgradeCurrency: usageTier === 'deep' ? 'USDC' : undefined,
        upgradeLink: usageTier === 'deep' ? agentHashProPaymentLink(access.payment.payer) : undefined,
        usageTier,
        limit: usagePreview.limit,
        resetAt: usagePreview.resetAt,
      })
    }

    const memorySummaryHash = memorySummary
      ? crypto.createHash('sha256').update(memorySummary).digest('hex')
      : undefined
    const streamClientHint = helperMode === 'streampay' ? clientHashpayStreamHint(rawHashpayStreamContext) : undefined
    const hashpayStreamContext = helperMode === 'streampay'
      ? compactHashpayStreamContext(await buildHashpayStreamAgentContext({
          creator: extractCreatorFromMemory(memorySummary) || streamClientHint?.creator,
          wallet: extractReaderWalletFromMemory(memorySummary)
            || streamClientHint?.wallet
            || (/^0x[a-fA-F0-9]{40}$/.test(access.payment.payer) ? access.payment.payer : ''),
          contentId: extractActiveContentIdFromMemory(memorySummary) || streamClientHint?.contentId,
          contentTitle: extractActiveContentTitleFromMemory(memorySummary) || streamClientHint?.contentTitle,
        }))
      : undefined
    let zeroScoutGuidance: ZeroScoutHelperGuidance | undefined
    try {
      zeroScoutGuidance = await getZeroScoutHelperGuidance({
        service: 'Hash PayLink Helper',
        action: 'helper-chat-preflight',
        user: {
          payer: access.payment.payer,
          email: access.payment.payer,
          wallet: access.payment.payer,
        },
        request: {
          eventId,
          question,
          accessMode,
          helperMode,
          helperIntent: helperRouting.helperIntent,
          qualityMode: helperRouting.qualityMode,
          hashpayStreamVideoInspectionRequested: helperMode === 'streampay'
            ? isZeroScoutVideoInspectionRequest(question)
              || isHashWatchVideoBreakdownRequest(question, streamClientHint?.contentTitle)
              || isHashWatchVideoBreakdownRequest(question, extractActiveContentTitleFromMemory(memorySummary))
            : undefined,
          memorySummary,
          memorySummaryHash,
          hashpayStreamContext,
        },
        sourceProof: {
          type: accessMode === HELPER_FREE_ACCESS_MODE ? 'helper-free-access' : 'helper_access_receipt',
          contract: access.proof.contract,
          network: access.proof.network,
          rootHash: access.proof.rootHash,
          ogTxHash: access.proof.ogTxHash,
        },
        strictGuidance: helperMode === 'daily',
      })
    } catch (err) {
      if (helperMode === 'daily') {
        console.warn(`[agent-ask] ZeroScout ${helperMode} guidance failed:`, safeZeroScoutGuidanceError(err))
        return res.status(503).json({
          error: userFacingZeroScoutGuidanceError(err),
          zeroscoutRequired: true,
          helperMode,
          helperIntent: helperRouting.helperIntent,
        })
      }
      console.warn('[agent-ask] ZeroScout helper guidance failed:', safeZeroScoutGuidanceError(err))
    }

    if (helperMode === 'daily' && !answerFromZeroScoutGuidance(question, zeroScoutGuidance)) {
      return res.status(503).json({
        error: 'ZeroScout Daily guidance is required before Daily mode responses are returned. Try again shortly.',
        zeroscoutRequired: true,
        helperMode,
        helperIntent: helperRouting.helperIntent,
      })
    }

    const answer = getHelperResponse(
      question,
      access.payment.payer,
      access.payment.chain,
      access.payment.amount,
      memorySummary,
      zeroScoutGuidance,
      accessMode,
      helperMode,
      hashpayStreamContext,
    )

    let zeroscoutSponsorship: ZeroScoutSponsoredAction | undefined
    try {
      zeroscoutSponsorship = await sponsorZeroScoutAction({
        service: 'Hash PayLink Helper',
        action: 'helper-chat-response',
        user: {
          payer: access.payment.payer,
          email: access.payment.payer,
          wallet: access.payment.payer,
        },
        request: {
          eventId,
          question,
          accessMode,
          helperMode,
          helperIntent: helperRouting.helperIntent,
          qualityMode: helperRouting.qualityMode,
          memorySummaryHash,
          guidanceRequestHash: zeroScoutGuidance?.requestHash,
          hashpayStreamContextHash: hashpayStreamContext
            ? crypto.createHash('sha256').update(JSON.stringify(hashpayStreamContext)).digest('hex')
            : undefined,
        },
        sourceProof: {
          type: accessMode === HELPER_FREE_ACCESS_MODE ? 'helper-free-access' : 'helper_access_receipt',
          ...access.proof,
        },
        result: {
          answerHash: crypto.createHash('sha256').update(answer).digest('hex'),
          guidanceHash: zeroScoutGuidance?.guidanceHash,
          helperIntent: helperRouting.helperIntent,
          qualityMode: helperRouting.qualityMode,
          usageRemaining: usagePreview.remaining,
        },
      })
    } catch (err) {
      const strictSponsorshipRequired = helperRouting.qualityMode === 'deep' || accessMode !== HELPER_FREE_ACCESS_MODE
      console.warn('[agent-ask] ZeroScout response sponsorship failed:', safeZeroScoutGuidanceError(err))
      if (strictSponsorshipRequired) {
        return res.status(503).json({
          error: 'ZeroScout sponsorship is required before helper responses are returned. Try again shortly.',
          zeroscoutRequired: true,
        })
      }
    }
    if (!zeroscoutSponsorship) {
      const strictSponsorshipRequired = helperRouting.qualityMode === 'deep' || accessMode !== HELPER_FREE_ACCESS_MODE
      if (strictSponsorshipRequired) {
        return res.status(503).json({
          error: 'ZeroScout sponsorship is required before helper responses are returned. Try again shortly.',
          zeroscoutRequired: true,
        })
      }
    }

    const usage = await consumeHelperPrompt(eventId, access.payment.payer, usageTier)
    if (!usage.allowed) {
      res.setHeader('Retry-After', Math.ceil((usage.resetAt - Date.now()) / 1000).toString())
      return res.status(429).json({
        error: usageTier === 'deep'
          ? 'Deep research limit reached for today. Upgrade to Agent Hash Pro to continue deeper Ask Hash research.'
          : 'Daily Ask Hash chat limit reached. Payment Links, HashpayStream, and other manual tools remain available.',
        cooldown: true,
        upgradeRequired: usageTier === 'deep',
        upgradeAmount: usageTier === 'deep' ? '10' : undefined,
        upgradeCurrency: usageTier === 'deep' ? 'USDC' : undefined,
        upgradeLink: usageTier === 'deep' ? agentHashProPaymentLink(access.payment.payer) : undefined,
        usageTier,
        limit: usage.limit,
        resetAt: usage.resetAt,
      })
    }

    return res.json({
      answer,
      accessMode,
      paymentVerified: accessMode !== HELPER_FREE_ACCESS_MODE,
      usage: {
        remaining: usage.remaining,
        limit: usage.limit,
        tier: usage.tier,
        resetAt: usage.resetAt,
      },
      helperIntent: helperRouting.helperIntent,
      qualityMode: helperRouting.qualityMode,
      payment:         access.payment,
      proof:           accessMode === HELPER_FREE_ACCESS_MODE ? undefined : result?.proof,
      zeroscoutSponsorship,
      zeroscoutPending: !zeroscoutSponsorship,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[agent-ask]', msg)
    const timedOut = /timed out/i.test(msg)
    return res.status(timedOut ? 504 : 500).json({
      error: timedOut ? 'Payment verification is still syncing. Try again shortly.' : 'Service temporarily unavailable',
    })
  }
}
