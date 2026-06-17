# Hash PayLink Docs

Hash PayLink is a hosted USDC payment platform for consumer and agent workflows. The public app is organized around payment links, retail POS, PolyDesk, StreamPay, and agent commerce.

## Public Routes

| Route | Purpose |
| --- | --- |
| `/` | Foundation page for institutional and public discovery |
| `/app` | Main Hash PayLink app for payment links, POS, agents, StreamPay, and PolyDesk entry |
| `/pay` | Hosted checkout |
| `/dashboard` | Multi-payer payment dashboard |
| `/telegram/payment-links` | Telegram dashboard surface |
| `/polymarket` | PolyDesk entry for Polymarket funding, portfolio, alerts, LP Scout, news, and World Cup market context |
| `/?app=streampay` | StreamPay app with Payroll, Agentic, and Arena modes |
| `/docs` | Web documentation |

## Current Product Modules

### Payment Links

Create and request USDC payments across supported public flows. The app supports fixed amount, flexible amount, QR sharing, multi-payer collection, dashboards, and hosted receipts.

### Retail POS

Country-aware static POS QR flow. Nigeria is the first active country card, with USDC checkout and a Spenda deposit-wallet path for merchants that want Spenda to handle KYC, conversion, and naira spending inside Spenda.

### PolyDesk

Polymarket-focused workflow for Telegram-first users:

- Fund Polymarket through Hash PayLink checkout.
- Track portfolio value, open positions, and claimable balances.
- Configure alerts.
- Ask LP Scout for paid market checks.
- Follow World Cup score and news context that can route to relevant Polymarket markets.

PolyDesk is intentionally Polymarket-only. Do not describe it as a generic prediction-market tool.

### StreamPay

StreamPay runs through the Hash PayLink platform and currently exposes:

- Payroll streams.
- Agentic streams to Hash PayLink Agent for daily Polymarket LP research.
- Arena, a recoverable-risk USDC game module using private rooms, per-room escrow design, and a 0.5% completed-room platform fee.

### Agent Commerce

Agent flows use selected paying agents, Circle wallet sessions, x402-style service receipts, and 0G proof archiving where configured.

## Infrastructure Stack

| Layer | Current role |
| --- | --- |
| Circle USDC | Settlement asset and wallet infrastructure |
| Privy | Email-first user sessions |
| Arc Testnet | StreamPay, agentic streams, and Arena testing |
| Base | Default USDC payment and PolyDesk funding rail |
| Arbitrum | USDC payment rail |
| Solana | USDC payment rail |
| 0G Storage | Durable proof/archive layer |
| Render Postgres | Durable app state for Telegram, PolyDesk, Arena, and Privy/Circle mappings |
| Resend | Email delivery for alerts and reports |

Use "built with" or "powered by" language for infrastructure providers unless there is a formal partnership agreement.

## SDK Positioning

The SDK is a lightweight developer helper for building Hash PayLink checkout URLs and buttons. Integrators should not need to install wallet providers, Wagmi, or RainbowKit in their own apps. Hash PayLink hosts the checkout and wallet/session experience.

The SDK will be refreshed after the foundation page is finalized.

## Deployment

Production deployment is Render-based. Render serves the committed `dist/` bundle, so frontend changes must rebuild and stage `dist/` before pushing.

Do not commit:

- `.env` files
- private keys
- API keys
- handoff files
- local session notes
- TypeScript build info

## Legacy Code

Some legacy adapters remain in the repository for backwards compatibility. Public docs and landing pages should only describe features that are currently surfaced in the public UI.
