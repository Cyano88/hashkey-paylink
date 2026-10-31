# Admin attention badges — 2026-10-31

Red count badges show submitted business applications and support conversations needing a staff reply. Draft, approved, rejected and changes-requested applications do not count. Automated-only conversations, waiting-on-customer cases, resolved cases and pending specialist reviews do not count as support replies.

Counts are scoped to authorized workspaces and projects. Navigation, overview links, workspace selection, project rows, verification cards, support teams and conversation cards show the relevant indicators. Quiet refresh runs every 30 seconds and on window focus; successful staff actions trigger refresh without remounting the conversation or clearing draft replies.

Validation: operations attention and workspace smoke tests; operations cases and developer support regressions; synthetic Playwright desktop/mobile checks including workspace option counts, per-project counts and clearing after updates. No real application was approved and no customer message or payment was sent by these tests.

Screenshots: output/playwright/admin-attention-desktop.png and admin-attention-mobile.png. Typecheck output: output/admin-attention-typecheck.log.
