# Agreement xStocks extraction

This internal module reuses the newer Hash PayStream work escrow implementation
from `hashpaystream-production-20260907`, not Early Pay or Pocket direct payments.

It is not a public API or an enabled checkout rail. Callers must load accepted,
project-owned terms from durable storage, verify both Privy wallets, preserve an
existing binding on retries, and persist evidence before returning a transaction.
The planner never signs or broadcasts.

New funding is restricted to configured stock metadata intersected with factory
approval. Arc USDC remains separate. Pausing new funding must retain recovery for
existing escrows, including previously bound X Layer USDC records.

Do not remove the Hash PayStream signer until project authorization, hosted
Privy wallet continuity, pending transaction recovery and migration parity pass.

## Entry points and configuration

- work.ts: accepted work terms, deterministic binding, stock assets and transaction
  planning. No persistence, HTTP handler or authorization is implied.
- wallet.ts: server lookup of the authenticated user's one embedded Ethereum
  wallet, adapted to Hash PayLink's installed Privy server SDK. The caller must
  verify the access token using the same configured Privy app first.
- planner.ts and assets.ts: internal helpers, not public API entry points.
- source-manifest.json: SHA-256 fingerprints of the newer uncommitted source.

HASHPAYLINK_AGREEMENT_XSTOCKS_ENABLED=true permits new funding in this module.
Default off. Registry settings: HASHPAYLINK_AGREEMENT_XSTOCKS_ASSETS_JSON or
HASHPAYLINK_AGREEMENT_XSTOCKS_ASSETS_FILE. These do not enable merchant checkout,
Early Pay, Trade or HTTP routes. The low-level planner flag is set internally so
a funding pause cannot block recovery.

Original work namespace, canonical hash order, factory, arbiter and ABI remain.
Existing bindings must be loaded, not regenerated. New multi-project creation
must namespace the input request ID by project before binding. Imports preserve
original IDs and bindings. The synthetic binding fixture was compared directly
with the original source.

## Remaining integration gates

1. Dedicated xStocks Agreement project capability and explicit endpoint scopes.
   Existing Arc-only keys must not silently gain X Layer permissions.
2. Durable project-owned accepted terms, participant identities, immutable
   wallets and bindings. Participant actions need separate authentication from
   developer draft creation; evidence must persist before signing payloads return.
3. Verify hosted Privy app/wallet continuity with Hash PayStream. Matching email
   is not proof. Do not rebind wallets or reset pending payments.
4. Connect the existing first-party confirmation and hidden Privy signing UI to
   authorized endpoints; retain pending recovery at the original app origin.
5. Rehearse both participants and recovery before deployment or deleting HPS code.

Validation: npm run test:xstocks-agreement covers terms, source binding parity,
pinned factory, lifecycle permissions, exact allowances/zero reset, delisting,
paused recovery, asset authorization failures and Privy ownership. Local mocked
tests do not prove a live funded transaction or constitute an external audit.
