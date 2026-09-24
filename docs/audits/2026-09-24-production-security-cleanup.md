# Production cleanup and rotation readiness — 2026-09-24

## Reviewed release scope

Based on verified live commit 955455664b784088df34a2fd6a3f50c2615bff3e. Prepared in an isolated checkout; unrelated Pocket UI, Ethereum/Polygon enablement and monetization changes excluded.

- Retire label-based paid `/api/agent-ask` with HTTP 410 before archive reads or model calls. Public event IDs and payer labels are not access credentials. In-repo AgentHashPanel and embedded StreamAgentHash select `helper-free`; that mode retains its existing identity checks. Dedicated Pocket assistant and historical archive receipt lookup remain intact. This does not claim browser helper sessions prove a paid or verified identity.
- Preserve active rate-limit records when the 10,000-bucket capacity is reached. Reject new untracked callers until capacity expires instead of evicting another caller's unexpired limit. Existing callers retain remaining allowance. This remains per-process protection, not a distributed limiter.
- Forward the validated EVM payment idempotency key to Circle. This fixes handler retries using a new provider key; it does not provide durable client-intent reconciliation or deduplicate newly generated client keys.
- Upgrade qs 6.15.3 to 6.16.0 and Hono lock resolution 4.13.2 to 4.13.9. No wallet SDK major upgrade. qs hostile constructor.isBuffer round-trip regression passes.

## Live rotation inventory and configuration

- Inspected direct environment names/equality groups across 16 Render services. Environment-group listing returned no groups for the accessible account. Values were compared in memory and never included in reports.
- Four dedicated Alchemy backend apps remain restricted to their expected network and two IP allowlist entries. Five previously retired apps remain absent. Absence is not a fresh rejection test of each old key. No new Alchemy rotation in this pass.
- Base, Arbitrum, Arc, Polygon and Solana configured origins returned HTTP 200 with expected chain/genesis identity from Render SSH. Read success does not establish transaction execution or sustained capacity.
- Polygon RPC is shared with PolyDesk and not owned by the currently accessible Alchemy account. Provider ownership must be resolved before coordinated replacement/revocation.
- Other shared credentials include VTPass, PolyDesk service tokens, streaming credentials and relayer signing keys. Fund-controlling keys and data-encryption keys require explicit migration of their obligations; do not treat them as disposable API credentials.
- Production had no POCKET_PIN_PEPPER and used PRIVY_APP_SECRET as its PIN hash pepper. Added POCKET_PIN_PEPPER with the same existing derivation key and verified exact readback without printing it. This is a compatibility-preserving configuration separation, not generation of a new pepper or rotation of Privy. Existing PIN records are unchanged. Activation requires a service restart/deploy.
- Support cases use Privy for staff authentication, not support-message encryption. Earlier concern about support-data encryption was disproven by source inspection.
- POCKET_SWAP_QUOTE_SECRET is already configured with sufficient length. Provider secrets still require provider-side issuance/revocation; no completed Circle/Privy/OKX rotation is claimed.

## Validation

Passed in isolated release source using the existing installed dependency tree (actual qs and Hono versions checked): rate-limit churn/expiry, legacy paid-access rejection, EVM retry key on the three deployed EVM rails, archive handler compatibility/error redaction, Pocket payment security, dedicated assistant adapter, legacy helper identity/actions, PIN key separation, qs exploit regression, local Circle CLI calldata and SPA router security. No funds moved.

Fresh independent npm ci could not complete because C: ran out of disk space. Removed only that newly created partial installation after checking its absolute path. Tests use a junction to the existing dependency tree; npm's stale hidden installed lock metadata was rebuilt, and the two patched versions were read from actual package files. A fresh production lockfile install/build remains required before declaring release successful. No clean whole-repository typecheck is claimed.

## Remaining production gates

- Finish provider credential issuance/cutover/revocation with ownership and all consumers confirmed; preserve PIN pepper before Privy rotation. If any retained cryptographic key is compromised, preserving it is not remediation: use a versioned re-key/reset plan.
- Complete full-history and deployed web/APK secret scans. Current exact-live-value scan covered 752 tracked working-tree text files; only the public Arc RPC URL matched. This is not comprehensive secret detection.
- Initial production dependency audit: 59 findings, including 8 high, not 59 independently exploitable endpoints. High findings include the transitive Anchor/toml chain; remaining elliptic, uuid, decode-uri-component, stream-json and esbuild findings require compatibility/reachability review. Do not blanket-upgrade wallet SDK majors.
- Complete prior developer/payment proof audit release, clean typecheck, durable recovery/backup checks and controlled transaction verification.
- Approved 25-bps monetization remains a separate unfinished implementation; no new fee activated here.

