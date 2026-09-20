# Pocket Base and Arbitrum fast migration confirmation

Scope: same-owner USDC wallet migration on Base and Arbitrum only. Arc retains finalized-block verification.

The authenticated Circle challenge must resolve to a COMPLETE transaction belonging to the source wallet and source contract. Both the strictly configured private RPC and the pinned public RPC must independently verify the successful receipt, canonical receipt block, exact USDC emitter, source, recipient and amount. Both heads must be at least two blocks and 15 chain-timestamp seconds beyond the receipt. Their receipt block hashes and timestamps must agree.

This is an explicit low-latency confirmation policy, not Ethereum finality. The 15-second and two-block thresholds are application guardrails, not protocol guarantees. Providers share the chain's sequencer and can agree before a later rollback. There is no guaranteed end-to-end latency: Circle completion, RPC availability and app polling can add delay. Private-provider outages or missing configuration cannot silently count the public endpoint twice.

Activation revalidates every nonzero saved transfer through the authenticated challenge and the same receipt policy, matching its saved transaction hash. Empty rows need no transaction. Existing ownership, balances, pending-operation, atomic activation and previous-wallet archive checks remain in place. No automatic signing, replacement transaction or wallet activation is introduced.

Validation: synthetic fast-confirmation tests cover both chains, exact boundary values, token/amount/ownership mismatch, receipt failure, absent evidence, divergent canonical blocks, provider outage and activation rechecks. Existing provider, receipt/finality, execution, activation and RPC reader tests pass. Live deployment and read-only verification are performed separately.
