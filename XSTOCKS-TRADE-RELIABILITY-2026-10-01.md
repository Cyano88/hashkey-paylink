# X Layer Trade web reliability checkpoint - 1 October 2026

## Verified live
Three controlled two-account NVDAx mainnet paths have completed: seller release, seller full refund, and participant-approved equal-share dispute settlement. Final split verified at block72114491: state8; funded shares2216229757026900; buyer and seller1108114878513450 each; escrow token balance0. Hash PayStream shows Dispute resolved and the final receipt link. This is evidence of these scenarios, not comprehensive production clearance.

## Hardening in this change
Terminal stock receipts read the recorded buyer/seller amounts and no longer call the issuer's current share-to-stock conversion. Held funds still require the current conversion and fail closed if it is unavailable. Receipt loading still depends on RPC, network/factory verification, and other contract reads.

Share planner tests cover before, at, and after missed-dispatch, seller delivery-dispute, and inspection-release deadlines. Buyer dispute access closes at inspection expiry. Participant API rejects reviewer resolution operations, including calls using the reviewer address.

UI/recovery tests cover failed signing, persist-before-broadcast, lost responses, reload, other-tab exclusion, exact-byte recovery, obsolete proposal retirement, signature intent validation, and request/session timeouts. These are automated tests, not new live transaction claims.

Hash PayStream contracts/test/XStocksTradeEscrow.test.ts:17 local Hardhat tests passed, including unauthorized reviewer callers, invalid amounts/evidence, terminal replay, exact dispatch/inspection boundaries, custody conservation, and payout rollback. No Solidity or deployed contract changed.

## Remaining live coverage
- Reviewer-decided resolution through the existing authority wallet. Read-only mainnet verification found contract code and Safe-compatible getThreshold=2/getOwners length=2. Both required signers must participate; customer credentials must never substitute for reviewer authority. Dedicated hosted reviewer tooling is not implemented.
- Missed dispatch refund and inspection timeout release with actual elapsed mainnet deadlines. Do not shorten or change accepted terms after funding.
- Controlled interrupted-session recovery in a fresh test, followed by transaction and receipt reconciliation. Automated recovery coverage does not prove every provider/device failure.

Keep Trade web in pilot scope until operational reviewer access and remaining release criteria are satisfied. Next funded reviewer test requires a fresh checkout with explicitly agreed allocation and both reviewer signers available. No funds were moved in this hardening pass.
