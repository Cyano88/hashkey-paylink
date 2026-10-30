# Pocket sign-in and developer wallet setup - 2026-10-30

## Product boundaries
- Pocket app: existing sign-in and automatic wallet onboarding retained. Welcome uses exact glyph geometry from native launch wordmark, headline "Your stablecoins can do more.", email and Continue. Supporting feature sentence removed; vertical gaps reduced.
- Developer portal only: optional Enable Pocket wallets CTA reuses the existing Circle setup/controller. No wallet provisioning on mount and no automatic personal receiving-address defaults. Existing/custom/saved receiving addresses remain unchanged until explicit selection and save. BNB/X Layer continue using their separately linked Privy wallet.
- Circle OTP content and controls were not redesigned. Fixed the host wrapper's Android double keyboard subtraction: layout viewport already shrinks natively; transient visualViewport shrink must not be applied a second time.
- Terms acceptance for first-time Pocket users was discussed as a recommendation, not implemented in this change. Existing KYC consent remains separate.

## KYC method switching
- Explicit Change verification method for unsubmitted Nigeria Advanced sessions; defaults back to NIN with fresh unchecked consent.
- Authenticated, owner-bound atomic cancellation retains Basic approval and old audit record. Submitted/provider-bound/review checks cannot be cancelled by this action. Retired upload hints and callbacks cannot approve.
- User has not yet exercised the production switch after backend deployment.

## Verification
- API V3 smoke: owner isolation, Basic preservation, retired callbacks, submitted/review restrictions, prior provider/correlation/consent checks pass.
- Shared KYC browser smoke: change method resets choices/consent; submission/cancellation/error paths pass.
- Optional developer wallet browser smoke: no setup on mount, duplicate-click guard, cancel/error/retry, existing-wallet reuse, custom address preserved.
- Pocket auth theme browser smoke: light/dark, exact launch wordmark, email OTP mock, duplicate send guard, invalid-code recovery, no overflow.
- Wallet bootstrap: six-network owner-bound links, partial retry, stale/mismatched accounts, cached reopening pass. Old retry fixture updated from four to six networks; no production controller change.
- Circle approval surface: native double-shrink reproduced as 276px instead of 464px; fixed test passes alongside anchored footer, internal scrolling, Escape/back/close, late-callback safety. Device-registration and hosted-approval tests pass.
- Circle handoff browser smoke passes after updating the stale fixture action to executeEvmSend: unsigned retry, read-only accepted transfer, expired challenge, empty-ID recovery, pending broadcast, confirmation, failure, SDK close, and late-callback protection. Mock requests only; no production transfer-path change.
- Final full typecheck retains the same 43 baseline errors; normalized comparison found no new errors. Full typecheck is not clean.
- No OTP entered, identity documents submitted, payment signed, or existing merchant receiving settings saved during these checks.

## Release tracking
- 08d42c951 / 99a5719eb: Smile Android viewport correction and Pixel installation record.
- 54d41e36b: KYC method switching.
- c043396d0: optional developer wallets.
- fe4944dc5: Pocket welcome and duplicate request protection.
- 1a50e53bc: concise copy and spacing.
- 8e573380b: Circle wrapper viewport correction.
- Render dep-dbifejm1egvs738u6meg (fe4944dc5) live 2026-10-30T20:06:34Z.
- Final Render dep-dbifhmg473hc73dnp6ug (8e573380b) confirmed live 2026-10-30T20:12:18.95189Z.
- Final native build and Capacitor sync succeeded; Gradle BUILD SUCCESSFUL, adb install Success. Final Pixel welcome screenshot visually checked: concise headline, exact wordmark, tighter spacing, no supporting sentence or overflow. Evidence: output/playwright/pixel-pocket-welcome-final.png.
- Installed APK SHA256: 5D28FCF313F798502B5CE31F13F49846E9B9310A6847AF3B0F6E4C402F1052D8.
- Live Lunchroom developer Receiving accounts verified: optional Pocket wallet section shows existing wallets ready; saved addresses retained. No setup OTP or settings save performed.
- Fresh live Circle OTP completion remains untested in this pass; the account owner must complete it.
- Pixel was observed signed out after returning to verification earlier. No assistant sign-out action occurred; exact session-expiry cause remains unconfirmed.
