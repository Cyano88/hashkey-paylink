# xStocks Agreement API

Reuses the newer Hash PayStream work escrow from hashpaystream-production-20260907.
Early Pay and Pocket direct payments are not involved. This API is implemented
locally, including the hosted checkout UI; it has not been deployed.

## Project access

The separate xstocks_agreements capability is an add-on to an existing ready
human developer project in this release. It does not add X Layer to merchant
checkout, Arc Agreements, agent checkout or Polymarket funding networks.

- GET /api/v2/xstocks-agreements?id=xag_... requires xstocks-agreement:read.
- GET /api/v2/xstocks-agreements?purpose=assets returns the approved stock list
  under the same read permission.
- POST /api/v2/xstocks-agreements requires xstocks-agreement:create and an
  Idempotency-Key header (16-128 letters, numbers, colons, underscores or hyphens).
- POST /api/v2/xstocks-agreements/participant requires a Privy user access token.
  Developer keys and CLI grants cannot authorize this participant endpoint.

New CLI scopes appear on the owner consent screen. Existing Arc-only scoped keys
receive no xStocks permissions. Keys can create drafts, not sign or release funds.

Draft JSON fields: title, description, amount (exact stock quantity as a string),
durationSeconds (1-30 days), paymentToken (approved stock address), reviewHours
(24, 48 or 72), customerUserId and providerUserId. Both user IDs must belong to the
same configured Privy app used by the participant endpoint. Only human, live,
X Layer work Agreements are accepted; Arc USDC uses the existing Arc API.

The response has agreement.id and agreement.consentHash. Draft terms cannot be
edited. Repeating an idempotency key returns the same record; changing the terms
with that key returns 409. The ID includes the project namespace.

## Participant operations

All participant requests contain agreementId and action:

- read: returns accepted terms, consentHash, accepted wallets, stored confirmed
  state, evidence notes and events. A read is a last-observed snapshot.
- accept_terms: requires consentHash and address. Server verifies the exact
  participant's single Privy embedded Ethereum wallet. Both acceptances freeze
  the binding and funding deadline. Wallets cannot be replaced on retry.
- prepare: optional operation selects an available escrow action; omit it to
  reconcile confirmed chain state. Evidence is required for submission, refund
  and dispute operations. The response status may contain an unsigned transaction.

The planner verifies the pinned factory and all immutable terms, exact allowance,
role and deadlines. It never signs or broadcasts. Evidence is saved before a
transaction is returned; unsigned evidence notes do not prove on-chain execution.
Confirmed state cannot be overwritten by an older observation. Losing a previously
observed escrow in the chain view fails closed instead of preparing a replacement.
Each record belongs to its project and uses atomic durable PostgreSQL mutation.

## Rollout and recovery

HASHPAYLINK_AGREEMENT_XSTOCKS_ENABLED defaults off. Approved stock registry settings:
HASHPAYLINK_AGREEMENT_XSTOCKS_ASSETS_JSON or HASHPAYLINK_AGREEMENT_XSTOCKS_ASSETS_FILE.
Metadata alone never authorizes funding; factory approval and precision must match.
Suspension, capability removal or a funding pause blocks new actions but preserves
existing participant refunds, release and dispute recovery.

Existing Hash PayStream bindings and pending transactions have not been imported.
The source work namespace and canonical binding hashes are preserved in the shared
core; new API drafts use project-namespaced IDs. Never recreate old funded work as
a new draft or regenerate its original binding. source-manifest.json records the
exact source fingerprints used for extraction.

Remaining before cutover: verified Hash PayLink identity linking from HPS, the HPS
adapter, old-origin pending recovery, migration rehearsal, project activity/webhook
integration and two-party signing/lifecycle verification. Do not remove the old
HPS signer until those checks pass. Production settings remain unchanged.

Validation: npm run test:xstocks-agreement plus developer-cli-grants-smoke and
 developer-cli-keys-smoke. These use synthetic data and mocked chain/storage;
they do not prove a funded production transaction or an external audit.


