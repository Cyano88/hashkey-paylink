# Arc mainnet Agreement deployment verification — 2026-09-24

## Verified deployment

- Chain: Arc mainnet, 5042.
- Factory: `0x161b94A03fB2880902f69dA42d23C1c9043412Bc`.
- Managed operator: `0x988192DCc9f6F58d6BF9CF2D31697F5029F8a436`.
- USDC: `0x3600000000000000000000000000000000000000`.
- Transaction: `0x54e81c777dd464a946d614e0bb15611c89461129c72322df802ad79adcf44229`.
- Deployed source: `36ded4e522de3796f582159eefd867a89d21cf7e`.
- Runtime hash: `0xbe90f73ff04b1d8416071c4e22bab99acaa4b473c3be5c093a94a363b44abd62`.
- Manifest commitment: `0x999a94ae819d267ea1fd03ed2c4bb305fee144e0b6e9238ad02744caf3ff7a04`.

The owner signed the deployment in Rabby. Fresh RPC checks verified chain,
creation transaction, successful receipt, exact constructor payload, runtime
bytecode and immutable operator/USDC. The release verifier passed with 2237
confirmations. The explorer published full source verification using the exact
Solidity 0.8.24 standard JSON input. Its public HTTPS response was captured
through the browser because the direct API client returned HTTP 403; the
unmodified response passed the release verifier's explorer checks.

Explorer: https://explorer.arc.io/address/0x161b94A03fB2880902f69dA42d23C1c9043412Bc?tab=contract

Review was internal AI-assisted review and contract regression testing, not an
independent external audit or certification. Deployment acceptance is evidenced
by the owner's signed transaction. The verifier's generic remaining-approval
labels do not establish that an external approval is technically mandatory.

## Activation boundary

The source registry pins only the verified deployment identity. All five Render
execution switches remain false. Factory and transaction settings were saved
with single-variable writes and independent readback. No user funds were moved
through an Agreement, and no Hash PayStream production API key has been issued.

The deployment-tools branch was merged with the already-live developer portal
release aaab0a11a before this pin, preserving scoped keys, activity, routing and
security fixes. The contract source deployed above remains unchanged.

## Remaining integration work

Hash PayStream still requests testnet Circle wallets and validates hpl_test_
credentials. Its existing account wallet address is not chain-qualified. A
production migration must preserve sandbox records and verify fresh mainnet
wallet ownership; replacing a prefix or relabeling those records is insufficient.

Current Agreement scoped keys authorize reads and draft creation only. The
verified-recipient and project-payer routes remain denied. Any extension must
use explicit permissions and retain project, capability, identity and Circle
session checks. The live payer session must belong to the Circle application
accepted by Hash PayLink. Production execution remains disabled until that
integration and a bounded end-to-end lifecycle check pass.
