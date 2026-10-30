# Builder profile switcher - 2026-10-30

## Requested placement and behaviour

- Personal / Business segmented control sits at the top right immediately before the account/profile button. Business uses the building icon; Personal uses the person icon. The selected option is highlighted. Narrow layouts show icons; larger layouts also show labels.
- Production / Sandbox remains a separate bottom-left environment control.
- Business selection opens the existing business context; select Business again to choose another business or add a profile. The current business name appears above the workspace content.

## Data and verification boundaries

- One login owns a Personal profile plus separate business profiles. New business profiles live in `hashpaylink:developer-business-profiles:v1` with an authenticated owner ID.
- Existing individual apps resolve to Personal. Existing business apps resolve to separate stable business contexts. No companies are merged based on a shared login or name; existing project IDs, keys, settlement configuration, receipt settings, activity and verification records remain unchanged.
- New apps inherit the selected profile type. The server validates profile ownership and rejects mismatched types. Business context is preserved for additional apps even if the original legacy app is later removed.
- Back-to-apps navigation, environment changes and direct project links retain or resolve the correct profile. Switching clears revealed secrets and stale editor state; pending requests remain bound to their original profile.
- Each profile has separate sandbox data and credentials. Existing account-level sandbox data remains in Personal. A sandbox API key is bound to its own namespace and cannot select another profile.
- KYB is not copied or auto-approved by profile creation or switching. Existing app-level verification and fiat eligibility gates remain enforced; personal KYC does not become business KYB. Team invitations/RBAC and shared KYB approval across apps are not introduced here.

## Checks

- New profile handler suite: existing-context preservation, inherited/immutable type, foreign-owner rejection, app listing isolation, personal/business sandbox separation, credentials bound to profile.
- New Playwright suite: header position, business creation and selection, app creation in selected business, personal/business app isolation, sandbox separation, cleared secrets, direct project links and Back to apps, 320/390/640/768/1440 widths in light/dark. Screenshots inspected.
- Existing developer project adapter, sandbox simulation, production KYC/KYB gates, verification/reviewer, live sandbox boundary, sandbox browser and business-verification browser suites passed.
- Production build passed (exit 0). Full repository typecheck: 43 existing diagnostics, identical to the previous release baseline; no new diagnostics.
- No live funds, provider submissions, real identity documents or customer notifications used for these checks.

## Live release verification

- Source commit `16a9c7828f7b7703e78a1ab64441df7fcce576de`; Render deployment `dep-dbibj861egvs73e5a73g` live at 2026-10-30T15:43:00Z.
- Authenticated Playwright check confirmed Business/Personal controls immediately before the account avatar (8px gap), correct pressed state, existing business context selection, and an empty separate business sandbox.
- Personal retained the prior paid simulated checkout `test_chk_02e75ca287364bfd94d027090b8ea4fd`; switching back restored it. No real business profile or payment was created during live verification.

## Correction: app names are not business identities

The initial release incorrectly used legacy app names as business profile names. Legacy contexts now display Business profile not set; the app name appears only as an explicitly labelled app in the selector. The owner can select Set business name to confirm the business owning the existing apps. This stores an explicit profile name without changing app IDs, settings, credentials or verification. Adding another app to an unnamed legacy context requires completing this setup first. Existing explicitly created profiles keep their chosen names.

Verification: profile handler tests cover unset names, owner isolation, validation, setup and unchanged app records; Playwright covers blank name entry, saving an explicit business name and preserving the app name, alongside existing responsive/profile tests. Project adapter suite and production build passed.

Correction release `5790236ab237444a1207d54bd795d9b60a301763`, deployment `dep-dbibt6k9v7es73c8bvv0`, live 2026-10-30T16:04:20Z. Authenticated live Playwright confirmed Business profile not set replaces the inferred Hash PayStream business label and Set business name opens an empty field. Closed without submitting a business identity. Full typecheck remains 43 identical pre-existing diagnostics, no additions.

## In-app unsaved edit confirmation

Replaced portal navigation window.confirm prompts with a styled accessible dialog offering Keep editing and Discard changes. Escape keeps edits; cancellation retains the current profile and editor. Dirty checks apply only to the active editor, and profile setup restores saved app fields instead of clearing the webhook draft. This fixes the false discard warning after naming an existing business.

Playwright passed native-confirm rejection, no prompt after business setup with an existing webhook, retained edits on Keep editing/Escape, explicit discard on profile/environment changes, and unchanged saved webhook data. Existing profile/isolation/responsive cases passed.

## Deleted app selector correction

Deleted app tombstones were excluded from the app list but still produced inferred business profiles. The shared profile resolver now excludes deleted apps and discards unnamed stored legacy contexts without a surviving app. Explicitly named business profiles remain independent of their app count; closed app history remains accessible. Handler tests verify deletion exclusion, rejection of the deleted inferred profile ID, stale stored legacy cleanup, and preserved explicit businesses/closed records. Playwright confirms deleted apps do not reappear in the selector.

The in-app discard release `b8f0b434e2b934a1265d1baf8ebfa3ed42816bd1` is live via `dep-dbic6imtlv9c739f1b20`; build passed and typecheck has the same 43 pre-existing diagnostics.

Deleted-app correction `436d29cd55f506fd043dc243c98b693495371f68` live via `dep-dbica55g1s2s73ejgel0` at 2026-10-30T16:31:41Z; production build passed. Live Playwright confirmed PolyDesk LP Scout no longer appears in the business selector, Lunchroom remains named and selectable, and remaining contexts are Hash PayStream and PolyDesk. Live discard dialog also verified Keep editing preserves the temporary draft and Discard changes leaves without creating an app.
