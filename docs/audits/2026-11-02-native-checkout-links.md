# Native checkout link routing investigation - 2026-11-02

Worktree: hashpaylink-checkout-release-20261102, branch fix/native-links-20261102.
Public merchant checkout should remain in browser until explicit Pay with Pocket.
Installed Pixel 1.0.4 (5) claims app.hashpaylink.com/pay routes and ignores chks references.
Synthetic cold/warm references reproduced early app interception and ignored chks,
but did not reproduce the reported white screen. Actual developer link still needed.

Local changes separate /open/checkout/ native handoff from /pay/c/ browser checkout,
restrict Android manifest and host-specific associations, normalize scanned handoffs,
prevent stale initial launch URLs superseding new appUrlOpen events, deduplicate events,
and show visible loading with manual retry after 15 seconds instead of empty startup UI.

Passed: pocket-native-links-smoke, checkout-handoff-smoke,
pocket-native-launch-navigation-browser-smoke, pocket-handoff-fallback-browser-smoke,
pocket-boot-fallback-browser-smoke, focused native-link typecheck, full source Vite build.
No deployment, native packaging, installation, or funded payment for these changes.
Existing 1.0.5 (6) AAB predates these edits. Do not describe it as containing this fix.

Follow-up during investigation: builder receiving-wallet setup reports HTTP 409 from
our developerAdditionalWallet guard. Existing recovery fixtures pass; account-specific
production read-only investigation underway. Do not bypass ambiguous history or choose
an arbitrary newest wallet. No Circle recovery code or production links changed yet.

## Pixel reproduction and release preparation

After the user's checkout tap, Pixel showed a blank Pocket surface. CDP still
reported a fully rendered /home/deposit page (133 text characters, visible layout),
while Android's view hierarchy showed a retained android.window.SplashScreenView.
CDP screenshots timed out. Calling PocketLaunch.ready did not release the overlay.
Installed APK 1.0.4 (5) was pulled and its MainActivity inspected with apkanalyzer:
it contains launchProvider, launchReleasePending, setOnExitAnimationListener and
postOnAnimation/postVisualStateCallback cover-removal code absent from release
source. A retained exit handler can hold a warm-launch splash after first release.
Current source delegates splash exit removal to Android and has a 15-second hold
limit. Native update must be verified on cold and warm link launches.

Pixel APK signer matches the local Android debug certificate (SHA256 9B2452D8...ADCADDE).
Preparing a compatible in-place test update, version 1.0.6 (7), preserving app data.
Branch now includes deployed builder canonical recovery via merge 7ef1ffab3.
