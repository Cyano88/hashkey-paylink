# Pocket Stablecoins UI audit - 26 September 2026

## Scope and findings
- Home, Send, bank transfer, Receive, deposits, requests/collections, POS, all Bills categories, Activity, notifications, Profile, security and shared sheets.
- Old platform-wide dark CSS overrode explicit Pocket surface and text classes. Stablecoins now opts out of those legacy overrides.
- Dark pages/header/navigation use black. Cards and fields use subtle near-black levels; Support keeps its agreed blue header.
- Primary actions share a 48px minimum height, 12px corners, 14px semibold text, black/light and white/dark treatment. Secondary actions share an outline treatment. Focus and disabled states are explicit.
- Muted light-theme text was too faint in several screens; secondary text now uses a consistent light/dark pair.
- The bare bank route exposed a redundant Direct Bank Payout chooser. It now defaults directly to the bank-transfer form; explicit collection mode remains separate.

## Bank recipient flow
- Account number, bank selection, Continue, then amount/review. Selecting a bank preserves an entered account number.
- Recent and Favourites tabs show up to four recipients; View all opens a searchable list with the shared back CTA.
- Bank picker follows the XStocks sheet/search/row pattern using the current verified bank catalogue. Neutral bank icons avoid fabricated logos.
- Recipient history comes only from the authenticated owner's funded outgoing bank orders. Encrypted bank details remain in their existing server store; the response is private/no-store.
- Favourite preferences persist by owner and account fingerprint; another owner's recipient cannot be saved. No raw account number is added to the preference journal.
- Recipients are verified afresh before Continue. Late verification replies cannot overwrite a newer selection.

## Validation
- First native audit: 17 Stablecoins routes in each theme, checking crashes, horizontal overflow and rendered CTA dimensions/colours.
- Browser control gallery: normal, disabled and confirming CTAs in both themes; selector styling.
- Existing send-sheet regression passed: no premature status sheet during approval and main Review send remains stable.
- Existing refund-sheet regression and bank-name verification return-navigation regression passed.
- New recipient backend tests: ownership isolation, favourite persistence, no-store responses, no raw account number in preferences.
- New browser tests: account-first order, searchable bank sheet, preserved number, four-recipient limit, favourites, full-list search.
- New verification race test passed with delayed synthetic responses.
- Production mobile builds passed. Final Pixel/web release checks are recorded in the session.

## Limits
- No live money transfers or real favourite mutations were made for testing.
- The older Bills navigation browser harness fails while bundling unrelated Node crypto/stream imports; actual Bills routes were checked on Pixel instead.
- A full-repository TypeScript check did not finish and was stopped. Do not treat this as a clean repository-wide typecheck.
- XStocks-specific screens were not redesigned; shared control improvements can also apply to their shared components.
