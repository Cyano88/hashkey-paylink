# Circle cross-bridge approval recovery - 2026-11-07

## Observed incident

Pixel showed SOL on Solana -> USDT on Base, with the confirmation sheet stuck at Bridging. Read-only durable-journal inspection found operation 84f87c16-df32-4cd5-8bde-cf216e9d0706 in pending state, with a challenge reference and prepared Solana transaction, but no signed transaction or source hash. This is evidence of no server broadcast through this route. No quote token, credential, signing material or user account identifiers were printed. No transaction retried, cancelled or submitted during diagnosis.

The exact provider/SDK reason the original Circle UI did not appear is not recoverable from the available logs. Do not claim a provider outage or successful approval. The confirmed application bugs are: initial error handling turns unsigned pending challenges into processing; generic recovery preserves that mapping; and cross-bridge retry only checks status instead of reopening the saved Circle challenge. Progress then reports Bridging despite no signature.

## Changes

- Classify an unsigned Solana cross-bridge challenge as awaiting approval during normal recovery. For EVM Circle, do so after a recorded approval failure, without inferring that a missing hash alone proves no submission.
- Initial Circle approval errors retain the recoverable approval/review state instead of hiding it as processing.
- Explicit retry checks the saved operation before doing anything. It reopens only its existing Circle challenge, persists signed Solana bytes before relay, and never prepares/submits a second bridge. Account-change checks remain before/after signing.
- An explicit retry of an expired unsigned Solana quote requests atomic cancellation of the unsigned reservation. No automatic replacement, signing or transaction is performed. Already signed bytes are replayed through the existing idempotent relay path only.
- Awaiting approval uses Confirm bridge, not Bridging. Corrected the SOL type passed to the existing Solana approval adapter.

## Verification

Focused TypeScript and source guard passed. Recovery fixture covers Solana, Base, Arc, Ethereum, Arbitrum and Polygon; checks exact saved challenge, one signature, signature persistence before relay, expiry, account isolation and no duplicate dispatch. Existing panel/browser regressions passed all nine source/asset scenarios including BNB and X Layer. Added failed-SDK-opening browser scenario verifies that an unsigned Circle failure presents an enabled confirmation action rather than Bridging; Solana USDC and SOL both passed. No backend changes required; server journal evidence remains authoritative.

Live reopening of Circle still requires the user's approval interaction. Existing unsigned reservation was not silently removed. The fix does not claim to eliminate all provider iframe failures; it makes them recoverable and prevents false submission progress.

Final verification: all nine updated browser source/asset scenarios passed, including the failed-opening checks for each Circle case. Focused typecheck and native source guard passed. EVM approval-completed/no-hash recovery now supplies the Circle session to status and is covered by a regression assertion; newly returned signature/approval evidence cannot be reclassified as awaiting approval.

Built and installed pocket-circle-bridge-approval-20261107.apk on Pixel 5A160DLCH006VM. SHA256 1AABDFE6DCAD9DC89E39EA2E33CD516378CBB5A23715338C34E0B819E69D878D. All 1870 packaged web assets match dist. Source archive contains 47 files. Live launch, Home, Swap and Bridge navigation verified after installation. No live approval, retry, cancellation or transaction performed. App restart opened the normal empty bridge form; the old operation sheet was not live-reopened, so its post-install recovery presentation remains fixture-verified only. Backend remains 1e28e0f77; no server deployment required.

## Second consistency check

Pixel at 10:47 showed a different route, SOL to Arbitrum, in Bridge not sent state. This screen alone does not identify the underlying SDK/provider error. Read-only journal lookup still found the original SOL pending reservation unsigned and without source hash.

Found and fixed a further error branch: when Circle approval throws and the subsequent status request also fails, preserve the original approval error and transition to awaiting approval (known challenge) or needs review (unknown challenge), preserving signed/submitted evidence. Never dispatch again in this catch. Previously this branch silently left the original preparing/processing state. Owner check is retained before saving.

Expanded panel browser scenarios to simulate both a successful status lookup and an aborted status lookup after failed Circle opening for Ethereum, Arbitrum, Base, Solana USDC, Solana SOL, Polygon POL and Arc EURC. All nine source/asset scenarios passed, including unchanged Privy BNB/X Layer regressions. Shared recovery suite, focused TypeScript, source guard, approval opening timeout, overlay/surface and installed SDK session replacement/handshake tests passed. These SDK tests use fixture authentication and do not constitute a live approval on each chain.

Second build installed successfully on Pixel: pocket-circle-bridge-recheck-20261107.apk, SHA256 AF1787EB8C477C9E800B9285553E1CE0EDDA37770C1378EDB60B902A7C585659; all 1870 packaged web assets verified, 47-file source archive saved. No backend change/deployment and no live transaction during recheck.

## Repeated no-popup incident: expired unsigned reservation

Pixel at 11:00 showed SOL to Arbitrum USDC, Bridge not sent. Durable journal read confirmed original operation 84f87c16-df32-4cd5-8bde-cf216e9d0706 remains pending, expired, with prepared raw Solana bytes/challenge but no signed bytes/source hash. Recent prepare logs completed preflight, but no replacement reservation exists. Existing reservation guard rejects this pending row indefinitely; the client then sees the new attempt as not_submitted. Earlier native recovery fixes did not resolve this server blocker.

New reservation acquisition now atomically retires only matching-owner/matching-wallet expired unsigned raw Solana preparations. It retains records as cancelled; it does not delete history. Signed bytes, hash/provider transaction references, unexpired work and all EVM reservations remain protected. Cancellation and replacement share the database transaction; failure rolls both back. Late signatures cannot move the cancelled record to submitted. This uses the existing raw-Solana property that Circle does not broadcast, and the server relay checks state before persisting a signature/broadcasting.

Reservation regression tests passed including rollback and late terminal writes. Full cross-bridge TypeScript and operation/Solana regressions passed. No live transaction or journal mutation was performed during diagnosis; replacement occurs only on a new user-authorized preparation.
