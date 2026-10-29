# Pocket documentation expansion — 2026-10-29

## Scope
Expanded Pocket documentation without changing payment or app code. Added Stocks, Earn, eSIM, bills/local transfers, gifts, XPay/terminals, Collections, and account/support guides. Preserved three documentation groups and developer bank-onboarding boundary.

## Evidence
- Read-only Pixel inspection via ADB, package com.hashpaylink.pocket. Services visibly exposes XPay, Bills, eSIM, Earn and Stocks.
- Earn asset panel shows USDC/USDT0, Aave, X Layer, variable APY, Add money and Withdraw. Removed the initial source-only unavailable claim before publication. No supply/withdrawal was submitted.
- eSIM shows Countries/Regional, destination search and My eSIMs. No purchase made.
- Request shows Pocket ID/Link. XPay shows receiving entries and payment history. Native Collections creation entry was not located in these inspected screens; do not claim native creation was verified.
- Web source contains collection management, history and close actions. Dedicated Collections documentation restored; no legacy manual-address checkout creation instructions published.
- Installed Pixel navigation differs from this release source. Do not infer installed bundle version from the web repo or call screen inspection a funded end-to-end test.
- Screenshots saved locally under output/playwright/pixel-*-docs-evidence.png; private account screenshots are not committed.

## Validation
- Playwright actual docs and console smoke: 22 routes at 390/1280, builder guide 320/390/1280 light/dark, mobile navigation, retired-route redirects, bank boundary, no overflow or page errors. Passed.
- Visually reviewed Pocket overview mobile screenshot, including separate Collections link.
- Production build and deployed verification recorded after completion below.

## Still separate
Native Collections entry-point reconciliation; funded Earn/eSIM/gift tests; bank/AML/provider and daily-limit approval. This documentation release does not establish those outcomes.
- Production Vite build: exit 0 (existing dependency annotation and bundle-size warnings). Builder integration helper smoke passed; no real APIs called.
- Deployed commit 32112915c42f4a12b7012156893dd8dfc4422034 via dep-dbhs5tss728c73cpso70; live 2026-10-29T22:10:19.254851Z. Live Playwright passed all 22 pages, three groups, retired redirects, Earn content, Collections page, mobile navigation, no overflow or page errors.
