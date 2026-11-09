# Marketplace instruction boundary

Status: internal implementation only; no public route, deployment, live funds or provider call.

## Implemented

- New instruction service defaults to disabled. A trusted server-side credential resolver must supply an active project, credential ID, marketplace capability and the exact read/release scope. Existing checkout keys are not implicitly authorized. Resolver failures propagate; authorization is repeated on retries.
- The project comes exclusively from that resolver. Release payloads accept only a payment reference, business reference and allocation amounts. Extra fields, duplicate allocations and imprecise/non-string amounts fail validation.
- Multi-allocation release is one atomic repository mutation. A failure in any allocation leaves every allocation and the journal unchanged. Amounts remain integer micro-units; USDC and USDT continue to be accounted for separately.
- Release instructions record the authorizing credential ID and marketplace business reference. Allocation order is normalized for retries. Changing the business reference or credential changes the idempotency payload and requires a distinct request.
- Read responses omit internal funding/execution proof references and the credential-bearing command journal. There is no generic command method or developer-controlled funding/result method.

## Validation

- `npx.cmd tsx scripts/marketplace-instructions-smoke.mjs`: passed default-off, scopes, revocation, project isolation, strict payload validation, later-allocation rollback, reordered retry, changed reference rejection, concurrent releases, journal attribution and response redaction.
- `npx.cmd tsx scripts/marketplace-accounting-smoke.mjs`: passed existing accounting regression suite.
- Focused TypeScript diagnostics: passed for accounting, repository, instructions, shared marketplace contract and marketplace docs component.

These are synthetic repository fixtures with serialized in-memory mutation. They do not establish live custody, provider approval, production database concurrency or successful on-chain/NGN settlement. No UI changed in this tranche; browser QA was not repeated.

## Still required

The actual holding mechanism remains undecided. Beneficiary ownership verification, immutable destination versions, production key scope issuance, funding/reconciliation adapters, fee-bound payout reservations, original-payer refund routing and transactional webhooks remain open. The instruction service is deliberately not mounted while these dependencies are incomplete. Existing direct merchant settlement must not be represented as escrow.
