# Product UI and interaction audit

## Scope and evidence

Product Design plugin 0.1.56 (Codex curated marketplace), audit workflow. This is a product consistency review, not institutional certification or regulatory approval.

Fresh Pixel 10 Pro evidence: `output/design-audit-20261117/`. Native source is the separate `C:/Users/USER/pocket-play-update-20261101` workspace. Do not replace it wholesale with hosted-web source.

## First walkthrough: Receive / Add cash

1. Home: session restored; currency code and negative signs in recent activity follow the approved order. Screenshot 01.
2. Receive: opened from Home, four clear navigation rows. Screenshot 02.
3. Add cash: bank description mixed USD with Naira and implied both were available. Screenshot 03.
4. Bank currencies: USD enabled, NGN explicitly Coming soon. Android Back returned to methods. Screenshot 04. Account opening/provisioning was not attempted.
5. Crypto funding: balance finished loading; Continue disabled for zero amount. Available balance used a suffix currency code. Screenshot 05.
6. Source network picker: Android Back closed only the picker and restored focus to its trigger, retaining the funding sheet.
7. Destination picker: offered only the already-selected Cash balance. Unnecessary choice. On-screen Close returned to the funding form; its Close returned to methods.

## First fixes

- Bank description: "Choose an available currency"; supported/coming-soon choices remain explicit on the next screen.
- Shared bridge available balance uses existing MoneyAmount typography and code-before-amount order.
- Cash funding declares a fixed destination; render the existing wallet icon and Cash balance label without a picker/chevron. Other bridge destinations remain selectable.
- Native source allowlist adds only the reviewed Add cash page. No payment execution, quote, session or provider logic changes.

## Remaining review

Home merchant identity visibility needs further inspection (merchant logo and generic Web payment text observed). Send, Bills, Travel eSIM, limits/KYC, QR, receipts, hosted checkout, developer portal and admin approvals still need current-run walkthroughs. Real KYC document submission remains deferred at the user's request. This first pass does not certify whole-product consistency or accessibility compliance.

## Verification status

### Native contact-picker follow-up

Reproduced browser API failure on the Pixel by observing only the thrown error: TypeError, "Unable to open a contact selector". API presence was not proof that this WebView could open it. No contact contents logged.

Added registered PocketContacts Capacitor plugin using Android ACTION_PICK with Phone.CONTENT_TYPE. Reads only Phone.NUMBER from the returned content URI, adds no READ_CONTACTS/WRITE_CONTACTS permissions, rejects unusable results, and resolves cancellation separately. Native calls never fall back to the failed web API; supported browsers retain their existing picker. UI retains existing country normalization/network selection and guards concurrent taps.

Adapter smoke test passed native selection/cancellation, absent plugin, unsupported native platform, web selection/cancellation/error and no native-to-browser fallback. Java compilation, native lineage/preflight, Vite, sync and Gradle passed. Installed preserving data; zero startup errors, two existing connector warnings.

Actual Pixel click opened Google Contacts ContactPickerActivity. Android Back returned to Airtime without an error and cleared busy state; reopening passed. No contacts were enumerated or captured in screenshots. Picker left open for user-selected-number verification, requested asynchronously; completion of that live path is pending user input.

Payer receipt screenshot 18 inspected: successful payment identifies Paid to Lunchroom, Sent, Base, destination and fee with approved footer. Old wallet glyph remains for stablecoin payment and needs alignment with the agreed token-logo mapping. Exact amount is intentionally unchanged. Source inspection also found legacy Lucide Cash paths versus current Heroicons UI; include both canvas/PDF exports and app UI when aligning icons. No new receipt or payment was created.

### Startup, merchant identity and Bills follow-up

