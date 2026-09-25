# Pocket VTpass production readiness — 2026-09-25

## Verified
- Release checkout audit; no purchases or refunds submitted.
- Deployed Render configuration still selects sandbox; sandbox provider balance/catalog authentication succeeds. This does not verify live credentials, live funding, or live product permissions.
- Live vending is disabled. Existing configuration reports treasury/refund readiness, but live treasury ownership, available USDC/gas, and an actual refund drill still require verification.
- Bills currently collect and verify USDC on Base. Do not advertise multichain bills settlement.
- GET authentication uses api-key/public-key; POST uses api-key/secret-key.
- Server verifies payment before vending; durable claims and request IDs prevent duplicate purchase submissions. Ambiguous outcomes stay pending for authenticated requery. Callback payloads are signals, not settlement evidence.

## Fixed locally
The default webhook referenced nonexistent config.enabled, disabling reconciliation. It now runs when provider credentials are configured, including when new vending is paused. Added regression assertions for enabled, paused, and missing-credential cases. Not deployed yet.

## Validation
Passed: vtpass-config-smoke, vtpass-client-smoke, pocket-bills-handler-smoke, pocket-bills-store-smoke, pocket-bills-webhook-smoke, pocket-bills-refund-handler-smoke. git diff --check passed. These are local regression tests, not live end-to-end certification.

## Production setup
1. On the live VTpass dashboard change API Authentication Type from Basic to API Keys (or All). Generate and store credentials directly in Render, never chat or client-side VITE variables.
2. Server variables: VTPASS_API_KEY, VTPASS_PUBLIC_KEY, VTPASS_SECRET_KEY. Set VTPASS_ENVIRONMENT=live, VTPASS_API_BASE=https://vtpass.com, VTPASS_SANDBOX_VENDING_ENABLED=false, VTPASS_LIVE_VENDING_ENABLED=false during preflight.
3. Use a distinct POCKET_BILLS_STORE_KEY, e.g. hashpaylink:pocket-bills:live:v1. Preserve sandbox history in its existing namespace.
4. Confirm actual live product permissions before setting category whitelist flags; do not inherit sandbox confirmations as evidence. Start with approved airtime only. Verify VTpass wallet funding against VTPASS_MINIMUM_WALLET_BALANCE_NGN. Earning Balance is not proof of spendable wallet funding.
5. Configure callback https://hashpaylink.com/api/vtpass-webhook and deploy the webhook fix. Verify live GET and POST authentication via read-only balance/catalog and an agreed existing transaction requery or customer verification.
6. Verify the configured Circle treasury, refund liquidity, durable storage and refund recovery. Run the read-only live preflight with the production environment, keeping live vending off.
7. Only after checks pass, enable controlled live vending and complete an agreed small purchase to an explicitly selected recipient; confirm delivery, Activity/receipt and retry behavior. Validate refund recovery without fabricating provider failure.

References:
https://vtpass.com/documentation/authentication/
https://vtpass.com/documentation/

## Production preparation update
- Live VTpass authentication and the MTN NGN 100 delivery test passed from Render. Provider IP-whitelist restrictions were disabled by the account owner following VTpass advice for shared hosting.
- Owner reports enabling all electricity and TV products, plus MTN/Airtel/Glo/9mobile airtime and data. Read-only live catalog checks returned 4 airtime networks, 186 plans for the four data networks, 76 TV plans and 12 electricity providers. Catalog access alone is not a delivery test for each provider.
- Added shared 25-basis-point platform fee to new server-generated bills quotes and confirmation details. Provider value remains unchanged; principal plus fee is collected into the Circle bills treasury. Historical intents retain their original amounts; payment retries do not reapply the fee. Refunds follow the verified collected amount.
- Identified and verified the existing developer-controlled Circle bills treasury; owner withdrew its balance. Collection configuration remains unchanged. No pending paid bill/refund obligations were found in current and historical namespaces at withdrawal time.
- Updated preflight to cover all four approved categories. Regression suites and browser settlement/navigation checks are required before release. Public activation is not proof that every provider has passed an end-to-end payment.
