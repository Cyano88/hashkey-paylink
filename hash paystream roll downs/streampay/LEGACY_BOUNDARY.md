# Hash PayStream compatibility boundary

The old creator, timed-stream, payroll, x402-unlock, and Arena surfaces are
frozen as compatibility sources while the agreements-first HashpayStream
client reaches full public-API and deployment parity.

## Preserve

- Existing creator content and unlock records.
- Checkpoint, earnings, refund, and receipt identifiers.
- Receipt lookup compatibility, including `hps-checkpoint-*` records.
- Current UI patterns selected for the standalone client until their
  replacements reach parity.

## Do not extend

- Arena and unrelated marketplace surfaces.
- Creator discovery, social feeds, publishing, and new content categories.
- Payroll or timed-stream product navigation.
- HashpayStream-specific x402 wallet management or new creator x402 modes.
- The broad embedded social/feed product.
- New public infrastructure based on `StreamVault`, `StreamVaultFactory`,
  precomputed vault addresses, or direct wallet-address deposits.

The old contracts remain historical compatibility assets. They are not the
funding model for Arc Agreements.

Agentic x402 remains supported by Hash PayLink as its own project type and API
product. This boundary removes it only from HashpayStream's product surface.

Arena may be evaluated as a separately branded application, but it must not be
reintroduced into HashpayStream. Its current contracts and relayer model are
not approved for public funds.

## Removal gate

Do not delete this module until the standalone client:

1. Uses only documented Hash PayLink integration contracts.
2. Preserves required content and receipt lookup behavior.
3. Passes fixed, progressive, milestone, cancellation, refund, and receipt
   parity tests across independent deployments.
4. Has a verified data migration and rollback plan.
