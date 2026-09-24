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
