# Nigeria NIN-first onboarding and Pocket limits navigation

Smile production account capability read confirmed biometric_kyc NG includes NIN_V2 and BVN on 2026-11-15. No identity job was submitted by this read-only check and no provider credentials were printed.

New Nigeria onboarding uses NIN + selfie for Basic, then BVN + selfie for Advanced. Server-owned `ng-nin-first-v1` markers distinguish these jobs from historical BVN-first records. Advanced references its passed Basic record and must match the name/date-of-birth digest. Existing BVN-first approvals, resumable sessions, correction/retry paths, and NIN/government-ID upgrades remain valid. Uganda behavior and USD allowances are unchanged. This is product-tier routing, not a claim of statutory banking-tier equivalence.

Limit details use compact provider rows and the existing flag-based country sheet for airtime/data. Nigeria-only services show a static country label. Profile features now derive from the URL; native Back is owned by the visible feature header, and child routes preserve their parent history. Services uses Travel eSIM with the same globe icon as Limits.

Validation: KYC V3 callback/owner/identity/legacy regression suite; transfer allowance migration and sandbox isolation; new NIN/BVN UI method dispatch; existing KYC recovery/browser suite; limits presentation at 320/390 px with both verification levels and three balance preferences; changed-source TypeScript diagnostics; native debug APK build. Device and deployment closeout follows below.

## Device and shimmer follow-up

- Pixel debug APK updated in place without clearing app data. Actual Android Back, header Back, Profile -> Limits -> detail -> Profile, reopening without stale detail, Nigeria/Uganda sheet selection, and Nigeria-only electricity details passed.
- Final Pixel check held the read-only limits refresh request: Basic and Advanced badges appeared from the same account's confirmed profile before that request completed. Browser regression also covers server removal of verification and account remount isolation.
- Held country data on Pixel to inspect skeletons: no visible loading text. Services Travel eSIM uses the exact same globe SVG as Limits and its action opens `/esim`. Screenshots remain in `.codex-temp/pixel-limits-shimmer.png`, `pixel-limit-country-sheet.png`, `pixel-transfer-polished.png`, and `pixel-travel-esim-services.png`.
- Removed the provider/meter paragraph. The provider table now says only "Available per payment".
- Audited both source roots. Fixed active receipt loading text, gift stock price/holding text, and nonanimated checkout placeholders. Native-only stock-send and sandbox data loaders now use existing skeletons. Inactive old Home components were not revived or changed. Action progress (sending, processing, wallet opening, pull-to-refresh) remains distinct from data loading.
- Receipt browser regression passes pending/failed/successful states, return/Done controls, equal heights and receipt-loading shimmer. Updated stale assertions to the already-approved ISO-before-amount format. Native diagnostics pass across 23 affected/related files; final native build succeeded.
- KYC deployment `dep-dbt172mc6qcc73aehpfg` / `11f61f55d` live at 2026-11-15T20:24:11.814Z. Immediate badges and initial shimmers deployment `dep-dbt1aq56e07s73b5f26g` / `772673de2` live at 2026-11-15T20:31:58.452Z. Final shimmer audit/copy deployment `dep-dbt1gvff3r2c73blo3o0` / `12862c082` live at 2026-11-15T20:44:16.647Z.

Gift-stock picker regression also passed holding precision, missing/zero/unknown values, quote values and bounded quote requests. Native-only patches are recorded in native-release/source-policy.json in the native checkout.
