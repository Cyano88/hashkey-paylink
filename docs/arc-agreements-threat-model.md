# Arc Agreements contract threat model

## Scope

This document covers the first non-upgradeable Arc agreement escrow and its
factory. It does not authorize deployment or public API activation.

The escrow is intended to hold one exact USDC amount for one payer and one
recipient. A Hash PayLink operator can release only the next immutable schedule
step to the recipient or cancel the remaining balance back to the payer.

## Trust model

- The payer controls creation, USDC approval, early cancellation during the
  disclosed cancellation window, and expiry refunds.
- The recipient is immutable and is the only release destination.
- The operator is trusted to attest that release conditions were met. It cannot
  redirect funds, change the schedule, increase the total, or withdraw to
  itself.
- The contract rejects operator, payer, recipient, and USDC role collisions so
  the dedicated operator cannot also be a payment party or token address.
- The factory fixes the USDC token and operator for every escrow it creates.
- The contracts are non-upgradeable. A new reviewed factory is required to
  change the implementation or operator.
- The API's domain-separated terms commitment and project-scoped client
  reference are immutable in each escrow.

Operator attestation is a central trust assumption. Evidence hashes provide an
audit trail but do not prove that offchain work was completed.

The read-only reconciliation boundary checks chain, factory, parties, token,
template, amount, timing, schedule, terms commitment, release progress, and
principal balance before treating a contract snapshot as matching its durable
API record. Reconciliation does not prove that offchain fulfillment occurred.

## Funding invariants

1. Creation and funding occur in one transaction.
2. USDC is pulled with `transferFrom`; no payer is instructed to pre-fund a
   predicted or undeployed address.
3. The factory rejects a token transfer unless the escrow's balance increases
   by the exact configured amount.
4. The agreement becomes active only after exact funding.
5. Agreement identifiers are derived from payer plus client reference, so
   another wallet cannot reserve a payer's identifier.

## Release invariants

1. Release steps are immutable cumulative basis points.
2. Steps strictly increase and end at 10,000 basis points.
3. Only the next step can be released.
4. Only the operator can release.
5. Every release goes to the immutable recipient.
6. The final step releases all remaining principal, avoiding rounding dust.
7. Creation rejects schedules where USDC precision would round any release to
   zero, preventing an agreement from becoming stuck between steps.
8. State is updated before token transfer and all mutating money functions are
   non-reentrant.

## Refund and cancellation invariants

1. The payer can cancel only before any release and only inside the immutable
   cancellation window.
2. After expiry, only the payer can refund the unreleased balance.
3. The operator can cancel and refund the unreleased balance when an offchain
   dispute or fulfillment failure is resolved in the payer's favor.
4. Cancellation and refund can never claw back value already released.
5. Terminal agreements cannot release, cancel, or refund again.

## Identified risks

### Compromised operator

The operator can release steps early, although only to the intended recipient.
Production requires hardened key custody, explicit operational policy, alerts,
and preferably threshold or policy-controlled authorization.

### Malicious or non-standard token

The production factory must be configured only with the verified Arc USDC
contract. Exact-balance funding rejects fee-on-transfer behavior. No arbitrary
token address is accepted per agreement.

### Recipient or payer mistakes

Addresses and schedule values are immutable. The application must show a clear
review screen and bind the onchain configuration to the durable API draft
before requesting approval.

### Timestamp manipulation

Cancellation and expiry use block timestamps. Validators can make small timing
adjustments, so application deadlines need a reasonable buffer and must not
depend on second-level precision.

### Direct token transfers

Unexpected USDC transferred after activation is outside accounted principal.
The payer can recover only the balance above the unreleased obligation. This
cannot reduce recipient principal.

An attacker can also transfer USDC to a predictable future contract address.
Activation therefore requires at least the configured principal rather than an
exact final balance, while the factory independently verifies the exact
per-transaction balance increase. A preexisting balance is excess, not
principal, so it cannot block deployment or increase scheduled releases.

### Denial of service

A failing or blocked USDC transfer reverts the operation without advancing
state. The public integration needs reconciliation and retry monitoring.

### Reorganization and webhook replay

Agreement snapshots are read at a configured confirmation depth rather than
the unconfirmed head. A snapshot must reconcile exactly before it enters the
durable outbox. Delivery retries reuse the same event identifier and payload;
integrators must deduplicate event identifiers after verifying the HMAC
signature and timestamp.

## Required gates before deployment

1. Compile and lifecycle test coverage passes.
2. Fuzz or invariant testing covers conservation of principal and terminal
   states.
3. Arc USDC address and token behavior are independently verified.
4. Operator key custody and rotation strategy is approved.
5. API-to-chain configuration hashing and reconciliation are implemented.
6. Signed webhook events are idempotent and derived from confirmed chain state.
7. An independent smart-contract security review is complete.
