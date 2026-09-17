# Mainnet checkpoint public configuration

## Change

HTML injection previously selected unsuffixed checkpoint factory variables and a hardcoded legacy fallback. The public API selected mainnet variables instead. Since runtime HTML overrides build-time settings, a mainnet browser could receive the wrong factory.

A shared runtime configuration builder now supplies both surfaces. The content recovery backend uses the same mainnet factory reader. Server MAINNET configuration takes precedence over the VITE MAINNET alias; explicitly empty, malformed, and zero addresses fail closed. Legacy variables are ignored. This validates address shape, not a contract deployment or its suitability.

Saved checkpoint recovery is attempted before the new-vault factory check. Existing direct-vault content, release, receipt, and refund paths remain unchanged. No records were deleted and no contract was deployed.

## Verification

- Public runtime configuration smoke: selection, absent/invalid/zero values, precedence, retired aliases, inline script escaping, real public API parity, and source recovery ordering passed.
- Focused TypeScript check for changed public configuration modules passed.
- Arc mainnet boundary smoke passed.
- Direct Render environment lookup found none of the four legacy/mainnet checkpoint factory variables. This does not establish inherited environment-group contents.
- No funded transaction or authenticated saved-session recovery was performed.

## Remaining audit

The recovery fallback in modules/streampay/api/content.ts searches factory logs from block zero when no saved link exists. Review deployment-block bounds and RPC budgeting separately while preserving recovery. A reviewed mainnet checkpoint deployment is required before enabling new creation; this change does not supply one.

Isolated production Vite build passed (2m 17s).
