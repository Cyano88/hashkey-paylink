# Pocket Agent Hash preservation ? 2026-09-19

## Scope
Extract the shared assistant panel from TelegramPaymentLinks into components/AgentHashPanel. Pocket now imports that component directly; the legacy page reexports it for compatibility. This is a dependency separation, not full removal of Telegram functionality or a UI redesign.

121 moved declarations were compared against the pre-change HEAD and preserved identically after export modifiers and line-ending normalization. The main panel function SHA-256 is ed0ab3df76808aac9e719edb26a37b44602220401fe9e35005f49a433f894cc1.

Pocket retains locked circle-pocket mode, Privy authentication, /api/pocket/agent/ask, helper-profile memory and Pocket support cases. Its chat branch returns before generic archive-gated /api/agent-ask. /api/telegram-request remains a payment-request dependency and MUST NOT be deleted in this stage.

Two router gaps found during verification were fixed: plural receipts and bill-person USDC request phrasing. Utility bills retain precedence. No transaction execution or authorization behavior changed.

## Verification
- Production Vite build passed using an isolated output directory (2m34s); tracked dist was not overwritten.
- Pocket agent adapter, agent security, targeted requests adapter and focused assistant routing tests passed.
- Focused agent-router TypeScript check passed.
- Actual extracted component rendered in a local synthetic browser fixture: authenticated chat and helper profile requests, response/action rendering, and authenticated human-support case/composer flow passed. No generic agent-ask or agent-verify calls occurred. Synthetic data only; no real user support case or transfer created.
- All 121 extracted declarations preserved; no native shell/config changes.

## Limits and outstanding work
No signed-in installed-mobile end-to-end run or funded transaction was performed. Do not interpret these checks as a guarantee of every production flow.

Two broader pre-existing source-assertion suites remain failing: circle-pocket-contracts expects an old wallet-activity timeout implementation; agent-hash-payments-parser rejects pending status in NG POS history. Neither affected production file was changed in this stage. The focused relevant checks pass; the full suite is not green.

Follow-up retirement must preserve or deliberately migrate the legacy-named request endpoint and shared callers before deleting remaining Telegram code.
