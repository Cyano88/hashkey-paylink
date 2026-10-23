# Arc Agreements mainnet deployment runbook

## Environment boundary
Live Agreements use Arc Mainnet (5042), production Circle credentials, mainnet factory/operator addresses and isolated mainnet stores. Sandbox remains Arc Testnet (5042002) with test credentials and separate records. Never fall back from live settings to sandbox settings. Historical testnet transactions remain historical evidence, not proof of mainnet deployment.

The preserved sandbox deployment history is in archive/arc-agreement-testnet-deployment-runbook.md. Current source migration does not automatically enable sandbox execution; only advertise sandbox actions that have an implemented, tested testnet adapter.

## Prepare the release
1. Run `npm run test:arc-agreement-contracts` from the repository root.
2. Set `ARC_AGREEMENT_OPERATOR_ADDRESS_MAINNET` to the independently read-verified Circle ARC developer-controlled EOA. Testnet operator IDs and addresses are not substituted.
3. Commit the source and set `ARC_AGREEMENT_SOURCE_COMMIT` to its full Git commit. Generate the candidate with `npm --prefix contracts run plan:arc-agreements`.
4. Set `ARC_AGREEMENT_MANIFEST_PATH` to that manifest. From contracts, run `npm run bundle:arc-agreements-review` to bind source, artifacts, dependencies and operational documents.
5. Record the contract-review decision against that commit and manifest commitment. Automated AI review and test results are evidence; they must be labeled accurately and cannot be presented as an external audit.

## Simulate without signing
Set `ARC_AGREEMENT_DEPLOYER_ADDRESS` to the user's selected EOA and run `npm --prefix contracts run simulate:arc-agreements`. The simulator verifies the RPC-reported chain ID, official USDC, constructor bytecode, managed operator code state, deployer balance and estimated gas. USDC pays gas on Arc; deployment transaction value is zero. Refresh fees before signing.

The candidate manifest and simulation remain non-broadcast artifacts. Record deployment approval separately; do not change their flags to manufacture an approval.

## Deploy and verify
After contract review and explicit deployment acceptance, present the exact constructor payload to the selected Rabby wallet on chain 5042. Verify the account and calldata hash. Preserve the transaction hash and receipt.

Keep execution off while setting `ARC_AGREEMENT_FACTORY_ADDRESS_MAINNET`, `ARC_AGREEMENT_DEPLOYMENT_TX_HASH`, confirmation depth and the approved manifest path. Run `npm --prefix contracts run verify:arc-agreements`. Verification requires the exact deployment transaction, constructor, bytecode, immutable operator, official USDC, confirmations and mainnet explorer source.

Only then pin `ARC_MAINNET_AGREEMENT_RELEASE` through a reviewed source change. Set project allowlists and bounded canary limits; enable activation and each worker only after its corresponding API, webhook, reconciliation and exit-path checks pass. A factory deployment alone does not authorize general production use.

## Secrets and records
Use .env.arc-mainnet.example as the live template. Preserve sandbox secrets separately; do not copy production keys into test settings, expose keys to the browser, rewrite historical chain IDs, or reuse sandbox store namespaces for live records. Hash PayStream must migrate its API permissions, wallet/session routing and records together before consuming mainnet Agreements.
