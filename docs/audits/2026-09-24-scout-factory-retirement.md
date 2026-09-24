# Retired Scout, stream invitations and manual factory execution — 2026-09-24

User confirmed Scout belongs to the separate OKX AI / PolyDesk product, old creator HashPayStream is retired, and RELAYER_PRIVATE_KEY must remain.

Implemented release: 0ff3ad7954aa92c807a83b170646281c70627f2f (includes newer developer network-policy release 03929b9).

- Scout API, legacy stream invitations, and relay-v2 return HTTP 410 before provider access, email, or signing.
- Service-wallet pay-lp-scout action retired; generic pay-service authentication and explicit destination allowlist retained. No default Scout destination.
- Scout wallet-manager link points to standalone PolyDesk.
- Browser manual-deposit factory map is empty. Historical dashboard factory configuration and receipts remain.
- Removed Render settings: X402_SELLER_ADDRESS, X402_POLYMARKET_SCOUT_PRICE, STREAM_INVITE_FROM_NAME, STREAM_INVITE_FROM_EMAIL, VITE_STREAM_FACTORY_ADDRESS, VITE_POA_CONTRACT, VITE_FACTORY_V2_ARC, STREAM_FACTORY_ADDRESS, VITE_FACTORY_V2, VITE_FACTORY_V2_ARB.
- VITE_FACTORY_V2_ARC_MAINNET was absent; its executable source/template reference was also removed.
- Exact in-memory comparison verified all unrelated Render settings unchanged, including RELAYER_PRIVATE_KEY. No credentials recorded here.
- Standalone PolyDesk and Bullsprint unchanged.

Validation: retired-services-smoke, circle-pocket-agent-security-smoke, pocket-x402-adapter-smoke, pocket-checkout-routing-smoke, hosted-checkouts-adapter-smoke passed. Changed TS/TSX parsed with esbuild.

Separate unfinished work remains in the worktree: broader sports/creator retirement. It was deliberately excluded from this release pending its own verification. This report does not claim all legacy creator code has been removed.
