import assert from 'node:assert/strict'

const {
  hashpayStreamContextAnswer,
  isBadHashpayStreamMediaInspectionDenial,
  publicHashWatchDemoFallback,
} = await import('../api/agent-ask.ts')

const badAnswers = [
  "I don't have access to the actual video content or transcript for that HashWatch tutorial. I can see you're browsing HashpayStream with HashWatch content available, but I can't watch or analyze videos directly.",
  "I can see you've unlocked the video, however I don't have access to the actual video frames or content to walk you through it step by step.",
  "Frame-by-frame video analysis isn't something HashpayStream currently offers; use a dedicated video analysis tool.",
  "I can see you've unlocked the HashWatch video, however I'm not able to perform video content analysis directly from this chat. Video-level AI vision analysis requires external processing that isn't available in this helper session.",
]

const acceptableAnswer = 'Your unlock is verified, and ZeroScout inspected the media URL. Here is the video breakdown and main learning points.'

for (const answer of badAnswers) {
  assert.equal(isBadHashpayStreamMediaInspectionDenial(answer), true, answer)
}

assert.equal(isBadHashpayStreamMediaInspectionDenial(acceptableAnswer), false)

const demoFallback = publicHashWatchDemoFallback(
  'Explain the HashWatch video "HashWatch: Pay-As-You-Watch Demo" in detail. Use the video itself.',
  {
    activeContent: {
      status: 'unlocked',
      contentId: 'hashwatch-video-demo',
      metadata: {
        title: 'HashWatch: Pay-As-You-Watch Demo',
        description: 'A 30 second in-platform walkthrough for testing HashWatch checkpoints.',
      },
      unlockedContent: {
        kind: 'hashwatch-video',
        videoUrl: 'https://hashpaylink.com/hashwatch-pay-as-you-watch-demo.mp4',
        durationSeconds: 30,
      },
    },
  },
  'AbortError: timed out',
)

assert.match(demoFallback, /does not require an unlock or payment/i)
assert.match(demoFallback, /30-second walkthrough/i)
assert.match(demoFallback, /checkpoint settlement/i)
assert.equal(isBadHashpayStreamMediaInspectionDenial(demoFallback), false)

const context = {
  latestHashWatch: [{
    title: 'HashWatch: Pay-As-You-Watch Demo',
    description: 'A 30 second walkthrough.',
    category: 'hashwatch',
    priceUsdc: 0,
    gateLink: '/gate?id=hashwatch-video-demo&demo=1',
  }],
  latestBooks: [{
    title: 'Dracula',
    description: 'A gothic horror classic.',
    category: 'ebooks',
    priceUsdc: 0.1,
    gateLink: '/gate?id=dracula',
  }],
  latestPosts: [{
    title: 'Before You Build: AI Terminal Setup',
    description: 'A beginner AI coding terminal setup guide.',
    category: 'developers',
    priceUsdc: 0.1,
    gateLink: '/gate?id=developer-terminal-setup',
  }],
  trending: [],
  activeContent: {
    status: 'unlocked',
    contentId: 'hashwatch-video-demo',
    metadata: {
      title: 'HashWatch: Pay-As-You-Watch Demo',
      description: 'A 30 second walkthrough.',
      type: 'video',
      category: 'hashwatch',
    },
    unlockedContent: {
      kind: 'hashwatch-video',
      summary: 'A 30 second walkthrough.',
      videoUrl: 'https://hashpaylink.com/hashwatch-pay-as-you-watch-demo.mp4',
      durationSeconds: 30,
    },
  },
}

assert.match(hashpayStreamContextAnswer('Latest book', context), /Latest book:\n1\. Dracula/i)
assert.doesNotMatch(hashpayStreamContextAnswer('Latest book', context), /Pay-As-You-Watch Demo.*onboarding guide/i)
assert.match(hashpayStreamContextAnswer('Suggest a price', context), /Suggested Price/i)
assert.match(hashpayStreamContextAnswer('Improve my post', context), /Improve/i)

console.log('agent hashwatch denial filter smoke ok')
