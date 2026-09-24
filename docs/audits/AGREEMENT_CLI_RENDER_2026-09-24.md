# Agreement CLI and Render preparation - 2026-09-24

## Scope
Added owner-approved agreement:read and agreement:create permissions for human Agreement records and draft creation only. Dedicated Render destination: HASHPAYSTREAM_ARC_MAINNET_API_KEY. No signing, escrow activation, release requests, payer-token rotation, verified-recipient registration or key-management access is granted by the backend key.

## Verified production state before changes
- Hash PayStream service srv-d9opfcad0e5s73c3omag runs a8877ba7118005fef233f28e700bbd1c7a41516f.
- Existing project dev_25f636321f644b4284 is configured with a retired test credential. No new key has been issued or placed in Render yet.
- Hash PayLink mainnet Agreement release registry remains null; Agreement execution and lifecycle workers are disabled.
- Clean Hash PayStream worktree: C:/Users/USER/.audit-tools/hashpaystream-production-20260924. Mainnet preparation is in a separate, unshipped historical branch. No dirty app checkout was overwritten.

## Controls
Owner sign-in and code approval required. Active, ready human project with Arc mainnet USDC routing, Agreements capability and signed webhook required to issue a key. Keys expire in at most 30 days and remain project-scoped. Server route guard rejects nested signing routes and lifecycle actions. General Agreement worker/payer policy does not accept scoped keys as general project credentials. Hosting checks remote scope, revocation and expiry during planning and apply; values remain in the OS-protected vault/provider request memory. Existing test environment remains untouched.

## Remaining production work
Owner authentication, project mainnet routing validation, new key issuance and Render handoff; reviewed mainnet contracts/operator; isolated app wallet/store/webhook integration; bounded real-wallet canary; explicit app/mobile release. This preparation does not declare Hash PayStream production-ready.
