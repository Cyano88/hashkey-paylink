# Telegram and retired web assistant cleanup

## Removed
Deleted four unreachable pages: CreateLink, TelegramPaymentLinks, AgentWorkspace and the embedded PolyDesk page (12,820 lines). They were absent from current routes and imported only within this retired group. No dynamic page glob loaded them. Removed the Telegram launcher, its state/listener/icon/URL from Layout. Updated API docs to point to Pocket shareable requests and describe the older-client alias.

Removed only test assertions that inspected the deleted pages. Added retirement coverage for page absence, Pocket assistant imports/locked mode/native request URL, launcher absence and preserved compatibility alias. The two previously documented unrelated broad-suite assertion failures remain outside this change; no repository-wide green test claim.

## Preserved
Pocket AgentHashPanel, PocketAssistantPage and dedicated agent-ask source unchanged. /api/telegram-request remains a compatibility alias to the PostgreSQL-backed Pocket request handler. Checkout/payment linking, native routes, receipts, legacy event identifiers, existing collection APIs and standalone PolyDesk were not deleted. Embedded HashPayStream Telegram-named URL compatibility remains under the repository migration guardrail; old URL parameters are not proof of an active bot integration.

## Infrastructure audit and actions
Read all two pages of main-service environment names: only VITE_TELEGRAM_AGENT_URL remained. No bot token or Telegram webhook handler found in the audited main server source. Render service inventory fit one page. The agentic streaming report job and both Photon services were already suspended.

No Photon/Telegram bot calls or credentials found in Pocket/main API source. Both suspended Photon services had Telegram config. Removed TELEGRAM_BOT_TOKEN from both; web-service value was empty, so no provider request was possible for that value. Removed TELEGRAM_RETURN_URL from the worker. Set TELEGRAM_ENABLED=false on both; both remain suspended. The worker token was accepted by Telegram getWebhookInfo and reported no webhook. No Telegram messages sent. Removing stored tokens is not provider-side token revocation; Telegram token revocation remains an account-owner action.

Do not delete the suspended services or streaming report job solely from this Telegram check: their non-Telegram duties/data and the standalone product boundary need separate review.

## Validation
Production Vite build passed in 3m20s using isolated output (tracked dist untouched). Retirement smoke, Pocket agent adapter, Privy/Circle wallet-link handler, Pocket request compatibility, Pocket checkout routing and host-surface routing checks passed. Pocket's three assistant source files compared unchanged. No installed-mobile authenticated test or funded transaction executed.
