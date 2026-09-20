# Pocket Scan and migration UI: local verification

## Local changes

- Add Scan beside Send on the balance card. Read QR frames on-device and stop the camera when review opens, the page closes, or the app becomes hidden.
- Accept supported HTTPS Hash PayLink POS and hosted-checkout links only. Resolve merchant identity, recipient, settlement mode, and saved NGN quote through backend records. Reject conflicting, unsupported, closed, mismatched, and expired inputs.
- Embed the existing Circle checkout in Pocket. Preserve Pocket PIN/biometric approval, keep the canonical network fixed, and reject changed hosted-checkout details rather than redirecting outside Pocket.
- Mark verified POS payer receipts as Purchases, suppress duplicate outgoing transfer rows, and retain merchant incoming records. Never infer ownership from an unverified payer label.
- Fix stale migration errors, duplicate/obsolete actions, completed-state preparation flashes, and the dismiss icon.
- Preserve unrelated local edits during the merge. No Play Store link is shown; the app is not listed yet.

## Evidence

- Browser smoke tests: migration confirmation, expiry, resume, and state transitions; QR image decoding; camera denial/retry/cleanup; checkout read-only lookup; native request rewrite including POST body, authorization and abort; mobile balance-card layout at 320/390/480 pixels.
- Adapter tests: scan resolver, isolated Scan GET route, verified payer registry filtering, owner-scoped purchase history and deduplication, existing hosted checkout and POS adapters, POS settlement route, fast migration receipt policy.
- Local web production build and Android-mode web build succeeded. Android assembleDebug succeeded.
- APK contents matched all 456 web-bundle files by SHA-256. Local test artifact: `.codex-temp/pocket-scan-local-debug.apk`.
- Full TypeScript check remains failing on existing diagnostics. Comparing diagnostic file/code/message with the saved pre-change check found no added diagnostics.

## Remaining end-to-end checks

The new Scan resolver is local only at this point. Real merchant testing on the phone requires the matching backend deployment and installation of the debug APK. Android camera permission, physical camera scanning, verified app links, PIN/biometrics, and an actual payment/payout have not been exercised by this automated local round. No payment, signature, approval, activation, or production deployment was performed during these local tests.
