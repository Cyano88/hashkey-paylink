# Arena standalone review

## Decision

Arena is a credible standalone experiment, but it is not ready for public
funds and should not be bundled with HashpayStream.

Its product is a recoverable-risk multiplayer game: players commit USDC, risk
increases through the rounds, eliminated players can recover the uncommitted
portion, and the remaining pool settles to a winner. That is materially
different from protected work payments.

## What already exists

- a dedicated 2,000-plus-line room and trivia client;
- durable room APIs and host-control state;
- a CREATE2 room factory and per-room USDC escrow;
- Circle Arc wallet join and refund calls;
- contract tests for room creation, joins, risk curves, refunds, cancellation,
  and winner settlement.

This is enough for an isolated testnet prototype. It is not enough for a public
consumer launch.

## Blocking issues

1. `join()` infers a player's deposit from the escrow's unaccounted token
   balance. A public version must bind funding to the joining player in one
   atomic transfer or a verified authorization.
2. ERC-20 transfers use raw `transfer` calls without checking the returned
   value. A reviewed implementation should use safe transfer semantics.
3. The host or relayer supplies eliminations and the relayer chooses the
   winner. Public value needs signed outcome evidence, replay protection,
   dispute and timeout rules, and a recovery path when the relayer stops.
4. The server relayer is a privileged hot key and a single settlement point.
5. The product may be treated as wagering or a prize game depending on the
   jurisdiction. Legal and geographic controls must be decided before launch.
6. Arena currently shares Hash PayLink code, environment variables, database,
   wallet helpers, and deployment infrastructure.

## Standalone build map

### Phase 1 - isolate the game

- choose a separate brand, domain, repository, database namespace, and
  deployment;
- keep Hash PayLink only as the wallet/payment/receipt provider;
- remove HashpayStream creator, payroll, agreement, and x402 navigation;
- launch with test USDC and invitation-only rooms.

### Phase 2 - redesign settlement

- make deposit and join atomic and payer-bound;
- replace unchecked transfers;
- define signed round-result and winner attestations;
- add room expiry, stalled-relayer recovery, dispute, and emergency exit;
- separate operational signer roles and enforce spending policies.

### Phase 3 - independent verification

- expand adversarial contract and API tests;
- commission an external smart-contract review;
- run full rooms under network interruption, duplicate requests, process
  restarts, and dishonest host scenarios;
- verify receipts against authoritative Arc state.

### Phase 4 - launch decision

- resolve jurisdiction, age, prize, and regional restrictions;
- publish rules and risk disclosures;
- use capped pilots before considering real-money rooms.

## Positioning recommendation

If resumed, position Arena as its own recoverable-risk game protocol, not as a
HashpayStream feature. It may be an attractive hackathon demo because the
decreasing refundable balance is visually and technically distinctive, but it
should not distract from Hash PayLink's payment infrastructure or
HashpayStream's protected-agreement product.
