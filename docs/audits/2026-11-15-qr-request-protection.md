# QR request protection and Pixel update

QR endpoints now share separate authenticated account buckets: 20 write requests and 120 read/status requests per minute. Keys come from cryptographically verified Privy identity, never body IDs, raw tokens or decoded-but-unverified claims. Rotating a token or moving to another IP does not reset an account allowance. Existing payment handlers retain their own authorization and ownership checks.

A broader 1,200-request/minute IP bucket runs before authentication to bound abusive traffic and authentication work. Public QR discovery and unsigned quotes use that IP protection. These technical buckets are separate from the daily purchase ledger and retain the existing in-memory, per-process fixed-window model; they are not a distributed cross-replica limiter.

Wired shared protection into unified QR, X Layer QR and QR bank endpoints, NG POS discovery/quote/payout preparation, and POS-bound Solana transaction building. Other endpoints retain their existing limiters. Circle payment execution already has its separate wallet/session authorization boundary and was not previously behind the shared 20-request IP limiter.

Tests passed for shared-Wi-Fi isolation, token/IP rotation resistance, body identity spoofing, invalid/missing credentials, separate status allowance, reset, public discovery and the pre-auth IP ceiling. Changed limiter TypeScript diagnostics passed.

Pixel: the connected device's existing installation uses the Android debug certificate. The upload-signed release APK was safely rejected by Android. A matching debug build was installed with `adb install -r`; no uninstall or app-data clearing was used. Device inspection found a stale personal-transfer label in previously packaged assets. The final rebuilt APK was installed and visually checked against the live API; it shows Personal bank transfers and the correct Advanced tier. See the personal USD limits audit for the subsequent approved policy and live device results.

Rate protection commit 944cb52c969e3a3da04e6f75ec311509ed11b30d deployed as dep-dbsttfff3r2c73bcce6g and was confirmed live at 2026-11-15T16:38:18Z. The later personal-limit deployment includes this protection. No live payment was made in this validation.
