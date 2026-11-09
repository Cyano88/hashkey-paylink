# Marketplace buyer refund reservations

Status: internal implementation; not deployed. Original collection verifier is absent by default.

## Changes

- Separate marketplace:refund scope and strict request fields; no caller-selected destination, asset or result.
- Trusted original collection binding to payment/funding proof, verified wallet payer, asset and holding. Wallet-origin Base USDC/USDT only; unsupported original rails fail closed.
- Atomic multi-allocation reservation, explicit commission selection and pending/available provenance. Spent/reserved money cannot be refunded again.
- Immutable original-payer binding, normalized idempotent retries, refund-ID uniqueness and concurrent overspend protection.
- Generic commands cannot bypass the bound refund path or finalize child refunds.

## Validation

Refund fixtures cover absent/mismatched collection proof, wrong token/route/payer, scope and payload restrictions, duplicate/overprecision inputs, later-allocation rollback, commission inclusion/exclusion, pending plus available consumption, restart/retry, changed destination rejection, competing refunds, uncertain child status, paid-fund exclusion, USDT same-asset return and generic-command bypass rejection.

Evidence and accounting stores are synthetic fixtures. No buyer funds were returned and no production collection/session was verified. No UI changed. Remaining regression/typecheck results are recorded below after completion.

## Remaining

Production original collection verification, original-route handling for fiat/exchange payments, grouped execution claims/signing, refund fee policy, canonical refund reconciliation/events and live canaries remain open. The original payer must be verified through payment/session evidence, not inferred from transaction.from. A reservation is not a completed refund.

Verification result: all twelve marketplace fixture suites passed. Focused TypeScript diagnostics passed for sixteen marketplace files. This does not establish production refund execution or verified live funding.