References: https://github.com/advisories/GHSA-4mjr-xmp4-gh2g ; https://github.com/advisories/GHSA-g6gw-c38x-mqfc ; https://www.alchemy.com/docs/how-to-rotate-api-keys

## Follow-up: Pocket is the only preserved assistant

User explicitly retired every experimental paid assistant and designated Pocket Agent Hash as the only assistant product to preserve.

Removed archive-backed paid authorization code, Agent Hash Pro treasury/payment-link generation, upgrade pricing and frontend subscription prompts. `/api/agent-ask` now accepts only `helper-free` with exact `helperMode: circle-pocket`; all other assistant modes return 410 before compute. Removed the experimental StreamAgentHash component and its layout launcher. Pocket's existing shared panel, task preparation, support case access, helper-session checks and dedicated assistant endpoint remain. Historical receipts and developer payment APIs remain separate.

Mocked end-to-end handler test confirms authenticated Pocket responds, missing identity rejects, all retired modes reject, and no paid upsell or archive authorization remains. Generic assistant helper functions that Pocket shares are retained; they are not independently exposed assistant products.

## Operational progress

First security release c6639be9819523426196207f92d0897454b8a00c deployed successfully as dep-daqavilg1s2s73fqn0jg. Render now uses the repository's `npm ci --include=dev` source-build command; removed the unpinned global Circle CLI install. The successful production build closes the fresh lockfile-install/build check for that commit.

Created dedicated Alchemy app ccyw9vctixzexwon for Hash PayLink Polygon mainnet (137), node-api only, restricted to the verified Render egress ranges. Direct probes from Render passed chain ID, block number and native-USDC contract code. Updated only Hash PayLink's POLYMARKET_RPC_URL and verified readback. The old shared key remains for PolyDesk; it cannot yet be revoked because that consumer and provider account have not migrated. New runtime activation is checked after the follow-up deployment.

## Retired offer collection guard

Old `agent-hash-pro-*` subscription IDs and `src=telegram-helper` links are rejected by a checkout wrapper before the active payment component mounts. Existing merchant/service/POS/bank/wallet-funding links remain unaffected. Dedicated policy regression and TSX transform passed. Historical receipt storage and generic developer payments are not removed.

Dependency audit after the qs/Hono patches reports 55 findings (18 low, 29 moderate, 8 high), down from 59; no claim of a vulnerability-free dependency tree.

## Final live verification (05:25 UTC)

- Final deployed application commit: 830f09ed434c6de1b027ce41e8d4e015ef04bdd5; Render deployment dep-daqb5gt03fqc73dbvkf0 is live.
- Confirmed runtime commit, dedicated Polygon endpoint matching current Render configuration, and configured preserved PIN pepper through Render SSH. Installed qs is 6.16.0 and Hono is 4.13.9.
- Scanned 392 deployed public text assets for exact matches to the selected runtime private credential values: no matches. This is a bounded current-value scan, not proof of no historic/unrecognized secrets or APK exposure.
- Public checks passed: health 200; paid and non-Pocket experimental assistants 410; Pocket compatibility and dedicated assistant routes reject missing identity with 401; malformed historical archive lookup returns 400. Render loopback and public-origin health/retirement checks also passed. Earlier probes during rolling deployment returned 502 and then recovered; no clean zero-downtime claim.
- Browser verification of a syntactically valid old subscription link shows only the retirement notice and Open Pocket link, no payment action. Screenshot: output/playwright/retired-assistant-checkout-20260924.png.
- Full provider-key rotation is NOT complete. Polygon replacement is active for Hash PayLink, but the old shared credential remains in PolyDesk. Privy/Circle/OKX issuance/revocation, fund-key migration where needed, remaining dependency findings and prior release-readiness gates remain open.
- Future releases must include this security branch's commits; deploying an older branch would regress these fixes. Original working-tree changes were preserved.
