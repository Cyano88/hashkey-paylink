# Marketplace holding: live provisioning evidence

Verified on 2026-11-09. This records live wallet provisioning and read-only backing checks, not a live Marketplace payment pilot.

## Created and verified

- Circle account: existing Hash PayLink account, explicitly reused.
- Purpose/name: Hash PayLink Marketplace Holding.
- Chain/account type: Base mainnet SCA, Circle state LIVE.
- Holding identity/revision: marketplace-base-usdc / v1.
- Wallet set: 9e1164f2-77ea-5696-813c-32d185ff6bc1.
- Wallet ID: 1bb5fa69-1f80-507c-af4c-6dafd73c7d07.
- Address: 0x3E429dda6Cf43F71c77701D2b8898231A6A89DB6.
- Creation completed and read back at 2026-11-09T17:36:03Z.

The wallet set, wallet ID and address differ from Bills. Before creation, the existing Bills wallet was verified, the complete wallet-set inventory contained no Marketplace-labelled set, and the production Marketplace provisioning journal was absent. Creation used the durable production journal and persistent provider idempotency keys. No creation key or credential is recorded in this document.

## Configuration saved, payments disabled

Marketplace identifiers and explicitly named Circle credentials were saved to the existing Render service. The credential values reuse the existing Circle account; this is wallet/fund separation, not independent signing authority. Bills and all unrelated environment values were read back and confirmed unchanged.

These settings are saved for the next deployment. No deployment was triggered. Collections, developer instructions, refund worker and provisioning flags are explicitly false. No project allowlist was enabled. The public Marketplace financial endpoints remain unmounted.

## Backing snapshot

Read-back verification at 2026-11-09T17:37:36Z confirmed the Circle wallet identity. The production accounting ledger was initialized only if absent, with no books or balances invented.

- Finalized Base block: 55272143.
- Block hash: 0x043c7900d7ac6424f7e756b628576138fa7a31eee36b66c3e684f57a588f9be2.
- Marketplace books: 0.
- USDC balance: 0 units.
- Outstanding obligations: 0 units.
- Shortfall: 0 units.
- Native ETH balance: 0 wei.
- Deployed smart-account bytecode: not present at this check.

The zero-obligation backing check passed. This does not demonstrate a funded payment, release, payout or refund. No funds were transferred. Circle LIVE metadata does not imply that smart-account bytecode is deployed, and this wallet is not a contract escrow.

## Remaining rollout requirements

There are no Marketplace-capable apps and no pending or approved whitelist requests in the current production store. A pilot project must be selected and pass its approval/verification gates before rollout inclusion.

Gas sponsorship is unverified. The available Circle entity-configuration read returned app metadata only, not a gas policy. Verify the relevant mainnet sponsorship policy and its scope before signing from the new wallet. A dedicated production RPC configuration, production wallet/bank execution preflights, holding migration recovery, and a controlled funded pilot remain outstanding.

A new wallet set does not prove separate credential permissions. Independent signing authority has not been claimed or established. Financial activation remains disabled.
