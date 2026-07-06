import assert from 'node:assert/strict'

const { isBadHashpayStreamMediaInspectionDenial } = await import('../api/agent-ask.ts')

const badAnswers = [
  "I don't have access to the actual video content or transcript for that HashWatch tutorial. I can see you're browsing HashpayStream with HashWatch content available, but I can't watch or analyze videos directly.",
  "I can see you've unlocked the video, however I don't have access to the actual video frames or content to walk you through it step by step.",
  "Frame-by-frame video analysis isn't something HashpayStream currently offers; use a dedicated video analysis tool.",
]

const acceptableAnswer = 'Your unlock is verified, and ZeroScout inspected the media URL. Here is the video breakdown and main learning points.'

for (const answer of badAnswers) {
  assert.equal(isBadHashpayStreamMediaInspectionDenial(answer), true, answer)
}

assert.equal(isBadHashpayStreamMediaInspectionDenial(acceptableAnswer), false)

console.log('agent hashwatch denial filter smoke ok')
