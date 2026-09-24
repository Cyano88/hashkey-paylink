# Pocket Home startup regression — 2026-09-24

Confirmed on Pixel: authenticated /home showed fixed navigation but no Home content. The loading shell scroller and its parents measured zero height. Device cache contained six networks, while the reader accepted exactly four. CirclePocketApp also gated the whole Stablecoins surface on completion of wallet restoration and six-network preparation.

Fix: restore ordered six-network snapshots, upgrade valid old four-network snapshots with unknown Ethereum/Polygon rows, and retain display-only semantics (zero executable total until refreshed). Returning authenticated owners with a linked Base wallet can render cached Home while preparation continues. Payment security gate remains mounted; action-time wallet checks and server approvals are unchanged. Preload the Home module during launch. Give Home and Activity loading wrappers full height. Splash timing and logo assets are unchanged.

Validation: cache regression tests cover six-network restoration, four-network upgrade, owner isolation, malformed network rejection and display-only balances. Focused TypeScript diagnostics: zero. Existing payment-security smoke test passes. Android runtime and deployment verification to be recorded after installation.
