import 'dotenv/config'
import { performance } from 'node:perf_hooks'

const timeoutMs = Number(process.env.ZEROSCOUT_HASHWATCH_MEDIA_GUIDANCE_TIMEOUT_MS || process.env.ZEROSCOUT_PROBE_TIMEOUT_MS || 90_000)
const videoUrl = process.env.ZEROSCOUT_PROBE_VIDEO_URL || 'youtu.be/mYSVSs33ZgE?si=5eumS_SNzXDnzZYK'
const title = process.env.ZEROSCOUT_PROBE_VIDEO_TITLE || 'A simple tutorial on how to create 3D animated Digital Art'
const modelHint = process.env.ZEROSCOUT_PROBE_MODEL_HINT || process.env.ZEROSCOUT_HASHWATCH_MEDIA_MODEL || ''

function requireEnv(name) {
  const value = String(process.env[name] || '').trim()
  if (!value) throw new Error(`${name} is required for live ZeroScout probe`)
  return value
}

function printableResult(label, startedAt, result) {
  const elapsedMs = Math.round(performance.now() - startedAt)
  console.log(`\n[${label}] ok in ${elapsedMs}ms`)
  console.log(JSON.stringify({
    id: result.zeroscout?.id,
    aiProvider: result.zeroscout?.aiProvider,
    summary: result.zeroscout?.summary,
    suggestedAnswer: result.zeroscout?.suggestedAnswer,
    guidance: result.guidance,
    signals: result.zeroscout?.signals,
    riskFlags: result.zeroscout?.riskFlags,
    recommendedActions: result.zeroscout?.recommendedActions,
    dataGaps: result.zeroscout?.dataGaps,
    proof: result.zeroscout?.proof,
    network: result.zeroscout?.network,
    storageMode: result.zeroscout?.storageMode,
  }, null, 2))
}

async function runProbe(label, extraRequest = {}) {
  const startedAt = performance.now()
  try {
    const { getZeroScoutHelperGuidance } = await import('../api/zeroscout-sponsored-action.ts')
    const guidance = await getZeroScoutHelperGuidance({
      service: 'Hash PayLink Helper',
      action: 'helper-chat-preflight',
      user: { payer: '0x116a00000000000000000000000000000000ee73' },
      request: {
        eventId: `hashwatch-live-probe-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        question: `Explain the HashWatch video "${title}" in detail. Give me a clear breakdown of what happens in the video and the main learning points.`,
        accessMode: 'helper-free',
        helperMode: 'streampay',
        helperIntent: 'hashpaystream-creator',
        qualityMode: 'standard',
        hashpayStreamVideoInspectionRequested: true,
        memorySummary: `Live probe for unlocked HashWatch media analysis. Prefer direct media inspection and return usable video breakdown, not generic metadata. ${modelHint ? `Model preference: ${modelHint}.` : ''}`,
        hashpayStreamContext: {
          activeContent: {
            status: 'unlocked',
            contentId: 'digital-art-video',
            metadata: {
              title,
              description: 'A 25mins video guide to onboard any normie in Digital Art creation',
              creator: '0x116a00000000000000000000000000000000ee73',
            },
            unlockedContent: {
              kind: 'hashwatch-video',
              videoUrl,
            },
          },
        },
        ...extraRequest,
      },
      sourceProof: { type: 'helper-free-access' },
      strictGuidance: true,
    })
    printableResult(label, startedAt, guidance)
  } catch (error) {
    const elapsedMs = Math.round(performance.now() - startedAt)
    console.error(`\n[${label}] failed in ${elapsedMs}ms`)
    throw error
  }
}

try {
  requireEnv('ZEROSCOUT_API_URL')
  requireEnv('ZEROSCOUT_INTEGRATION_SECRET')
  process.env.ZEROSCOUT_RETRY_ATTEMPTS = process.env.ZEROSCOUT_RETRY_ATTEMPTS || '0'
  process.env.ZEROSCOUT_HASHWATCH_MEDIA_GUIDANCE_TIMEOUT_MS = String(timeoutMs)

  console.log('ZeroScout live media probe')
  console.log(JSON.stringify({
    apiUrl: process.env.ZEROSCOUT_API_URL,
    intelligencePath: process.env.ZEROSCOUT_INTELLIGENCE_PATH || '/api/integrations/intelligence',
    timeoutMs,
    videoUrl,
    title,
    modelHint: modelHint || null,
  }, null, 2))

  await runProbe('current-og-compute')
  if (modelHint) {
    await runProbe('model-hint', {
      preferredModel: modelHint,
      modelHint,
      mediaAnalysisProvider: modelHint,
    })
  }
} catch (error) {
  const elapsedMessage = error instanceof Error ? error.message : String(error)
  console.error(`\n[probe failed] ${elapsedMessage}`)
  if (error && typeof error === 'object' && 'status' in error) console.error(`status=${error.status}`)
  process.exitCode = 1
}
