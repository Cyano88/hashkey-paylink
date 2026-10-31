# Developer and admin portal audit - 31 October 2026

Scope: developer web portal and admin web portal only. No Pocket app/native source, APK build, phone action, payment, real support reply, verification approval or staff grant was performed during this audit.

## Verified and fixed

- Chat release 49e5401fac19e9b59dc3ad889fda5242df2ad0fc is live on Render deployment dep-dbivp9k9v7es738o1mlg. Playwright verified the authenticated developer portal: icon-only launcher, two automated reply avatars in existing history, centered privacy reminder, selected conversation restored after refresh. No message was sent.
- Reproduced business support losing an unsent reply when switching cases. Drafts now remain isolated per workspace/case; sending clears only that case's draft.
- Business support list reads now use generation and request ordering guards. A delayed older response cannot replace newer state or overwrite the result of a mutation. Browser regression deliberately releases an older response after the newer response and verifies it is ignored.
- Related business case actions are disabled during writes.
- Staff access revocation used a browser-native confirm. Replaced with an accessible in-page confirmation naming the account and workspace. Tested cancellation, confirmation, role reset on workspace change, mobile layout and non-owner denial with synthetic grants.

## Checks completed

15 backend suites passed: developer-profile, developer-production-access, developer-product-policy, developer-builder-profiles, developer-app-removal, developer-verification, developer-local-settlement, developer-receiving-wallets, developer-sandbox-boundary, developer-sandbox-simulation, operations-roles, operations-workspace, operations-cases, developer-cli-keys, developer-cli-grants.

12 browser/style suites passed: developer-account, developer-fresh-onboarding, developer-builder-profiles, developer-app-removal, developer-personal-verification, developer-optional-wallets, developer-bank-name, developer-receipts, developer-sandbox, developer-terms, developer-production-styles, developer-console. Tests use synthetic identity/provider data. Existing tests were updated for the accepted Sandbox default, per-profile activity isolation, in-page discard dialog and shared receipt fixture port; one navigation assertion now waits for the screen transition.

Admin Playwright matrix opened Overview, Verification, Businesses, Payments, Support, Products, Team, Audit and Settings. Navigation and Escape handling passed at 320px; no horizontal page overflow or JavaScript page errors. Product role could not open Team; denied identity displayed Admin access required. Team and support interaction tests passed separately.

## Limits and remaining checks

- The signed-in live account support@hashpaylink.com has no admin role. Live admin writes/reviewer actions were not tested or enabled; permissions and operations were tested using isolated fixtures.
- Admin Settings emergency controls deliberately have no provider fixture in the preview, so that screen showed its controlled error state. No pause/resume action was issued.
- Fresh production OTP, real KYC/KYB submissions, real bank settlement, funded payments/refunds and real outbound emails were not repeated in this audit. Passing fixtures are not evidence that all external providers are available.
- No claim of a clean repository-wide typecheck or an exhaustive security audit is made. The Render source build passed for the initial chat release; the follow-up release is tracked separately.
- Selection persistence stores IDs and open/minimized state only. Unsent support drafts remain in memory, not browser persistent storage.

## Country/profile direction discussed, not implemented

Set Personal/Business and country once on each profile. Personal uses residence; Business uses registration. Country may suggest verification and available routes but does not grant production access. Distinguish customer payment method from merchant settlement currency. Additional country routes need explicit eligibility/approval. Reuse applicable existing personal verification; business verification remains separate. Record declared/verified country and approved routes for admin filtering when this feature is implemented.