Safe-area error traced to installed Capacitor Android 8.5.0 `SystemBars.injectSafeAreaCSS`: native inset callbacks can run before documentElement exists. Corresponding upstream report: https://github.com/ionic-team/capacitor/issues/8530. Added native build-time patch with exact-source guards and idempotence; it skips absent-document injection while retaining later DOM-ready/commit callbacks and all four inset properties. `scripts/pocket-safe-area-smoke.mjs` tests absent/ready DOM, values, idempotence and changed-upstream failure. Test passed. No inset handling disabled and no global error suppression.

Native merchant activity row now renders merchant name as primary text, Web payment/date underneath, retaining logo, amount and status. Screenshot 12 captured the old logo-only identity in Home recent activity; screenshot 13 confirms Lunchroom text after installation. First patched launch reported zero console errors and two existing Privy connector warnings. Session restored and content remained below system bars.

Airtime screenshot 14 exposed NGN preset buttons but a naira-symbol amount field. Both airtime and electricity fields now use NGN/UGX; same two copy replacements applied to hosted source. Native Available cash now uses shared MoneyText typography. No provider, allowance, phone or amount parsing changes. Native source allowlist adds only the reviewed CashAvailable typography file.

Bills entry and Airtime entry tested; country sheet opens, Android Back closes it, and header Back returns to Bills. Initial catalog loading disables network selector; it becomes enabled after loading. Empty amount disables Continue. No bill purchased. Contacts-unavailable message observed after user interaction; code already checks browser API availability, so underlying picker failure remains unresolved, not classified as unsupported without evidence.

Hosted source changes remain undeployed. Native final Bills build, sync, Gradle and install passed. Screenshots 15/16 verify Airtime currency field and Available cash typography in light/dark; 17 verifies Electricity field and provider-loading shimmer. All screenshots inspected. Both updated app launches had zero console errors; two Privy connector warnings at startup remain, with warnings repeated during theme changes. Original light theme restored, USD display unchanged. No bill submitted and no contact list read. Country sheet, header Back and navigation through Profile/Home/Bills exercised. Contact picker failure remains a follow-up. No whole-product or full-accessibility completion claim.

### Cash display follow-up

USDC cash funding now renders the selected fiat equivalent as the primary receiving amount, retaining USDC as a secondary detail. The confirmation uses the same fiat component. New display-only helper rejects unknown/negative/nonfinite amounts and stale, expired, wrong-currency or wrong-asset rates; zero does not require FX. Local values are marked approximate. Payment amounts, quotes and allowance calculations are unchanged.

`scripts/pocket-cash-display-smoke.mjs` passed USD/NGN/UGX, rate changes, zero and invalid-rate cases. Native lineage check, Vite build, Capacitor sync and Gradle build passed; installed preserving data. Pixel evidence 09 (USD dark, loading source balance) and 10 (NGN light, loaded source balance) captured and visually inspected. Wallet icon, selected fiat primary, token secondary, loading and disabled Continue are visible. Closed sheets and navigated back through methods/Receive/Home successfully. Original light theme and USD display restored. Positive funded quotes and confirmation were not exercised live; tests cover display calculation, not a real top-up. Other cash funding adapters and wider checkout/receipt icon propagation still require review.

Bank transfer entry inspected: screenshot 11 captures recent-recipient loading shimmer; subsequent DOM confirmed recipients loaded. Empty details keep Continue disabled. Country selector opens, Android Back closes it, and header Back returns to Send. No recipient chosen or transfer submitted.

New unresolved runtime finding: two startup `Error injecting safe area CSS: Cannot read properties of null (reading 'style')` errors observed after install; app subsequently opened and session restored. Not attributed to the cash display change and not fixed by this batch. Two Privy Solana-connector warnings also present. Do not claim a clean runtime or whole-product theme audit.

Native lineage check, production configuration preflight, Vite native build, Capacitor sync and Gradle assembleDebug passed. Installed with adb install -r, preserving app data. Session restored on launch.

