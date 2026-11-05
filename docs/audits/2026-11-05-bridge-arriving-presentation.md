# Shared bridge arrival presentation

The Pixel showed `Funds received · confirming` for the user's Arbitrum USDT to BNB bridge, operation dae24d47-86fa-4fea-9d3b-1222ee00c64c. Production independently verified destination delivery of 0.001391136620359824 BNB; the operation remained submitted pending source verification. A read-only Arbitrum RPC check confirmed successful source execution, with its inclusion block 2433 blocks ahead of the finalized head at the time of inspection.

Removed the cross-bridge-specific `Transfer received · confirming` and `Funds received · confirming` presentation branches. Both observed and verified delivery now use the shared `Arriving` stage. The existing terminal `Bridge successful` receipt remains gated on completed settlement. Cash funding, refund, failure, recovery and ledger behavior are unchanged. This presentation change does not shorten chain finality.

Native browser regression passed for arrival without early success, no retry after delivery, normal completion/failure receipts, durable dismissal and no recovered-history popup. Targeted native TypeScript passed. No payment was signed or submitted by the assistant.

Android assembleRelease passed. Installed with adb install -r, preserving app data: pocket-bridge-arriving-20261105.apk, SHA256 757BFC14A242D0E6BBDA71A676B5B6B80F65CCBD7814208707E55BAC8D9C1478. All 1868 web assets match dist. Native source snapshot: native-release/bridge-arriving-source-20261105.zip in the native workspace.
