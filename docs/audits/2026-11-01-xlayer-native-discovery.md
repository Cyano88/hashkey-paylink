# X Layer native discovery cost control - 1 November 2026

The notification worker previously fetched every block with full transactions, up to 60 every 30 seconds, to discover direct OKB transfers. This release uses OKX's X Layer normal-transactions-by-address-and-block endpoint to discover candidate hashes for registered wallets. Canonical transaction, receipt, chain, block hash, value, parties and confirmation-window checks still determine transfers. Indexer amounts do not authorize or settle payments.

The index query batches 20 addresses, validates page and range metadata, rejects repeated/incomplete pages, and bounds work at 10 pages and 100 new proofs. It replays up to 10,000 blocks to catch delayed indexed results. Canonically verified candidates are cached durably within that range; recent reorg candidates and changed wallet sets are rechecked. The cache and cursor commit with notifications, after enrichment and a final block check. Database session locking avoids duplicate scans across instances.

If indexing, validation or proof discovery fails, the worker uses the existing bounded full-block scan and persists a five-minute index retry delay. POCKET_XLAYER_NATIVE_DISCOVERY=blocks forces the original discovery path. Failure of both paths leaves progress unchanged. ERC20 log discovery, canonical payment preflight and settlement reconciliation remain active. No APK change.

Boundary: this replaces discovery of top-level native transfers only; generic internal native transfers are not newly claimed as supported. Existing proven swap-native legs remain. The replay window is bounded, not a provider completeness guarantee: an indexer that silently omits a transfer beyond 10,000 blocks can still require historical recovery. Indexer-error fallback does not detect silent omissions. Do not claim complete wallet-event coverage or dollar savings from request reduction alone.

Validation: pagination, malformed/foreign/out-of-range rows, cache restart, delayed indexing, canonical proof mismatches, reverted and unrelated transactions, request fulfillment, duplicate replay, fallback, dual-provider failure, and reorg recovery pass. Existing X Layer notifications, trade-notification fixtures and reconciliation-worker fixtures pass. Changed backend TypeScript passes. Live comparison/deployment evidence will be added after verification.

Official endpoint reference: https://web3.okx.com/onchainos/dev-docs/xlayer/developer/data/normal-transactions-by-address-and-block
