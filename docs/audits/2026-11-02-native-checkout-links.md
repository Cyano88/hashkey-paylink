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
