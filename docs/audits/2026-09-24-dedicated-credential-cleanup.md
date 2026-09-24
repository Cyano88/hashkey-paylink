# Dedicated credential cleanup - 2026-09-24

Removed unused RELAYER_PRIVATE_KEY_ETH from Hash PayLink Render. Before deletion its value matched retained active RELAYER_PRIVATE_KEY exactly; all remaining values, including dedicated Pocket secrets, verified unchanged after deletion. Settings: 158 to 157. No signing keys revoked, funds moved or secrets written to this report.

Removed PRIVY_APP_SECRET fallback from production PIN hashing and Arc/XStocks quote signing. Existing POCKET_PIN_PEPPER and POCKET_SWAP_QUOTE_SECRET remain byte-for-byte unchanged; hash/signature format and stored data unchanged. Added dedicated settings to templates and corrected docs. Local development PIN fallback remains; missing production pepper and missing/short quote secret fail closed. PIN pepper still preserves the historical derivation value; this is isolation, not a new pepper or completed Privy rotation.

Validation passed: full Pocket payment security, PIN key separation (including missing dedicated production pepper), XStocks execution, Arc swap checks and quote key isolation (same signatures before/after provider credential changes, missing/short quote key rejection). All synthetic, no live transaction or wallet operation.

Merged already-queued developer-portal release 77f0500d5 into security branch before this change to preserve concurrent release work. Operator provisioning idempotency references remain held pending provisioning/recovery ownership review. Remaining shared relayer aliases, provider-key rotations and historical compatibility code are not declared obsolete.
