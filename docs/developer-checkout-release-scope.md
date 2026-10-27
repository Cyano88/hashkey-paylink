# Developer checkout release scope

New developer projects use human checkout and can select Accept payments
(`hosted_checkout`), Fund Polymarket accounts (`polymarket_funding`), or both.
Receiving accounts, supported networks, API keys and webhooks are configured after creation.
Payment readiness and provider approvals remain enforced independently.

## Deferred products

Agreements, Hash PayStream and agent payments (x402) appear as Coming soon on
Products. Swap is not part of new developer onboarding. New projects cannot
select these capabilities through either the portal or the project API; existing
projects cannot add previously absent deferred capabilities.

Implementation stays in its existing modules to preserve imports, persisted IDs,
receipts and recovery paths. `modules/streampay` remains the legacy compatibility
module. This release does not delete contracts, move persisted records, revoke
existing keys or shut down existing customer integrations. An eventual shutdown
requires a separately verified migration and notice plan.

## Checks

- Project adapter smoke: new deferred selections rejected, existing settings retained.
- Product policy smoke: legacy permission migration and network boundaries retained.
- Product picker browser smoke: two choices, at least one required, no mobile overflow.

## Pre-deployment audit

The complete form validates before submission, supports keyboard submission,
locks editing during requests, prevents repeated submit events, and preserves
input on failure. Settings are also locked while saving. The API rejects
malformed product arrays and rechecks deferred-product permissions atomically.

Verified with the project adapter, product migration, CLI project/key and sandbox
boundary tests; browser tests for the actual form at 320px and 390px; and a full
portal fixture for create-to-overview navigation, payload, settings and cancellation.
No live customer projects or payments were created by these tests.
