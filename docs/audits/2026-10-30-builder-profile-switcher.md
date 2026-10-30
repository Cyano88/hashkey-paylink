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
