# Arc Agreements testnet deployment runbook

## Current state

Arc Agreements is inactive. The API returns `contract_unavailable`, webhook
delivery is not wired to a public route or worker, and the repository contains
no Arc Agreements broadcast command.

The deployment plan is a deterministic review artifact, not authorization to
deploy.

The independent-review bundle is also evidence only. It always remains
`pending-independent-review` and cannot record approval or authorize
deployment, broadcast, or activation.

## Generate a local candidate manifest

1. Compile and test the contracts:

   `npm run test:arc-agreement-contracts`

2. Set a proposed dedicated Circle developer-controlled wallet address:

   `ARC_AGREEMENT_OPERATOR_ADDRESS=0x...`

3. For comparison during local development, leave
   `ARC_AGREEMENT_SOURCE_COMMIT` unset. The manifest will say
   `LOCAL_UNCOMMITTED`.

4. Generate the non-broadcast plan:

   `npm run plan:arc-agreements`

The command refuses every Hardhat network except the ephemeral local network.
The output records official Arc Testnet USDC, compiler settings, constructor
arguments, bytecode sizes and hashes, the exact expected factory runtime after
Solidity immutable substitution, and a manifest commitment. It always reports
`broadcastAllowed: false`. Schema v2 also refuses stale compiler artifacts when
their embedded source differs from the current contract or dependency source.

## Required approval gates

Do not add or run a broadcast path until all of these are complete:

1. An independent reviewer has reviewed the escrow and factory contracts.
2. The source working tree is clean and the manifest contains the exact full
   Git commit, not `LOCAL_UNCOMMITTED`.
3. Circle returns an `ARC-TESTNET` developer-controlled wallet whose address
   exactly equals the proposed immutable operator address.
4. The deployer address and testnet funding source are recorded and approved.
5. A deployment simulation succeeds against the exact reviewed constructor
   values.
6. The deployed factory constructor values, runtime code, transaction, and
   explorer verification are reconciled with the approved manifest.

## Prepare the independent-review bundle

After the candidate source and compiler artifacts are committed, the working
tree is clean, and the schema-v2 manifest contains that exact lowercase full
commit, set `ARC_AGREEMENT_MANIFEST_PATH` to the reviewed manifest and run:

`npm run bundle:arc-agreement-review`

The command is read-only and prints a deterministic JSON packet. It refuses a
dirty tree, `LOCAL_UNCOMMITTED`, a mismatched commit, modified manifest fields,
or stale compiler artifacts. The packet binds the contract sources, compiler
artifacts, the dedicated contracts dependency lock, the application dependency
lock, architecture, threat model, operator policy, and this runbook by content
hash. It lists required verification commands but marks their results
`not-attested`; an independent reviewer must capture and sign off on the actual
results separately.

Generating this packet is not an independent security review. The packet has
no input or output capable of changing its `deploy`, `broadcast`, or `activate`
authorization fields from `false`.

## Verify an approved deployment

After an explicitly approved deployment, keep the product inactive. Set the
server-only factory address, deployment transaction hash, confirmation depth,
and path to the exact approved schema-v2 manifest. Run:

`npm run verify:arc-agreement-deployment`

This command is read-only and refuses every Hardhat network except Arc Testnet.
It runs with `--no-compile`, requires a clean working tree whose full commit
matches the manifest, and compares:

- Arc Testnet chain ID and confirmation depth;
- successful contract-creation transaction and receipt;
- complete deployment input against the manifest deploy-data hash;
- factory runtime against the immutable-aware expected runtime hash;
- factory `usdc()` and `operator()` against the approved constructor;
- full source verification returned directly by Arcscan's Blockscout API,
  including unchanged bytecode, compiler, optimizer, source identity, and
  constructor arguments.

A passing report still returns `activationAuthorized: false`. Independent
contract review, managed-wallet ownership, explicit deployment acceptance, and
a separate activation change remain mandatory.

## Verify the proposed Circle operator

After Circle provisions the dedicated developer-controlled `ARC-TESTNET`
wallet, set `CIRCLE_TEST_API_KEY`, `ARC_AGREEMENT_OPERATOR_WALLET_ID`, and
`ARC_AGREEMENT_OPERATOR_ADDRESS` in the private operator environment. Then run:

`npm run preflight:arc-agreement-operator`

The command performs one read-only request to Circle's official wallet endpoint.
It fails closed unless Circle returns the configured wallet UUID, the exact
operator address, `ARC-TESTNET`, developer custody, `LIVE` state, and a supported
account type. Its output masks the wallet UUID and never prints the API key,
Authorization header, or raw Circle response.

This preflight does not create a wallet, sign a transaction, deploy a contract,
or authorize product activation. Never place `CIRCLE_TEST_API_KEY` in a
deployment manifest, log, source file, or client environment. The command
intentionally does not fall back to `CIRCLE_API_KEY`.

## After an approved deployment

Keep the product inactive while:

- the confirmed factory address and operator address are added to server-only
  configuration;
- the exact deployed runtime is compared with the reviewed artifacts, accounting
  for Solidity immutable values;
- read reconciliation passes against a real test agreement;
- operator request preparation is paired with Circle wallet-address ownership
  verification through `api/arc-agreement-operator-wallet.ts`, followed by
  transaction-status reconciliation through
  `api/arc-agreement-operator-status.ts`;
- the webhook outbox is connected to a durable worker and tested for retries,
  idempotency, and dead-letter behavior.

Only then may a separate, explicit activation change replace
`contract_unavailable`. Environment variables alone must never activate the
product.
