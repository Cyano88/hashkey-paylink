# Swap and bridge crypto route expansion ? 2026-11-05

## Delivered implementation

The canonical crypto bridge catalog now includes native SOL and Polygon POL: 26 network assets and 586 cross-network directional pairs. Native SOL uses the pinned Relay depository instruction, sponsored fees, exact lamport simulation, finalized source/destination evidence, and rent-aware reimbursement. Polygon native delivery uses finalized trace evidence.

X Layer USDT, USDe, USDG and OKB convert to USDC before bridging. Polygon POL and ETH from Ethereum/Base/Arbitrum to Arc EURC use a validated source USDC conversion. The combined plan binds owner, amounts, minimum output and expiry, charges one reimbursement, proves the USDC deposit, and supports USDC refunds and expired-review recovery. No unknown refund assets are accepted. Refund ownership is explicit. Ethereum swaps request direct routes to avoid unsupported intermediate tokens.

The Android token selectors and review notices include native SOL/POL and generic source conversions. Existing Circle-first portfolio balance display and decimal standards are retained.

## Verification

Live read-only provider quote captures cover 586 unique directional crypto pairs at the sampled amounts. The first unauthenticated sweep encountered rate limiting; a paced authenticated sweep completed the missing routes. Direct bridge leg validation is supplemented by combined X Layer, native ETH and all 23 POL source conversion captures. Quote coverage does not guarantee every amount or future liquidity.

Evidence resides locally under output/bridge-swap-audit-20261105: coverage-summary.json, remaining-pair-validation.json, native-pair-validation.json, pol-conversion-coverage.json, final-regression.json. Saved public-wallet quote fixtures support reproducible mutation/proof tests. No customer keys or provider secrets are included.

Final backend regression: 36 scripts passed; scoped TypeScript passed. Additional ETH/POL combined proof regression passed. Native layout, review, panel and selector suites passed, as did cancellation, feedback, presets and recovery checks. Android release build passed; all 1,867 packaged assets matched the source build.

## Release boundaries

Signed device artifact: pocket-bridge-expanded-pixel-20261105.apk.
SHA256: 9E92941620632DE3C12A331D6CEFD28E7D53F42E6E34B8FD7BA868D8D7443B97.
Deployment and installation evidence is recorded separately after release. No funded bridge or swap was signed during this audit. Synthetic proof tests are not real settlements. Tokenized stocks and yield-position tokens are not included in this 586-pair bridge coverage.
