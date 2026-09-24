# Arc Agreement mainnet deployment preparation - 2026-09-24

## Verified live configuration
The full Render environment inventory (134 variables before preparation) showed production Circle access and a mainnet RPC, but only legacy Agreement factory/operator settings. All five Agreement execution and worker switches were false. The project owner confirmed no mainnet Agreement contract deployment exists.

## Completed preparation
- Fixed deployment-plan and verification entrypoints to use dedicated *_MAINNET addresses with no fallback to legacy settings.
- Added an explicit RPC chain 5042 check before explorer/deployment verification.
- Updated stale testnet expectations to match the existing mainnet manifest and explorer; added missing-address, legacy-only, zero-address and wrong-chain rejection tests.
- The 12 deployment configuration, plan, simulation and verification tests pass under Node 22.
- Created and independently read-verified a dedicated live ARC developer-controlled EOA operator through the existing Hash PayLink Circle account. Persisted stable provisioning idempotency keys before creation; saved the production credential aliases and verified operator configuration in Render with per-variable readback. No credential values are recorded here.
- No factory was deployed, no funds moved, no API key was issued and no execution switch was enabled.

## Remaining release steps
Use the chosen deployer public address to simulate the exact manifest constructor, estimate gas and verify funding. Deploy the reviewed factory, verify the deployment transaction, exact bytecode, constructor, operator and explorer source against the manifest, then pin the release in source. Configure the factory and approved limits before enabling a bounded canary. Hash PayStream's credential, session and record migration must be validated before general activation.
