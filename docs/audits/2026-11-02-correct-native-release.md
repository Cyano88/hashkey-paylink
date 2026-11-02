# Verified Pocket native source

Build and install Pocket only from C:/Users/USER/pocket-play-update-20261101.
This source preserves the verified original Pixel 1.0.4 APK lineage and the
published 1.0.5 startup fix. Web/backend release checkouts are not native sources.

Current tested Pixel APK: android/app/build/outputs/apk/debug/app-debug.apk,
version 1.0.7 (8), same debug signer as the original installation. See
native-release/VERIFIED-RELEASE.json for SHA256 and checks. No Play publication.

Changes: release the retained Android splash exit callback after its first use;
bound the temporary native cover even when rendering callbacks stall; preserve
the original cold animation and artwork; public checkout stays in the browser;
explicit /open/checkout handoff supports current checkout references; ignore
stale initial intents after a live event and deduplicate repeat delivery.

Source guard: npm run build:pocket-mobile runs scripts/verify-pocket-native-source.mjs.
It checks all original source/artwork hashes except explicitly reviewed changes
and generated Android assets. Do not reset the baseline or bypass this guard to
build from another checkout. Home, feature flags, existing UI and launch artwork
are preserved. All 2,251 native resources/artwork entries match the original APK.

Verified: source guard, source Vite build, Gradle assembleDebug, signature/package,
checkout parsing and handoff regressions, native launch navigation, multi-option
checkout browser regressions, device cold entry, three warm Home returns with
no retained native splash, and public URL refusal by Pocket's intent filter.
Broad dependency TypeScript check still reports pre-existing Arc persistence
errors; it is not a full-project typecheck pass. No funded payment was performed.
The user requested no further Scan to pay testing; the phone was left on Home.

Cleanup: 30 obsolete Pocket APK files and the known incorrect web-source AAB
were deleted after package verification. Non-Pocket APKs were retained. Original
rollback is hash-verified in C:/Users/USER/.hashpaylink/android/rollback/Pocket-original-1.0.4-5.zip.
Old web/backend/native-snapshot build entrypoints now reject native builds and
point here. Account data was retained throughout installation.
