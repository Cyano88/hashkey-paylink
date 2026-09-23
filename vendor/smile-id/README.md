# Smile ID V12 presentation shell

Upstream HTML: https://cdn.usesmileid.com/inline/v12/biometric-kyc.html and https://cdn.usesmileid.com/inline/v12/doc-verification.html
Source project: https://github.com/smileidentity/web-client (MIT; see LICENSE).
Captured 2026-09-23. Relative SDK resources are resolved against the upstream V12 directory.

Pocket uses API V3 tokens, BVN (not BVN_MFA), NIN_V2, and document verification. Tokens are minted on the server and bind product, country, ID type where applicable, callback URL, and the internal reference. The callback proof is provider-only, absent from browser configuration and JWT payload. Signed callbacks additionally require a matching authenticated job status, product, owner reference, and identity evidence. Browser Result events only mark submission; they cannot approve verification. Existing V1 records and callback handling remain intact.

The camera uses provider-owned on-device face/smile detection. It samples a neutral face then pauses at the smile checkpoint until smiling resumes. Strict mode is disabled for this smile flow; agent mode and legacy timed fallback remain disabled. Model failure offers retry and close. V12 owns the selfie review, retake, repeated-confirmation guard, signing and multipart upload.

Presentation changes retain the full-height viewport, neutral inputs, responsive camera and explicit close button. Camera thresholds and verification decisions are unchanged. The isolated API-origin frame uses no-store and sends configuration through a source/origin-checked bridge; tokens never appear in URLs. CSP permits the official Smile CDNs, model and signing hosts.

Tests: pocket-kyc-v3-smoke.mjs covers ownership, bound tokens, authenticated callbacks, identity pairing and production eligibility. pocket-kyc-smoke.mjs retains legacy coverage. Frame, active-capture, review and model-failure browser tests use synthetic landmarks/video and block identity submissions.
