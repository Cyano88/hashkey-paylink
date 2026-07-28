# Hash PayStream compatibility boundary

This embedded application is frozen as a compatibility source while the
standalone Hash PayStream client is rebuilt against Hash PayLink's public Arc
Agreements API.

## Preserve

- Existing creator content and unlock records.
- Checkpoint, earnings, refund, and receipt identifiers.
- Receipt lookup compatibility, including `hps-checkpoint-*` records.
- Current UI patterns selected for the standalone client until their
  replacements reach parity.

## Do not extend

- Arena and unrelated marketplace surfaces.
- The broad embedded social/feed product.
- New public infrastructure based on `StreamVault`, `StreamVaultFactory`,
  precomputed vault addresses, or direct wallet-address deposits.

The old contracts remain historical compatibility assets. They are not the
funding model for Arc Agreements.

## Removal gate

Do not delete this module until the standalone client:

1. Uses only documented Hash PayLink APIs.
2. Preserves required content and receipt lookup behavior.
3. Passes fixed-unlock and progressive-release parity tests.
4. Has a verified data migration and rollback plan.