Validation on 24 September 2026: the five xStocks suites, CLI grants/keys suites,
focused API TypeScript check and focused DeveloperCliAccessPage TypeScript check
passed. Full npm run typecheck failed in unchanged Circle wallet, PaymentPage,
Pocket and legacy StreamPay files (including missing idempotencyKey, ES library
mismatches, nullable values and legacy component state/type errors). No full-repo
pass or production readiness is claimed. Resolve those failures before release.


## Hosted checkout and provider ownership

The new route is /agreements/xstocks/:agreementId on app.hashpaylink.com. It uses
Hash PayLink's own Privy app only, custom email sign-in, explicit terms acceptance
and the newer HPS work checkout's signing/recovery controls. Each record stores
its walletAppId. Provider configuration changes fail closed; no app-specific
secret or developer key is sent to the browser. New wallet setup is available
only when no existing embedded wallet or accepted wallet needs recovery.

All payment signing remains user-authorized in the hosted UI. Standard Privy
transaction popups are hidden. A first-party confirmation states the exact token
quantity, beneficiary and network fee. Pending intent is saved before signing;
uncertain submissions block retries. Returning to an earlier account does not
revive a stale confirmation. Server confirmation remains authoritative.

Mobile preview at 390px and first-party confirmation were inspected with synthetic
data and no signing. No horizontal overflow was observed. Added hosted adapter,
wallet-authority and rendered signing tests pass; the page/API focused typecheck
passes. React rendering tests require the declared react-test-renderer 18.3.1 dev
dependency; an already-installed matching runtime was used for local validation.

Existing HPS user IDs, wallets and balances are not Hash PayLink identities. HPS
must establish a verified HPL identity before submitting new participant IDs.
Do not relabel an old wallet as an HPL wallet or discard historical recovery.

Circle consolidation uses HPL's existing hosted Arc Agreement payer checkout
(Arc mainnet) rather than copying HPS's direct Arc-testnet wallet adapter. Wallet
onboarding/identity linking and HPS routing still need integration. This commit
does not migrate Circle wallet balances, pending payments or native app accounts.

## Share-based Trade custody (prepared rollout)

New Trade drafts must explicitly include `stockCustody: "xstocks-shares-v2"`.
The server freezes that policy and the selected factory into the consent digest.
Old records retain their original factory and can be read/recovered; they are
never rewritten into a new escrow. New creation remains disabled until
`HASHPAYLINK_XSTOCKS_SHARE_ENABLED=true` and
`HASHPAYLINK_XSTOCKS_SHARE_FACTORY` names the verified deployment. Runtime hash,
chain 196 and arbiter checks are mandatory. Pausing new funding preserves release,
refund and dispute routes. Trade asset discovery uses this new factory only.

Stock quantity is converted to issuer token shares at funding. Custody and payouts
track those shares. Issuer rebases can change displayed quantities. Split payouts
floor the buyer share allocation and allocate the remainder to the seller. Both
participants accept this notice before escrow creation.

`status.stockReceipt` and the developer record's last-observed `stockReceipt` have
exact integer strings: fundedShares, currentUnderlyingUnits, buyerSettledShares,
sellerSettledShares, buyerUnderlyingAtSettlement, sellerUnderlyingAtSettlement,
and observedBlock. Settlement equivalents are frozen on-chain at payout;
currentUnderlyingUnits is the latest equivalent of the originally funded shares,
not a post-settlement wallet balance. ShareSettlementAllocation records original
allocation weights, never actual rebased token receipts. Retain the observation
block when exporting evidence.

The typed server SDK entry is `@hashpaylink/sdk/xstocks`:
`createXStocksAgreementClient({apiKey})`, `.create(draft, idempotencyKey)`, `.get(id)`,
`.assets()`, and `xStocksCheckoutUrl(agreement)`. Keep the key on your server.
Builders may arrange these values in their own UI; payment authorization remains
in the participant's hosted wallet checkout. The packaged candidate preserves
Hash PayStream's existing Circle wallet code and styles byte-for-byte.

Activation requires deployed runtime verification and both participants accepting
a fresh agreement. An old token allowance cannot authorize the new escrow.
