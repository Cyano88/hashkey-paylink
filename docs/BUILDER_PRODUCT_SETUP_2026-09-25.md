# Builder product setup audit and release

## Findings and changes

The portal mixed settlement routing with wallet products. Swap inherited Agreement capabilities, xStocks-only projects needed an unrelated receiving address, and the public capability catalog omitted the separate wallet products. Checkout creation also lacked an explicit selected-product check for managed projects.

Settings and Products now share a product catalog: Checkout; Agreements with Arc USDC and X Layer eligible xStocks; Swap with independent Arc and X Layer choices; Bridge unavailable; and separate Polymarket Funding. Selection is saved as product capabilities, not as fabricated universal network support. Agent projects retain their existing Base/Arc product boundary.

New capabilities are swap_arc and swap_xlayer. The wallet:swap key scope remains separate and authorizes only session creation; the selected capability controls each rail. General keys and Agreement selection alone cannot open Swap. Participant authentication, approval, immutable sessions, execution validation and recovery remain unchanged.

Wallet-only and X Layer Agreement-only projects can save without settlement networks or a treasury address. Arc Agreement and Checkout receiving routes still require their existing validation. X Layer agreement assets and recipients are bound to each agreement; Swap uses the connected wallet. CLI project output now includes capabilities and reports a null default settlement network when no settlement routes exist.

Existing pre-v2 projects retain only Swap access already explicitly authorized by an unrevoked, unexpired wallet:swap key. Saving productSettingsVersion 2 makes the saved selection authoritative; removing Swap cannot later restore permissions through legacy Agreement settings. No new payment activation or funding flags are changed by selecting products.

Bridge cannot be selected or enabled through this release. Pocket's bridge is not yet a project-scoped builder integration, and X Layer/xStocks bridging is not supported. The catalog returns Bridge with no enabled networks. Sandbox execution remains unavailable and isolated from live routes.

## Verification

Passed: project create/configure and standalone-product tests; migration/expiry/revocation tests; exact Swap rail and scope tests; scoped-key issuance and isolation; CLI public-field privacy; hosted checkout and Polymarket funding regression tests; sandbox boundaries. Unselected Checkout returns 403 without creating a payment.

Synthetic browser: selected X Layer Swap alone, removed Checkout/Arc Agreements, saved, and verified the request contained only swap_xlayer with no settlement networks. No receiving-address fields remained. Mobile viewport 390x844 had no horizontal overflow; desktop 1440x1000 reviewed. No live project settings or funds were changed by browser tests. A repeated logo fallback request found in the fixture was corrected.

Production source build passed. Full TypeScript still reports existing errors outside the changed modules; no changed module appears in its diagnostics. No funded swap, bridge, Trade or Agreement transaction was performed.

## Builder contract

Configure project capabilities via the owner portal. Create separate scoped backend keys through owner-approved CLI access. Swap: wallet:swap. X Layer Agreements: xstocks-agreement:read and xstocks-agreement:create. Existing Arc scopes are unchanged. Capabilities API version is 2. Configured indicates saved settings, not payment activation or settlement completion.