Post-install Pixel screenshots 06 (methods), 07 (funding shimmer) and 08 (loaded funding) captured and visually inspected. The bank copy is correct, the available amount reads USDC <0.01 using shared typography, and Cash balance has no selector or chevron. Source selection remains enabled after loading, zero-amount Continue stays disabled, Android Back closes the nested source picker, and on-screen Close returns to Add cash methods. No browser runtime errors observed (two existing warnings). No transaction, account provisioning, email or configuration write performed. No full TypeScript or accessibility conformance claim. Hosted production was not deployed for this native-only batch.

### Checkout icons and Add cash follow-up

Shared checkout Cash balance row now uses Heroicons Wallet in main and native sources. Pocket QR payment choices use the selected stablecoin logo through an allowlisted, failure-safe presentation component; pre-selection retains the neutral category icon. No payment route, amount, audience or fee changes. First native build, sync, Gradle build and Pixel install passed; session restored with zero errors and two existing warnings.

Owner flagged Add cash on Receive. Screenshot 19 confirmed legacy Lucide wallet despite the Heroicons agreement. Replaced shared native pocketCashIconPaths with exact installed Heroicons 2.2.0 Wallet path, affecting cash UI and cash canvas receipt exports together. Added this reviewed path to the native release allowlist. Rebuild/device verification in progress.

Main full typecheck failed in api/pocket/checkout-activity.ts: fiatCurrency string is wider than PocketActivityRow NGN|UGX. This file was not changed by the icon work. Do not claim main typecheck passed. Main checkout edits remain undeployed; broader stablecoin receipt/email/PDF propagation remains open. Contact selected-number live autofill is still awaiting confirmation.
Add cash follow-up verified: Vite emitted successful build, Capacitor sync and Gradle succeeded, APK installed preserving data. Pixel screenshot 20 inspected and confirms Heroicons Wallet on Receive/Add cash; zero console errors, two existing warnings. Left Pixel on Receive. PowerShell redirected build invocation returned 1 with warning records despite Vite success; subsequent native packaging and device verification passed.

### Receipt identity parity and audience checks

Added a shared allowlisted receiptTokenLogo mapping to main and native receipt UI/canvas exports, and server billing/marketplace email/PDF presentation. Supported USDC, USDT, USDe, USDG and EURC use bundled monochrome marks; bank/card/refund and cash-funding exclusions retain their identities. Unknown assets keep the generic fallback. Owner explicitly confirmed monochrome; UI inverts the monochrome mark in dark mode and PDFs/email use fixed monochrome artwork. Original brand artwork remains intact. No financial amount, route or audience behavior changes.

Main checkout activity type error fixed by validating local fiatCurrency against the activity schema's supported NGN/UGX values. Full main typecheck passed. Attempted removal of internal merchant fee metadata was reverted after tests showed it is needed for transaction deduplication; the existing receipt adapter already strips it for payers. Tests now assert that boundary explicitly. Updated stale assertions to the established currency-first format and payer zero-fee display.

PASS pocket-checkout-activity, marketplace-receipt-audience and receipt-scoped-presentation smoke suites: ownership, revoked/ambiguous seller links, exact debit/fees, deduplication, funding binding, report scope, token exclusions and HTML/PDF generation. No emails sent. Payer and seller PDFs rendered and visually inspected. First native build installed and real payer receipt verified on Pixel (screenshot 21); monochrome follow-up build in progress. Main web/email changes remain undeployed. Full checkout dark/light/back/error audit is still open.
Monochrome follow-up completed: native Vite, sync, Gradle and install passed. Pixel screenshot 22 visually confirms monochrome USDC receipt mark on the incoming receipt currently opened by the user; no console errors, two existing warnings. Shared receipt image has dark:invert; dark screen appearance not yet visually verified. Payer monochrome PDF rendered and inspected. Main web/email changes are still undeployed.

### Theme and action audit pass

