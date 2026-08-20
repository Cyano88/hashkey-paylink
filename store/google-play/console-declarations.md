# Google Play Console worksheet

This is a submission worksheet, not a completed legal declaration. Recheck it against the production build and provider contracts immediately before submission.

## Release identity

- Package: `com.hashpaylink.pocket`
- Store title: Pocket by Hash PayLink
- Category: Finance
- Minimum Android: 24
- Target Android: 36
- Initial version code: 1
- Initial version name: 1.0
- Ads: No, provided no advertising SDK or advertising surface is added before submission.
- Target audience: Adults, 18 and over.

## Financial features

Select the features Pocket actually exposes in the submitted build:

- Mobile payments and digital wallets
- Money transfer and wire services
- Cryptocurrency wallet

Do not select lending, credit, investment, insurance, exchange or banking categories unless a separately reviewed feature requires them.

## Data safety draft

### Security and deletion

- Data encrypted in transit: Yes. The Android manifest blocks cleartext traffic and production APIs use HTTPS.
- Users can request deletion: Yes.
- In-app path: Profile, Delete account.
- Public deletion URL: https://pocket.hashpaylink.com/docs/account-deletion
- Privacy URL: https://pocket.hashpaylink.com/docs/privacy

### Data types to review as collected

| Google Play category | Pocket examples | Primary purposes | Required or optional |
| --- | --- | --- | --- |
| Name | Profile and verified beneficiary names | App functionality, account management, fraud prevention and compliance | Optional until a feature requires verification |
| Email address | Privy identity and account support | Authentication, account management, security and support | Required for an account |
| User IDs | Privy ID, Pocket ID and internal profile references | Account management, app functionality and fraud prevention | Required |
| Phone number | Airtime or data recipient number | User-requested bill fulfilment | Optional |
| User payment info | Bank and beneficiary account details where entered | User-requested payout, verification, support and compliance | Optional |
| Purchase history | Payments, bills, payouts, requests, refunds and receipts | App functionality, reconciliation, support, accounting and fraud prevention | Collected when a transaction is used |
| Other financial info | Wallet addresses, balances requested for display, quotes, rates, fees and transaction hashes | Wallet and payment functionality, reconciliation and security | Collected when relevant |
| User-generated content or other info | Payment notes and support messages | Transaction context and support | Optional |
| App interactions | Request and payment state, feature actions and timestamps where logged | App functionality, reconciliation, security and reliability | Collected when relevant |
| Diagnostics | Server-error context and reliability information actually transmitted by the build | Reliability, security and support | Automatic where implemented |
| Device or other IDs | Firebase installation or push token | Notifications, security and device registration | Optional; only after notifications are enabled |

Do not declare location, contacts, photos, audio, health, browsing history or advertising ID unless later code or an SDK actually collects them.

### Sharing review

Provider transfers must be classified from the production contracts and SDK behaviour:

- Privy, Firebase, Render and a provider processing only under Hash PayLink instructions may qualify as service providers under Google Play's definition.
- Circle, Paycrest, participating payout providers, VTpass, billers, blockchains and support infrastructure may receive data to perform a user-requested transaction or may operate as separate controllers.
- Do not mark all provider transfers as exempt without confirming the relevant contract and actual data flow.
- Public blockchain publication is expected when a user initiates an onchain transfer; the privacy policy must continue to explain that public records cannot be deleted.

## App access for review

Prepare a disposable reviewer account with:

- an email inbox the reviewer can access for OTP;
- a documented first-login Circle wallet step;
- a Pocket PIN;
- a PIN fallback so biometrics are not required;
- enough test context to inspect Home, Activity, Requests, Profile and receipts without moving real funds; and
- explicit instructions identifying any feature that cannot be exercised without a real provider transaction.

Never give a reviewer a production administrator credential, private key, seed phrase or real user's financial information.

## Content and policy declarations

- Content rating: complete the questionnaire from actual app content.
- Target audience: 18+; the Terms already require users to be at least 18.
- Government affiliation: No.
- News: No.
- Health: No.
- Ads: No, subject to the final SDK scan.
- Account creation: Yes.
- Account deletion: Yes, after the production endpoint and public page are deployed and verified.

## Organisation and legal checks

- Publish from a verified organisation Play Console account.
- Confirm the developer name, legal entity name, registered address, support email and privacy contact before submission.
- Confirm that provider agreements permit the public consumer flows and countries selected in Play Console.
- Obtain legal review for the final Nigerian payments, virtual-asset, data-protection, consumer and marketing position. Do not describe Hash PayLink as licensed or regulated unless documentary evidence supports the exact statement.

## Assets still required

- 512 by 512 Play icon derived from the approved Pocket icon
- 1024 by 500 feature graphic
- Curated phone screenshots from disposable accounts
- Screenshot captions that match only enabled production features
