# Hash PayLink detox restart - 2026-09-19

## Verified checkpoint

- Repository: Desktop/polymarket-lp-sentinel/hashkey-paylink.
- Local branch: migration/arc-mainnet-20260916.
- Local HEAD and live Render release: 69a6eeacc98d2611ec8a278b9e205beaa91b9432.
- Render deployment dep-dam4u0vqj5pc73e4v4r0 remains live, checked through the service API on restart.
- Existing dist changes, prior audit edits, untracked migration scripts and mobile config were preserved.
- Codex provider configuration remains unchanged. The separate 0G compute experiment is outside this repository.

## Completed local change

Corrected src/pages/docs/ZeroGStorage.tsx using the archive writer and legacy lookup implementation as evidence. Removed retired Telegram/web Agent Hash promotion, unconditional archive coverage claims, and the deployment-to-latest scanning example. Documented the exact limits of legacy verified=true, historical root encoding and archive versus settlement evidence.

Validation: esbuild TSX transform passed; targeted git diff --check passed. No browser layout validation or production deployment yet.

## Next bounded stages

1. Trace every consumer of agent-verify and its authorization semantics before changing or retiring the legacy API. Inspect rate limiting and history-scan cost. Do not silently break Pocket or historical receipt access.
2. Complete public documentation/retired-route review, build and visually check, then release the reviewed batch.
3. Reconcile remaining RPC credential retirement against current Render configuration and provider usage. The previous audit is not proof that every old key was revoked.
4. Verify authenticated developer/Pocket flows and funded mainnet paths separately; do not infer these from build or public RPC success.
5. Inventory obsolete infrastructure/data with active obligations and retention dependencies before deleting. Preserve embedded HashPayStream identifiers and rollback until migration parity is proven.

No credentials rotated, production data deleted, funds moved or contracts deployed during this restart stage.