Pixel: receipt header Back returned to Activity; Android Back closed receipt and returned to Home. Changed theme through Profile UI, captured and inspected screenshot 23. Confirmed square background around circular USDC mark on dark receipt. Added rounded-full to receipt token images and shared checkout token component in both source trees, matching existing Pocket selectors. Native lineage/config checks, Vite, sync, Gradle and install passed. Screenshot 24 visually confirms fix in dark mode. Restored original light theme and Home. No console errors; existing connector warnings persist. No new payment/share action performed.

Checkout fixture browser checks passed at 320/390/412 widths: exact execution values, fiat/stablecoin/tiny presentation, loading spinner, disabled busy controls, no intermediate enabled Continue flash, review Back/native Back, preserved method control, double-submit guard, approval cancellation, Close and overflow. Screenshot checkout-precision-320 inspected. Cash handoff browser suite passed Android intent/method preservation, desktop QR/download, explicit web continuation and zero payment writes. These are fixture results, not live transactions or a full production checkout theme audit. Web edits remain undeployed; developer portal and remaining screens still need audit.

### Developer onboarding and approval design audit

Live onojacyano Chrome was not exposed to Playwright/CDP, so this pass used existing local synthetic portal and operations previews (4319/4321). No live keys read, documents submitted, support messages sent or approval state changed.

Reproduced/inspected verification-save-before.png: clicking Save draft changed the separate Continue button to Saving, without a spinner on the clicked action; fixed with separate draft/submission pending identity and rotating rings. Upload/download busy states no longer misleadingly rename Continue to Saving. Mobile support launcher covered the primary action; reserved launcher clearance in verification-actions below 640px. Inspected verification-saving-320-dark.png after fix. Busy suite passes 320/390 light/dark: correct action text, spinner, disabled controls, double-click lock, no support overlap, no horizontal overflow, preserved input on error and successful retry.

Admin app-details screenshot showed duplicate Payment access sections. BusinessVerificationReview now supports showPaymentAccess (default true); only DeveloperOperationsPage suppresses its duplicate because that page already owns OperationsControl. Dedicated verification queue keeps access controls. Admin review browser suite passes Smile reference/checklist gating, approval/history/change-request fixture transitions and exactly one Payment access section. Updated verification-review-mobile.png inspected after fix. No approval policy changed.

PASS fresh onboarding fixture, full verification browser suite (320/390/768/1440 both themes, uploads, wizard, draft, pending submission spinner/lock, review state, status search), developer verification backend suite (owner/reviewer isolation, evidence/revision gates, audited downloads, reopening), and diff whitespace checks. Preview bundles compile. Changes are local and undeployed; no signed-in production walkthrough or whole-product accessibility certification.

### Developer app setup/settings audit

Used synthetic portal preview; signed-in onojacyano Chrome remains unavailable to Playwright. Verified app setup/navigation, receiving accounts, webhook dirty guard, receipt settings and light/dark screenshots. Confirmed Save changes remained enabled after successful settings save. Added effective-draft dirty comparison to SetupPanel and saved-URL comparison to WebhookPanel; preserved Continue to receiving accounts for incomplete setup. Explicit projectSaving state gives aria-busy and Saving text during save. Save disables unchanged/reverted/successful state and remains available after failures with entered data retained.

Regression test exposed hidden legacy receipt enabled:false causing false dirtiness after reverting visible fields. editableProjectState now compares receipt defaults with enabled:true (matching existing always-on delivery policy); this affects UI dirty detection only, not API payload validation or delivery policy.

New developer-settings-save-browser-smoke passes receipts+webhooks: unchanged/reverted disable, edited enable, pending spinner/aria-busy, duplicate-click lock, failure retention, retry and saved baseline. Light/dark screenshots generated; settings-save-webhooks-dark.png visually inspected. Existing console, receipt settings, account navigation/themes, bank-name stale-response/shimmer/error/retry, optional-wallet enable/cancel/custom-address preservation, product picker and removal-confirmation/error/read-only-history suites passed. Preview bundle compiles and diff whitespace check passes. No live keys read/rotated, wallets created, settings updated or apps removed. Changes remain local and undeployed; full production walkthrough remains open.
