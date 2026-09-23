# Smile ID presentation shell

Upstream HTML: https://cdn.smileidentity.com/inline/v11/biometric-kyc.html and https://cdn.smileidentity.com/inline/v11/doc-verification.html
Source project: https://github.com/smileidentity/web-client (MIT; see LICENSE).
Captured 2026-09-23.
Original biometric HTML SHA-256: 66671ef42ea24bb42808ffac665b4d95f1518da70f40426aa2052a7cc38282f8
Original document HTML SHA-256: e63f284ab38ced6213f569ea53f21dd716b19aa18d303cd4dca3047d7de2cf69

Use v11 to retain existing v1 tokens, BVN_MFA, NIN_V2, document jobs and signed reconciliation. V12 removes BVN_MFA and is not a drop-in upgrade.

The default v11 camera uses on-device face/smile detection. It first samples a neutral face, then pauses at the smile checkpoint until the smile returns. Strict mode uses head-pose challenges instead, so Pocket deliberately sets use_strict_mode=false for the requested smile flow. allow_agent_mode and allow_legacy_selfie_fallback remain false. Model failure offers retry and close, never timed legacy capture.

Presentation changes: safe full-height viewport, neutral consent inputs, responsive camera width, and a close action while the model loads or fails. Camera thresholds, biometric inference, capture/submit pipeline and provider verification decisions are unchanged. Browser completion is an upload hint, never approval.

The shell stays isolated on the API origin. Tokens are delivered through the source/origin-checked parent bridge, never in URLs or HTML. Its CSP allows the official web-models.smileidentity.com and secure.smileidentity.com scripts needed for model loading and request signing.

Regression checks: pocket-smile-active-capture-browser-smoke.mjs exercises the real SDK with synthetic landmarks/fake video and blocks submissions; pocket-smile-model-failure-browser-smoke.mjs checks unavailable-model recovery without legacy fallback; existing frame/kyc tests verify boundary and approval rules.
