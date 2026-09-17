# 0G archive root encoding correction

The 0G SDK returns a hexadecimal 32-byte Merkle root. The archive writer encoded the UTF-8 characters and truncated them to 32 bytes, anchoring a different value. The writer now validates and passes the exact bytes32 root to the contract.

Verified using a real local ZgFile Merkle tree and ethers ABI round-trip. Malformed roots are rejected. Focused TypeScript compilation passed. No upload or blockchain write was performed by these checks.

The public historical demo endpoint was checked on 2026-09-17T20:29:35.066Z: HTTP 200 and verified true, but the returned root begins with the legacy UTF-8 prefix. Existing records are not repaired by this fix. An archive event alone does not independently verify original settlement, payload availability, or legal compliance.

Direct Render configuration confirms that OG_STORAGE_KEY and OG_ARCHIVE_ADDRESS are present and the writer address matches the verifier's existing contract. No credential values were printed. No key or contract was rotated.
