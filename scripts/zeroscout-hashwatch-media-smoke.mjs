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

  const seenPayloads = []
  globalThis.fetch = async (_url, init) => {
    seenPayloads.push(JSON.parse(String(init.body)))
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
  const longGuidance = await getZeroScoutHelperGuidance({
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
            durationSeconds: 1500,
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

  const longPayload = seenPayloads.at(-1)
  assert.equal(longGuidance?.zeroscout.id, 'zs_hashwatch_media_smoke')
  assert.equal(longPayload?.analysisType, 'zeroscout-helper-context-guidance')
  assert.equal(longPayload?.data?.mediaUrl, undefined)
  assert.equal(longPayload?.data?.videoUrl, undefined)
  assert.equal(longPayload?.data?.forceMediaInspection, undefined)
  assert.equal(longPayload?.data?.mediaRouting, undefined)
  assert.equal(longPayload?.data?.mediaInspection?.allowed, false)
  assert.equal(longPayload?.data?.mediaInspection?.blocked, true)
  assert.equal(longPayload?.data?.mediaInspection?.durationSeconds, 1500)
  assert.equal(longPayload?.data?.mediaInspection?.maxLiveDurationSeconds, 300)
  assert.match(longPayload?.data?.mediaInspection?.reason, /capped at 5 minutes/i)

  const demoUrl = 'https://hashpaylink.com/hashwatch-pay-as-you-watch-demo.mp4'
  const guidance = await getZeroScoutHelperGuidance({
    service: 'Hash PayLink Helper',
    action: 'helper-chat-preflight',
    user: { payer: '0x116a00000000000000000000000000000000ee73' },
    request: {
      eventId: 'hashwatch-short-demo-smoke',
      question: 'Explain the HashWatch pay as you watch demo video',
      accessMode: 'helper-free',
      helperMode: 'streampay',
      helperIntent: 'hashpaystream-creator',
      qualityMode: 'standard',
      hashpayStreamVideoInspectionRequested: true,
      hashpayStreamContext: {
        activeContent: {
          status: 'unlocked',
          contentId: 'hashwatch-video-demo',
          metadata: {
            title: 'HashWatch: Pay-As-You-Watch Demo',
            description: 'A 30 second in-platform walkthrough for testing watch checkpoints.',
            durationSeconds: 30,
            creator: 'HashpayStream Studio',
          },
          unlockedContent: {
            kind: 'hashwatch-video',
            videoUrl: demoUrl,
            durationSeconds: 30,
          },
        },
      },
    },
    sourceProof: { type: 'helper-free-access' },
  })

  const seenPayload = seenPayloads.at(-1)
  assert.equal(guidance?.zeroscout.id, 'zs_hashwatch_media_smoke')
  assert.equal(seenPayload?.analysisType, 'zeroscout-helper-context-guidance')
  assert.equal(seenPayload?.data?.requestedRefinementLane, 'og-compute')
  assert.equal(seenPayload?.data?.mediaUrl, demoUrl)
  assert.equal(seenPayload?.data?.videoUrl, demoUrl)
  assert.equal(seenPayload?.data?.url, demoUrl)
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
  assert.equal(seenPayload?.data?.mediaInspection?.durationSeconds, 30)
  assert.equal(seenPayload?.data?.mediaInspection?.maxLiveDurationSeconds, 300)
  assert.equal(seenPayload?.data?.mediaInspection?.mediaTask, 'video-url-analysis')
  assert.equal(seenPayload?.data?.mediaInspection?.requiredProvider, 'qwen-vl')
  assert.equal(seenPayload?.data?.mediaInspection?.mediaUrl, demoUrl)
  assert.equal(seenPayload?.data?.mediaInspection?.preferredModel, 'qwen3.7-plus')
  assert.equal(seenPayload?.data?.mediaInspection?.modelCandidates?.includes('qwen-vl-max-latest'), true)
  assert.equal(seenPayload?.data?.request?.mediaInspection?.allowed, true)
  assert.equal(seenPayload?.data?.request?.mediaInspection?.mediaUrl, demoUrl)

  console.log('zeroscout hashwatch media smoke ok')
} finally {
  restore()
}
