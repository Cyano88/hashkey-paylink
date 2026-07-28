# Arc Agreements operator and network policy

## Verified Arc Testnet configuration

Hash PayLink's Arc Agreements preview is restricted to:

- Chain: Arc Testnet
- Chain ID: `5042002`
- Circle domain: `26`
- RPC fallback: `https://rpc.testnet.arc.network`
- Explorer: `https://testnet.arcscan.app`
- Official testnet USDC: `0x3600000000000000000000000000000000000000`

The API deployment-preparation boundary rejects every other chain or token
address. Production configuration must not make the USDC address overridable.

Primary references:

- https://developers.circle.com/stablecoins/usdc-contract-addresses
- https://developers.circle.com/gateway/quickstarts/unified-balance-evm
- https://developers.circle.com/gateway/nanopayments/quickstarts/seller

## Operator separation

The agreement operator is an authorization role, not a treasury.

- Use a dedicated Circle developer-controlled `ARC-TESTNET` wallet for
  agreement release and cancellation.
- Do not reuse a payer, recipient, treasury, deployer, or personal browser
  wallet as the operator.
- Do not place a raw operator private key in the frontend, repository, build
  arguments, logs, or a developer project's API configuration.
- Restrict the signer to Arc Testnet and the reviewed agreement factory and
  escrow method selectors.
- Require durable evidence, agreement identity, expected next step, value, and
  recipient checks before every signature.
- Record the signer identity, agreement, evidence hash, transaction hash, and
  resulting confirmed block in the operations audit trail.

Before the wallet can be approved:

1. Create a dedicated wallet set and `ARC-TESTNET` wallet through Circle.
2. Read the wallet record back from Circle; do not trust a copied address.
3. Confirm that the returned blockchain is `ARC-TESTNET` and that its checksum
   address exactly equals `ARC_AGREEMENT_OPERATOR_ADDRESS`.
4. Store the wallet UUID as `ARC_AGREEMENT_OPERATOR_WALLET_ID` only after that
   match succeeds.
5. Generate a fresh entity-secret ciphertext for each Circle contract-execution
   request and a fresh UUID v4 idempotency key for each intended action.

The one-time provisioning command is isolated from Pocket, x402, Bills, and
treasury variables. It accepts only `CIRCLE_TEST_API_KEY`, the registered
`CIRCLE_ENTITY_SECRET`, and two dedicated UUID-v4 idempotency keys:

- `ARC_AGREEMENT_OPERATOR_WALLET_SET_IDEMPOTENCY_KEY`
- `ARC_AGREEMENT_OPERATOR_WALLET_IDEMPOTENCY_KEY`

After reviewing those values, run:

`npm run provision:arc-agreement-operator -- --confirm-create-arc-testnet-operator`

The command rejects live Circle keys and creates one EOA on `ARC-TESTNET` in a
wallet set named `Hash PayLink Arc Agreements`. It prints only the wallet-set
ID, wallet ID, public address, network, custody type, state, and account type.
Save the returned wallet ID and address as
`ARC_AGREEMENT_OPERATOR_WALLET_ID` and
`ARC_AGREEMENT_OPERATOR_ADDRESS`. Retrying must reuse the same idempotency keys
so Circle returns the original resources instead of creating duplicates.

The code in `api/arc-agreement-operator-wallet.ts` reads the configured wallet
back from Circle and requires the matching wallet UUID, `ARC-TESTNET`,
developer custody, `LIVE` state, a supported EOA or SCA account type, and the
exact immutable operator address. It returns an in-process verified proof that
cannot be reconstructed from stored JSON.

Operators run `npm run preflight:arc-agreement-operator` from a private
environment containing `CIRCLE_TEST_API_KEY`, the wallet UUID, and the expected
operator address. The command makes one read-only request, masks the wallet UUID
in its output, and never accepts the live Circle API key as a substitute. Passing
the preflight is evidence for review; it is not deployment or activation
authorization.

`api/arc-agreement-operator.ts` requires that proof before it can prepare a
branded internal envelope for the allowlisted `releaseStep(uint8,bytes32)` or
`cancelByOperator(bytes32)` call. The envelope records `ARC-TESTNET` as an
internal network invariant. It deliberately does not expose a `blockchain`
request field because Circle treats `blockchain` and `walletId` as mutually
exclusive for contract execution. It does not hold the entity secret and does
not submit a contract execution request.

`api/arc-agreement-operator-status.ts` binds a read-only Circle transaction
response back to the exact prepared wallet, operator, escrow, method,
parameters, and reference. Even a Circle `CONFIRMED`, `COMPLETE`, or `CLEARED`
state is classified only as `chain_reconciliation_required`; it never becomes
authoritative agreement state until the Arc transaction and confirmed escrow
snapshot reconcile.

Circle references:

- https://developers.circle.com/wallets/dev-controlled
- https://developers.circle.com/wallets/dev-controlled/create-your-first-wallet
- https://developers.circle.com/api-reference/wallets/developer-controlled-wallets/create-developer-transaction-contract-execution
- https://developers.circle.com/api-reference/wallets/developer-controlled-wallets/get-transaction

The operator is immutable per factory. Rotation requires deploying a new
reviewed factory, disabling new creation through the old factory, and
continuing reconciliation for existing escrows until they reach terminal
states.

## Deployment separation

Before deployment, record and review:

1. Compiler version, optimizer settings, source commit, and bytecode hashes.
2. Official Arc USDC, operator, deployer, and predicted factory addresses.
3. Testnet-only environment and confirmation depth.
4. Deployer funding source and transaction simulation.
5. Explorer verification output and the final deployment transaction.

No agreement endpoint may activate merely because these environment variables
exist. Activation requires the deployment manifest, verified bytecode, and
confirmed-chain reconciliation to agree.

The current deployment-plan command is intentionally local-only and has no
broadcast path. `LOCAL_UNCOMMITTED` is acceptable for local comparison, never
for deployment approval.

## Webhook boundary

Agreement webhooks are created only from a snapshot read at a confirmed block.
The durable draft and immutable chain values must reconcile exactly first.

The outbox:

- derives a stable event ID from the escrow and confirmed lifecycle state;
- stores the event before attempting delivery;
- leases one delivery attempt at a time;
- retries with the same event ID and payload;
- signs every attempt using the developer project's existing HMAC contract;
- stops after the configured dead-letter threshold.

Webhook delivery proves that Hash PayLink observed a reconciled onchain state.
It does not prove that offchain work or access delivery was valid.
