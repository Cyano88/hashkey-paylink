# Pocket eSIM integration

## Implemented

Services replaces the bottom navigation XPay entry. Existing XPay checkout/QR URLs remain unchanged. Services links to XPay, Bills and eSIM using the existing Profile menu row styling. Unimplemented Earn is omitted.

`GET /api/pocket/esim/catalog` authenticates the existing Pocket session and reads eSIM Access fixed-volume and daily base packages and locations. Credentials stay server-side. Requests are coalesced, cached for one hour and cooled down after provider failures. Requests use a fixed provider origin and reject redirects. Daily plans show high-speed allowance and provider fair-use speed; duration-dependent pricing and purchasing remain unimplemented. Wholesale prices are not returned to clients. No payment or order endpoint is exposed.

The eSIM screen supports country/regional search, package details and the shared Pocket sheet. Missing credentials show Coming soon. Provider failures show a short retry message. Preparation uses existing shimmers. Purchasing stays disabled even when catalog access is configured.

## Provider access

Create an account at https://console.esimaccess.com/ and open Developer > API Keys. Copy AccessCode into `ESIM_ACCESS_CODE` on the API server only. Do not use a `VITE_` prefix or put credentials in the app. The documented header authentication uses `RT-AccessCode`; SecretKey is for the alternative HMAC authentication method and is not needed for this catalogue adapter. Live read-only verification on 2026-10-12 returned 3,184 plans across 244 destination groups and a zero supplier balance. Angola has fixed plans up to 10 GB and daily allowances up to 10 GB/day; other destinations have fixed plans up to 100 GB. These are provider inventory observations, not universal availability guarantees.

Provider documentation: https://docs.esimaccess.com/

There is no sandbox. Catalogue verification is read-only, but ordering spends the real supplier balance. The documented funding methods are card, PayPal and bank transfer. Customer USDC/USDT payment is separate from supplier treasury funding. Leave the dashboard webhook URL blank until a verified receiving endpoint is deployed. Catalogue access alone is not proof of production readiness.

## Next: payment and fulfilment

1. Verify partner approval, settlement/funding method, retail pricing permission, stock, device compatibility, activation rules and refund conditions against the account's actual API responses.
2. Create a durable, owner-scoped eSIM intent with an immutable package, price, selected USDC/USDT token, network, fees and expiry. Reuse Pocket's confirmation UI and payment approval machinery; never reuse VTPass bill identifiers or mark an eSIM as a bill.
3. Verify the exact customer transfer once, then create one provider order. Use a durable order reference and reconcile unknown outcomes before retrying; timeout does not prove failure.
4. Distinguish payment received, preparing eSIM and ready to install. Persist provider order/ICCID, encrypted installation material and account ownership. Add My eSIMs, installation instructions, usage and eligible top-ups.
5. Implement provider-confirmed failure/refund recovery returning the same paid asset and network. Protect webhook authentication, deduplication and out-of-order delivery. No refund merely because provisioning is slow.
6. Validate success, timeout after submission, duplicate callbacks, failed provisioning, refunds and app restart recovery with fixtures. Then verify a controlled real purchase and installation on a compatible device before enabling customer purchases.

USDC/USDT balances and yields are not changed by this phase. No payment fees, treasury debits, real eSIM orders or live provider claims are introduced.
