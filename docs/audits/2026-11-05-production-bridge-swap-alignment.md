# Production bridge and swap alignment audit — 2026-11-05

## Confirmed production failures and fixes

The Base USDC ? Arbitrum ETH bridge `1ac170a0-44fe-455c-bfac-d67fd894777c` remained source_confirmed even after destination delivery. The production bridge-proof RPC adapter rejected eth_getTransactionByHash, although native delivery verification requires it. Commit 88c36c674c4fa22a568406c80e7aee77e1558e20 adds this read to the strict proof allowlist. Hash validation, finality and canonical/reorg checks remain. Tests now exercise the production adapter rather than only injected RPC fixtures.

Render deployment dep-dbm6t3t9el5s738tbivg became live and health returned HTTP 200. The worker automatically completed the existing operation without resending it or editing its state manually. The Pixel receipt showed Completed and 0.000621605 ETH received.

A second live defect was verified during the Pixel balance audit: Circle returned 0.000018854450176871 ETH with updateDate 2026-11-05T09:24:09Z while the same Arbitrum address held 0.000640459497824501 ETH on-chain. A successful Circle response alone therefore cannot establish display freshness. The shared display readers now compare the provider token snapshot with the durable, verified cross-bridge receipt for that owner, network, wallet and asset. An older or missing snapshot uses the existing RPC fallback; unrelated assets remain Circle-first. Journal lookups coalesce for 15 seconds; existing 30-second balance caches and token retry cooldowns remain. No receipt amount is added to a balance, and settlement/payment authorization is unchanged. A provider timestamp before proof verification conservatively retains fallback until the provider publishes a newer snapshot.

## Native app and Pixel verification

Installed without clearing app data: pocket-production-receipts-20261105.apk, SHA256 166AAD709390C94172281923225F705F142C70989F6884E9455BBC2C9490FBE3. All 1,868 web assets matched the native build. This is the authorized Pixel build, not a public store rollout.

- BNB bridge Activity uses BNB artwork instead of the swap arrows. Native/stable bridge artwork also covers ETH, POL, SOL, OKB, EURC, USDG and USDE.
- The completed BNB ? SOL receipt visibly shows the BNB logo, Bridge label, source/destination networks and received SOL.
- Live Arbitrum USDT ? Base ETH quote reached the review sheet: 0.497134 USDT input, approximately 0.00019635 ETH output, muted USD equivalents, 0.03 USDT fee and 0.53 USDT total at display precision.
- Token pickers loaded balances without an unavailable label during these checks. The stale native balance discovered separately above is not treated as a passing result.
- No new transfer was confirmed or signed by this audit. Fixture route coverage is not evidence of funded execution on every route.

Native source snapshot: pocket-play-update-20261101/native-release/production-alignment-source-20261105.zip. Screenshots and build manifests remain local because they contain user account information.

## Fees and balance architecture

Saved production cross-bridge quotes include 10 bps platform fee and separate reimbursement and platform recipients. The USDC ? ETH operation had 1.530147 USDC principal, 0.009998 USDC reimbursement and 1.540145 USDC total. Its platform fee was 1,530 source units. The completed BNB ? SOL operation had principal 1369849766322470 wei, reimbursement 36657869370333 wei and total 1406507635692803 wei; platform fee 1369849766322 wei. These are saved execution/quote values, not independent proof of realized revenue collection.

Home, Swap and Bridge use shared wallet/native/EURC balance hooks and coalesced caches. Circle supplies Circle wallet display balances first; BSC uses its shared OKX indexed reader first. RPC remains necessary for fallback, transaction validation and settlement proof. The new stale-snapshot guard is in the shared server readers, not a selector-only replacement.

## Validation and limits

Passed production-adapter native-delivery fixtures for Ethereum/Base/Arbitrum/Polygon and direct-client BSC/X Layer coverage; proof budgets and canonical/reorg checks; targeted TypeScript. Passed reimbursement fixtures for 26 network/assets, platform-fee fixtures for 586 cross-asset pairs, eight native/stable reimbursement routes and BSC swap fixtures. Native Activity and receipt tests passed, including narrow 320/426 pixel receipt layouts.

New freshness regression covers the observed native discrepancy, cached fallback, provider catch-up, absent rows, owner/network/wallet/token isolation and token refunds. Existing native, Circle token and USDT display regressions are retained.

Open policy: the older Arc swap path has no explicit reimbursement transfer or configured platform fee. A pricing decision is pending between bridge-style cost reimbursement plus 0.1% platform fee and continued sponsorship. This audit does not silently introduce new charges or claim all swap fee policies are aligned. Testing does not establish universal absence of flicker or funded execution across every pair.
