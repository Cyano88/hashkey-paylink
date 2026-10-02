# Arc USDC and XLayer xStocks Trade expansion

Status: integration audit and implementation scope. No production behavior changed. This is not a completed Solidity security audit or an Arc financial lifecycle test.

## Verified baseline

Read-only production inspection on 2026-10-02:

- Hash PayLink runtime commit: `3f47919fb6be011fdd1f494544fa5a51f5faa91f`.
- Hash PayStream runtime commit: `fe67705c210b1f993aa8ddaf16a033f2cd06d05f`. The inspected local Stream checkout also includes test-only commit `25af208`; it is not the production commit.
- Stream's deployed hosted Trade store explicitly rejects everything except `XLAYER_ASSET` with `XLAYER_TOKENIZED_ASSET`. Deployed legacy settlement-wallet schema still allows only chains 5042002 and 196.
- Hash PayLink has all five Arc execution switches false: agreement activation, reconciliation, lifecycle worker, operator worker and payer lifecycle. Its Arc activation project allowlist is absent.
- Stream has Trade and hosted Trade enabled. Its local Arc agreement/payer flags are true, but those flags do not override Hash PayLink's disabled execution gates.
- Fresh Arc RPC reads at block 23951673 returned chain 5042. The pinned factory runtime hash matches `0xbe90f73ff04b1d8416071c4e22bab99acaa4b473c3be5c093a94a363b44abd62`; factory USDC and operator match the release registry. The operator has no bytecode at that block. It is not an on-chain Safe contract. USDC does have bytecode at that block.
- Official network documentation independently identifies Arc mainnet as chain 5042: https://docs.arc.io/arc/references/connect-to-arc.

## What exists and what is missing

| Area | Evidence | Consequence |
| --- | --- | --- |
| Arc service agreement infrastructure | `api/arc-mainnet-boundary.ts`, `api/arc-agreement-config.ts`, activation/operator/lifecycle workers and isolated mainnet store keys | Reuse identity, configuration, verified funding patterns, reconciliation and operational controls where applicable. Infrastructure exists; this does not establish Trade parity. |
| Deployed Arc escrow | `contracts/contracts/ArcAgreementEscrow.sol`: fixed/progressive/milestone schedules; operator `releaseStep` and `cancelByOperator`; payer cancellation/expiry refund | No dispatch, receipt/inspection, on-chain disputed state, or arbitrary split resolution. Cannot represent the existing Trade protections by relabeling a fixed-unlock agreement. Factory and escrow operator addresses are immutable. |
| Hosted xStocks Trade | `api/xstocks-agreement/trade.ts`, `reviewer.ts`, `planner.ts`; Stream `api/trade-community-store.ts:117` | Accepted listing snapshot, separate buyer/seller identities, immutable reservation and share custody already exist. Reviewer code is tied to XLayer, xag IDs, stock custody and its Safe transaction domain. |
| Stream checkout adapter | `api/trade-hosted-checkout.ts`, `src/lib/tradeCheckoutLink.ts`, `src/components/TradeCheckout.tsx` | Endpoint, response token checks and checkout URL allowlists are xStocks-specific. Arc needs an explicit adapter and independently validated response. |
| Existing USDC Trade choice | Stream `src/lib/tradeAgreement.ts`, `TradeAgreementCard.tsx`, `api/trade-wallet-verification.ts`, `trade-schema.ts`, `trade-escrow-binding.ts` | UI accepts USDC terms, but hosted checkout rejects them. Legacy wallet binding points to Arc testnet; changing its chain number would not establish mainnet ownership or valid escrow. |
| Ordinary-token Trade contract candidate | Stream `contracts/src/TradeEscrow.sol`, `TradeEscrowFactory.sol` | Already contains dispatch, inspection, mutual settlement and `resolveDispute(buyerAmount,evidence)`. A reuse candidate for Arc USDC, not a verified Arc deployment. Do not substitute the rebasing xStocks share-accounting contract for USDC. |
| Arc wallet adapter | Stream `api/hashpaylink-arc-wallet.ts` | A pinned Hash PayLink Arc wallet API adapter exists. Trade still needs verified mainnet buyer/seller wallet binding through the hosted identity model. |

