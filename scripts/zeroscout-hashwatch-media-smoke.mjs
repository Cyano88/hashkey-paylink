import assert from 'node:assert/strict'

const originalEnv = { ...process.env }
const originalFetch = globalThis.fetch

function restore() {
  process.env = { ...originalEnv }
  if (originalFetch) globalThis.fetch = originalFetch
  else delete globalThis.fetch
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  }
}

try {
  process.env.ZEROSCOUT_API_URL = 'https://zeroscout.test'
  process.env.ZEROSCOUT_INTEGRATION_SECRET = 'test-secret'
  process.env.ZEROSCOUT_RETRY_ATTEMPTS = '0'
  process.env.ZEROSCOUT_REQUEST_TIMEOUT_MS = '5000'

  let seenPayload
  globalThis.fetch = async (_url, init) => {
    seenPayload = JSON.parse(String(init.body))
    return jsonResponse({
      id: 'zs_hashwatch_media_smoke',
      suggestedAnswer: 'The video URL was accepted for 0G compute media inspection.',
      summary: 'HashWatch media inspection payload accepted.',
      signals: ['mediaInspection.allowed=true'],
      riskFlags: [],
      recommendedActions: ['inspect supplied mediaUrl only for this unlocked session'],
      dataGaps: [],
    })
  }

  const { getZeroScoutHelperGuidance } = await import('../api/zeroscout-sponsored-action.ts')
  const videoUrl = 'youtu.be/mYSVSs33ZgE?si=5eumS_SNzXDnzZYK'
  const normalizedVideoUrl = 'https://youtu.be/mYSVSs33ZgE?si=5eumS_SNzXDnzZYK'
  const guidance = await getZeroScoutHelperGuidance({
    service: 'Hash PayLink Helper',
    action: 'helper-chat-preflight',
    user: { payer: '0x116a00000000000000000000000000000000ee73' },
    request: {
      eventId: 'hashwatch-media-smoke',
      question: 'I want ZeroScout to inspect the video URL',
      accessMode: 'helper-free',
      helperMode: 'streampay',
      helperIntent: 'hashpaystream-creator',
      qualityMode: 'standard',
      hashpayStreamVideoInspectionRequested: true,
      hashpayStreamContext: {
        activeContent: {
          status: 'unlocked',
          contentId: 'digital-art-video',
          metadata: {
            title: 'A simple tutorial on how to create 3D animated Digital Art',
            description: 'A 25mins video guide to onboard any normie in Digital Art creation',
            creator: '0x116a00000000000000000000000000000000ee73',
          },
          unlockedContent: {
            kind: 'hashwatch-video',
            videoUrl,
          },
        },
      },
    },
    sourceProof: { type: 'helper-free-access' },
  })

  assert.equal(guidance?.zeroscout.id, 'zs_hashwatch_media_smoke')
  assert.equal(seenPayload?.analysisType, 'zeroscout-helper-context-guidance')
  assert.equal(seenPayload?.data?.requestedRefinementLane, 'og-compute')
  assert.equal(seenPayload?.data?.mediaUrl, normalizedVideoUrl)
  assert.equal(seenPayload?.data?.videoUrl, normalizedVideoUrl)
  assert.equal(seenPayload?.data?.url, normalizedVideoUrl)
  assert.equal(seenPayload?.data?.forceMediaInspection, true)
  assert.equal(seenPayload?.data?.requiredProvider, 'qwen-vl')
  assert.equal(seenPayload?.data?.requiredModelFamily, 'qwen-vl')
  assert.equal(seenPayload?.data?.requiredModel, 'qwen3.7-plus')
  assert.equal(seenPayload?.data?.mediaModelPreference, 'qwen3.7-plus')
  assert.equal(seenPayload?.data?.mediaRouting?.task, 'video-url-analysis')
  assert.equal(seenPayload?.data?.mediaRouting?.requiredProvider, 'qwen-vl')
  assert.equal(seenPayload?.data?.mediaRouting?.requiredModelFamily, 'qwen-vl')
  assert.equal(seenPayload?.data?.mediaRouting?.rejectMetadataOnlyAnswer, true)
  assert.equal(seenPayload?.data?.mediaRouting?.mediaUrlField, 'data.mediaUrl')
  assert.equal(seenPayload?.data?.modelHints?.preferredModel, 'qwen3.7-plus')
  assert.equal(seenPayload?.data?.modelHints?.providerHint, 'qwen-vl')
  assert.equal(seenPayload?.data?.modelHints?.requiredCapabilities?.includes('video-understanding'), true)
  assert.equal(seenPayload?.data?.modelHints?.blockedProviders?.includes('zai-org/GLM-5-FP8'), true)
  assert.equal(seenPayload?.data?.mediaInspection?.allowed, true)
  assert.equal(seenPayload?.data?.mediaInspection?.mediaTask, 'video-url-analysis')
  assert.equal(seenPayload?.data?.mediaInspection?.requiredProvider, 'qwen-vl')
  assert.equal(seenPayload?.data?.mediaInspection?.mediaUrl, normalizedVideoUrl)
  assert.equal(seenPayload?.data?.mediaInspection?.preferredModel, 'qwen3.7-plus')
  assert.equal(seenPayload?.data?.mediaInspection?.modelCandidates?.includes('qwen-vl-max-latest'), true)
  assert.equal(seenPayload?.data?.request?.mediaInspection?.allowed, true)
  assert.equal(seenPayload?.data?.request?.mediaInspection?.mediaUrl, normalizedVideoUrl)

  console.log('zeroscout hashwatch media smoke ok')
} finally {
  restore()
}
