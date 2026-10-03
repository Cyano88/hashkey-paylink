# Pocket clarity and interrupted-payment audit - 2026-10-03

Scope: source inventory across 135 Pocket TSX files, including 74 long static paragraphs; focused trace of stablecoin sends, XStocks send/trade/gifting, bills/bank recovery and shared confirmation/notification copy. This is not an end-to-end test of every live payment method.

Confirmed and addressed:
- Insufficient USDC errors printed arithmetic with six-decimal fees. The error now gives the additional USDC needed, rounded up to the next cent. Exact feeDetails and fee calculations are retained. The reported Ethereum example becomes: Add 1.54 USDC to cover this send and fees.
- Simplified instructions in send/receive, trade, marketplace, identity verification, support, bills and XPay bank checkout. Removed redundant marketplace routing, bills history and tab-selection paragraphs. Preserved network-only receive instructions, gas/fee review, refunds, expiry, verification and destructive-action warnings.
- XStocks pending receipt checks now run on return to the app and reconnection, as well as the existing timer. They check existing transaction hashes only; no approval or transaction is replayed.

Recovery findings:
- Stablecoin send attempts are persisted per owner and attempt; terminal results cannot regress. usePocketSendRecovery is mounted in CirclePocketApp, checks every 20 seconds and on focus/online, and pauses when hidden. Activity merges saved attempts with receipts. A fresh send does not clear previous attempt history.
- Bank recovery runs independently of its form and retains unresolved records. Bills and gift controllers also retain pending outcomes and reconcile; success requires evidence.
- XStocks persists attempts and known hashes, polls receipts every 15 seconds while its wallet hook is mounted, and treats an explicit wallet rejection as failed. Unknown submission outcomes remain pending.
- Correction after call-site audit: ordinary XStocks sends check signing/uncertainty and already permit independent known-hash sends after the current call returns. Trades, XPay and gifts use the broader hasStockSubmission guard. Those multi-step checks remain unchanged.
- A local attempt without a transaction hash can require an active wallet session/provider recovery. Full app-closed recovery is not proven for every rail. UI must not promise continuous device background work.

Outstanding before a whole-app release sign-off:
- Pixel walkthrough of changed screens and offline/reopen flows.
- Verify provider recovery for no-hash interrupted signing on both rails.
- Verify safe independent same-wallet sends before changing the XStocks lock.
- Dynamic provider errors and all route-specific states require further live validation; this source audit does not establish universal wording coverage.

## Shared signing guard follow-up

The submission helper now checks the persisted signing marker and pending no-hash attempts before creating a new attempt. The marker is acquired before notifying subscribers of a saved draft. This protects multiple hook instances in the same Pocket runtime. It is not a cross-device or cross-tab distributed lock.

Regression tests verify simultaneous hook calls cannot sign twice, other wallet scopes remain independent, a different send is allowed after a known hash, an unknown outcome is retained, and ordinary send/gift recovery does not resubmit. The stricter trade/gift checks and provider nonce behavior are unchanged.

## Swap, bridge and sheet follow-up

- Arc pending swaps now check their existing status while the screen is visible and online. Automatic checks do not open wallet authorization or execute a swap. Overlapping checks are suppressed; requests time out after 15 seconds. Known completed and not-submitted results clear the old pending view.
- A quote that expires during wallet preparation stops execution and requests an updated quote. Arc fee and minimum-received details remain available in an expandable row.
- Bridge confirmation compares the refreshed quote with the reviewed route, recipient, amount, total debit and minimum output. A changed route or worse cost/output requires review before wallet submission. Owner changes invalidate the displayed quote.
- Gift claim success uses the shared transaction sheet. XStocks send confirmation uses the common title and action spacing. Buy, sell, swap and bridge retain their existing layouts.
- This does not establish the cause of every reported stale wallet screen. A live reproduction of the user's exact Arc screen and interrupted no-hash provider recovery remains outstanding.
