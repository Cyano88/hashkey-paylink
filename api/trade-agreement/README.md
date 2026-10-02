# Trade payment adapters

This directory holds physical-goods rules shared by Arc USDC and XLayer xStocks.
It does not implement Work delivery semantics.

## Implemented

- Shared accepted-listing validation and delivery/inspection windows.
- Existing stock parser and planner consume those shared rules.
- Stock terms and bindings retain their original serialized shape and hashes.
- Arc parser requires explicit chain 5042, official USDC, six-decimal precision
  and ordinary-token custody; it rejects stock/testnet combinations.
- Arc binding commits the chain, factory, parties, amount and accepted Trade terms.
- Arc production binding fails closed while the Trade release registry is null.
  The deployed service-agreement factory must never fill that registry.
- Pure binding construction is available for synthetic deployment rehearsal only;
  it does not authorize transactions or establish a verified deployment.

## Pending before enabling Arc

The Arc Trade factory and on-chain two-signer authority must be verified.
The hosted API, Circle participant-wallet/signing adapter, chain reconciliation,
reviewer adapter, receipts and Stream checkout/UI routing must then be connected
and exercised end to end. No new Arc HTTP checkout route is exposed by this increment.

The existing XLayer dispute test is running in a separate session. Its final
commit and evidence must be incorporated before the combined Trade baseline is
considered complete. Local stock reviewer regressions do not replace that test.

## Verification

- Shared/Arc terms and binding tests; focused TypeScript check.
- Production-source differential comparison: byte-identical stock terms and
  bindings for ordinary, smallest-unit and largest accepted input quantities.
- Existing hosted Trade, planner, reviewer and share-custody regression scripts.
- Stream: explicit rail/precision tests, typecheck, disposable PostgreSQL suite.
- Existing ordinary-token Trade candidate: 46 local contract tests on a Hardhat
  chain configured as 5042, with mock USDC. This is not an Arc mainnet fork or
  funded production test.

Production services, feature flags and contract deployments were not changed.

