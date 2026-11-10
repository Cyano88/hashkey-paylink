# Seller verification loading and expired links — 2026-11-10

The internal seller link issued earlier expired at 2026-11-10 17:01:49 UTC (18:01:49 Africa/Lagos). The user opened it after expiry. The generic invalid-or-expired error and Try again button gave no useful recovery path. The standalone seller page also displayed plain restoring/waiting text rather than the existing portal shimmer.

Changes:
- A seller-form skeleton reuses developer-shimmer CSS for auth/session loading and the route's Suspense fallback. It has an accessible status label and honors reduced motion; no dashboard skeleton or plain restoring text appears.
- Expired known sessions return an explicit expiry message. Expired/unavailable links hide the retry CTA and explain how to obtain a fresh link; changing accounts remains available.
- Hash changes replace the in-memory session token, clear stale UI, and invalidate pending responses. Reopening the same expired link runs inspection again instead of leaving an indefinite skeleton.

Validation: seller identity/setup-gate fixtures passed; focused TypeScript passed (36 files). Browser fixtures cover six viewport/theme combinations, actual shimmer animation and reduced motion, expiry without retry, same-tab same-link and replacement-link handling, consent, bank retries and layout. Loading screenshot inspected at 320 px dark. Production build result is recorded by the deployment checks; these tests do not prove a funded bank payout.

Bank money-movement flags are unchanged and remain disabled. A new one-hour internal seller session is issued only after the corrected deployment is confirmed live.
