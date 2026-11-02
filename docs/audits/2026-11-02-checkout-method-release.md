# Checkout method chooser and Pocket handoff - 2026-11-02

Release candidate: Stablecoins is active. Card, Google Pay, Apple Pay and Bank transfer are disabled Coming soon rows. Official unmodified wallet identity assets and provenance are under public/brand/payments. The neutral stablecoin symbol represents a category, not an approval badge. Existing stock-specific XPay choices retain their separate presentation.

Hosted flow: payment method, Pocket/web choice, then network/asset review. The method list is not repeated in the later selection screen. Native multi-option checkout links open a selection sheet and preserve the selected child checkout and attempt. Explicit selection is required; opening a link never submits a payment. Android intent fallback preserves the checkout and offers retry or a validated Play listing/testing URL when configured. No guessed store URL.

Expiry wording: Payment session expired. Start a new checkout. Return action: Go back. Existing 15-minute default and server expiry remain unchanged. Already-submitted payments continue status checks.

Validation: production source build; focused chooser TypeScript; existing handoff, QR parsing, public checkout, routing, token/network selection, browser card, X Layer expiry and app fallback checks passed. New native-sheet browser fixtures cover 320/390 light/dark, nested Back, duplicate taps, hostile child URL rejection, exact attempt preservation, expired disablement and Close. Browser fixtures do not establish an installed-device or funded-payment result. Whole-repository TypeScript stalled and was stopped; it is not recorded as passing.

Android candidate version is 1.0.5 (6). Packaging must use the scoped commit in an isolated checkout. Play version availability remains to be checked before upload. No Play publication or replacement of the working Pixel installation is authorized by packaging alone. Unrelated billing, retirement and store-listing edits are excluded.
## Release evidence

Source commit: b15e7084b231d6dbca36c7291e46666faf818544 (checkout implementation 0f57e6358 plus Windows packaging warning handling). Render deploy dep-dbk2a0etlv9c73eko2a0 became live at 2026-11-02T05:57:16.077858Z. Post-rollout health is healthy with database available, zero unresolved and zero stale actions. Both official payment-mark assets served from app.hashpaylink.com match the reviewed source after normalizing line endings.

Signed Android bundle: C:\Users\USER\hashpaylink-checkout-release-20261102\android\app\build\outputs\bundle\release\app-release.aab

- App: com.hashpaylink.pocket, version 1.0.5, versionCode 6 (confirmed from bundled manifest).
- Size: 37,953,325 bytes.
- SHA-256: 44D14DA331F92AF0E817724D541B51C2BDF358333F9A060C6F11CDF5C058B458.
- Signer SHA-256: B0:F8:7A:E1:F2:D3:77:08:3E:50:80:5C:D5:B3:C3:EC:F8:37:CC:BD:7C:0A:52:D2:D9:47:EB:95:3D:32:EB:A5; subject Pocket by Hash PayLink / Mobile / Hash PayLink / Lagos / NG.
- Gradle bundleRelease succeeded (447 tasks), including release lint and signing.
- Jarsigner reported jar verified, with self-signed/no-timestamp and JarInputStream ordering warnings. Google bundletool 1.18.3 validate exited 0; its checksum matched the official GitHub release digest before execution.
- The Windows wrapper now checks executable availability and retains nonzero-exit rejection while allowing native stderr warnings. This fixes the initial Browserslist-warning abort.

No Pixel installation, Play upload/publication, or funded transaction was performed. Native browser fixtures and an AAB build are not installed-device acceptance. Whole-repository TypeScript remains unverified; the focused chooser check passed. Play version availability/account readiness and a separate native device acceptance run remain release steps.