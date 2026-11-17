# Product design consistency checks

Apply to fixes and new features across Pocket, hosted checkout, developer portal and admin tools. Extend established components rather than introducing a parallel visual system.

- Verify the current screen and actual interaction before changing it. Record device, flow, state, source workspace and before/after evidence.
- Back returns one logical step; Android Back closes the topmost sheet first. Close/cancel respect pending operations. Restore focus and preserve applicable draft state.
- Show chevrons only where a meaningful choice or next page exists. Fixed destinations are labels, not selectors.
- Keep primary actions in the established dock. Save is disabled when unchanged, runs once while pending, and shows the established ring with action text. Errors appear above the action and explain recovery.
- Use shimmers for unknown page/section data. Distinguish missing, zero, loading, failed and stale amounts. Do not leave users in indefinite connecting/loading states.
- Reuse MoneyAmount/MoneyText and existing precision helpers. Currency codes precede amounts; signs precede codes. Keep fiat currency and actual token identity distinct. Display preference never changes policy allowances.
- Preserve neutral surfaces, existing icons, spacing, sheet heights, verified green and badge alignment. Check long values, small screens, scrolling, keyboard, light/dark and touch targets.
- Agreed payment icon mapping: Heroicons Wallet for Cash balance; actual token logos for stablecoins; provider logos for external wallets; BuildingLibrary for bank transfers. Keep descriptive labels. Do not replace Cash with banknotes or reuse Earn's CircleStack. Cash funding shows selected fiat equivalent first and actual funding/receiving tokens in details; an FX estimate is not a guaranteed bank payout.
- Keep payer, merchant operator and marketplace seller context explicit in activities and receipts. Payment status must follow authoritative reconciliation, never navigation or return URL alone.
- Reuse approved branding: "Powered by Hash PayLink" and "Global payments with stablecoins." Respect the email-only request for the inline footer logo.
- Prefer plain customer language; expose provider detail only when it helps the user choose or recover. Clearly distinguish product allowance, provider capacity and the accepted quote.
- Verify available/coming-soon states against actual capability. Do not imply provider approval, production support or regulatory approval from a visual label.
- Test changes at the correct boundary: UI interactions and screenshots for presentation; focused regression tests for state/navigation behavior; provider/payment evidence only when actually exercised. Record what was not tested.

Per-flow checklist: entry -> selection -> details -> review -> pending -> result -> activity/receipt -> back/re-entry. Check empty, loading, failure, retry, expired session and duplicate-tap behavior where applicable. Use fixtures for money-moving failure cases; keep live testing within the user's authorization.