## Product flow

One Trade product and lifecycle:

1. Seller proposes item and delivery terms and selects **USDC · Arc** or **xStocks · XLayer**. For xStocks, choose an allowed stock and exact quantity.
2. Show the payment asset/network and exact item plus delivery amount to both parties. Currency/network changes require a new accepted offer. No automatic conversion or silent fallback.
3. Both parties connect their Hash PayLink accounts. Verify each participant's wallet on the selected chain.
4. Reserve the accepted immutable offer before creating hosted checkout. Retries reopen the same checkout.
5. Buyer reviews and authorizes funding; show held payment only after confirmed on-chain evidence.
6. Shared dispatch/pickup, receipt, inspection, completion, refund and dispute screens. Network adapter handles transaction mechanics.
7. Disputes appear under the project's Trade disputes section in Hash PayLink Operations, with asset/network visible. Arc split execution must enforce the approved two-signer policy on Arc itself.

NGN/USD display quotes may remain as negotiation information if needed, but cannot be presented as a funded settlement option without an explicit accepted settlement quote. The first expansion does not add fiat conversion.

## Smallest complete implementation

### 1. Contract and authority boundary

- Freeze the final XLayer dispute-test baseline from the other session before carrying any resulting fixes into Arc.
- Review the existing ordinary-token Trade escrow for Arc USDC; preserve its Trade lifecycle instead of expanding the deployed service-agreement contract into a different product.
- Verify Arc token behavior, exact six-decimal accounting, funding/transfer behavior and deployment bytecode in a fork/rehearsal.
- Pin an Arc-specific factory and dispute authority in a separate release record. Verify deployed Safe bytecode, owners, threshold, nonce, chain-bound signing and execution; never assume the XLayer Safe address is deployed or configured on Arc.
- Keep existing service agreements and stock agreements bound to their original contracts and policies.

### 2. Hash PayLink adapter

- Add a Trade rail discriminator covering network, asset, contract version and custody policy. Bind it into terms, idempotency and stored agreement identity.
- Reuse participant authentication and Trade rules; add Arc wallet execution, preflight, reconciliation, receipts and server-confirmed state mapping.
- Add project-scoped Arc Trade permissions and independent enablement. Return availability from the server; do not infer availability from a client flag.
- Extend review routing with rail-specific Safe calls and chain-domain validation. Stock-review behavior stays unchanged until its final test result is accepted.
- Do not widen stock URL/ID checks to arbitrary paths or reuse numeric status codes across incompatible contract enums.

### 3. Hash PayStream integration

- Add explicit Arc vs XLayer selection before acceptance; preserve the existing visual flow.
- Introduce a versioned Arc hosted reservation and adapter. Preserve existing `hosted-trade-v1` stock reservations and recovery.
- Verify returned project, participants, offer/snapshot, amount, token, chain and terms before exposing checkout.
- Keep mainnet participant bindings separate from legacy testnet records. Do not rewrite or reinterpret old wallet IDs or reservations.
- Consume confirmed payment/expiry observations using the matching adapter; preserve sold-listing and expired-unfunded recovery rules.

### 4. Release gate

Required evidence: happy path; wrong chain/participant/asset rejected; exact funding; duplicate/retry recovery; dispatch and inspection deadline boundaries; refund; dispute freezing; one signer rejected; two signatures execute the exact split; stale nonce/replay rejected; both recipients reconciled; final receipt; pause-new/recover-existing behavior.

The other session's XLayer split test is required for XLayer readiness. Arc needs its own equivalent test and on-chain evidence. This audit did not activate services, sign, move funds, alter project configuration or deploy contracts.

## Checks run

- Hash PayLink `node --import tsx scripts/arc-mainnet-boundary-smoke.mjs`: passed.
- Hash PayStream `node --import tsx scripts/trade-hosted-checkout-smoke.mjs`: passed.
- Hash PayStream `node --import tsx scripts/trade-hosted-route-smoke.mjs`: passed.
- Read-only production flags/source checks and confirmed Arc RPC factory/operator/token checks: passed as described above.

These checks verify the current integration boundary; they do not claim that the proposed Arc Trade adapter has been implemented or tested.
