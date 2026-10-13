# Pocket eSIM production preparation

## Current local implementation

Services uses the existing Pocket menu layout. eSIM Access supplies country and regional catalogs, fixed-volume and daily packages. Credentials remain server-side; wholesale prices are not exposed. Countries use bundled flag artwork. Daily plans retain the provider fair-use terms.

The local server mounts authenticated catalog, retail price and order endpoints. Purchases remain behind `POCKET_ESIM_PURCHASE_ENABLED`. The local app connects Base USDC/USDT wallet approval to durable eSIM intents and includes My eSIMs, installation QR and manual installation. This code has not been deployed as part of the October 13 work.

Retail pricing uses supplier suggested retail plus the existing 25 bps payment fee, calculated in integer units. A quote does not debit a wallet or order a profile. Expired unsubmitted quotes refresh quietly in the checkout. The checkout now obtains the existing signed Circle wallet-send fee quote in gross mode: the exact plan payment goes to the eSIM treasury and network reimbursement goes to the platform treasury. This avoids a second 25 bps fee. The server verifies asset, wallet, recipient, amount, purpose and expiry before binding the quote to the order. The UI shows the combined fee and full debit before approval. Refunds return the service payment in the original asset; the spent network reimbursement is not included.

The order service verifies exact payer, recipient, chain, asset, amount and time window. It reserves supplier float, prevents reuse of a payment, and retries supplier orders with the same transactionId. Provider documentation specifies that duplicate transactionId values identify the same request. Unknown outcomes remain unresolved; no automatic second customer payment is sent.

Installation data is encrypted with AES-256-GCM and bound to the order ID. Only the order owner can read it. The UI distinguishes Confirming payment, Preparing eSIM, eSIM ready, Refund in progress, Refunded and Payment not sent. Success is shown only when installation material is ready. Installation fetch failures stop the shimmer and expose a retry action.

Provider-confirmed canceled profiles can trigger a same-asset Base refund through the dedicated Circle treasury. Refund claims and idempotency keys survive retries and restart. Slow provisioning alone cannot trigger a refund. A stale provisioning response cannot overwrite a refund state. The reconciliation worker runs every 30 seconds; transactions lacking a hash may still require the retained Circle session when the customer reopens the order.

## Verified October 13, 2026

Production configuration inspection and subsequent authorized setup found:

- eSIM Access credential configured.
- Supplier balance: 50 USD, verified through the provider balance API after the October 13 top-up (500000 provider units; 10000 units per USD).
- Dedicated Base SCA eSIM treasury created and verified with Circle: `b9c81558-91c7-562b-abdc-e6f6ade4f1e8`, address `0xfa66554e4ea311839c530e51531b1d300a471708`, existing wallet set `e309e453-89aa-5e0c-8899-20a859906d24`.
- All three eSIM treasury identifiers saved in Render and read back successfully.
- Installation encryption key securely generated, saved in Render and verified without exposing its value. Preserve this key; do not rotate it without a migration for saved installations.
- Durable database configured.
- Purchase switch disabled.

These settings are saved for the next deployment. The latest Render deployment remained unchanged; no deployment, provider order, funds movement or release push was performed during this setup. Purchases remain explicitly disabled.

Local tests cover pricing, float reservations, owner isolation, exact transfer verification, payment replay protection, concurrent order/refund claims, unknown-order recovery, refund restart/idempotency, encrypted installation and status mapping. Browser fixtures cover country/regional navigation, purchase gating, mobile/desktop sheets and installation failure/retry/manual details. These are fixture checks, not proof of a live purchase or installed data connection.

## Remaining launch work

1. Treasury identifiers and installation encryption key are configured and verified in Render; verify runtime configuration after the authorized deployment. Keep the treasury separate from bills until a cross-product transaction-use registry exists.
2. Supplier funding is verified at 50 USD. Select a plan covering the tester's actual country and approve its final customer quote before the controlled purchase. The live Nigeria catalog currently offers 100 MB for 7 days at 0.94 USD retail before the payment and network fees; supplier cost is 0.47 USD. No order has been placed.
3. Activity now reads saved eSIM orders as a separate owner-scoped source, collapses matching wallet transfers/refunds, opens the saved order, and uses the existing receipt layout. Validate payment-attempt recovery without a stored hash on a real retained Circle session before launch.
4. Verify the account's retail permission, activation and cancellation terms. Do not advertise unlimited data or top-ups unless the exact plan and implemented flow support them.
5. Deploy only after explicit approval. Run one authorized funded purchase on an eSIM-compatible device, verify payment, single supplier debit, installation and actual data connectivity. Exercise refund and interrupted-order recovery before broad release.

Leave provider webhooks unconfigured until an authenticated, deduplicated receiver has been implemented and verified. Server polling is the current reconciliation mechanism. Broader usage tracking and top-ups are not yet implemented.

Provider documentation: https://docs.esimaccess.com/

The provider has no sandbox; creating an order spends real supplier funds. Catalog access and passing fixture tests do not establish production readiness.

October 13 follow-up: signed network-fee binding, receipt/Activity identity, USDC/USDT fee selection, one-submission checkout and preparing-to-ready progression passed fixture tests. Plan names are snapshotted for receipts independently of future catalog changes. The refund fixture suite passed again after treasury configuration; this does not establish a successful live refund.
