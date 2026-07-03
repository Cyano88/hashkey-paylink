# Hash PayLink

Programmable USDC payment infrastructure for hosted checkout, Telegram workflows, PolyDesk, StreamPay, retail POS, and agent commerce.

Hash PayLink is non-custodial. Payment links encode the checkout state, funds settle on-chain to recipient wallets or dedicated escrow contracts, and verified activity can be archived to 0G for durable proof records.

## Live Surface

| Surface | What it does | Route |
|---|---|---|
| Foundation | Public overview of what Hash PayLink powers | `https://hashpaylink.com` |
| App | Create and request USDC payment links | `/app` |
| Checkout | Hosted payer checkout | `/pay` |
| Telegram dashboard | Create requests, open PolyDesk, manage agents, and launch StreamPay from chat | `/telegram/payment-links` |
| PolyDesk | Fund Polymarket, track positions, receive alerts, and ask LP Scout | `/polymarket` |
| Retail POS | Country-aware static QR checkout, starting with Nigeria | `/app` |
| StreamPay | Payroll, agentic streams, and recoverable-risk Arena rooms on Arc | `/?app=streampay` |
| Agent Commerce | Agent wallets, x402 receipts, paid helper access, and 0G-verifiable activity | `/agent` |
| Developer docs | Hosted checkout SDK and API docs | `/docs` |

## Current Product Modules

- **Payment Links:** Create fixed or flexible USDC requests, share links or QR codes, and track multi-payer collections.
- **Retail POS:** Country-first checkout with Nigeria live, Kenya and Ghana reserved for verified local wallet or payout partners.
- **PolyDesk:** Polymarket funding, portfolio tracking, alerts, LP Scout, World Cup scores, and market context from Telegram.
- **StreamPay:** Arc USDC payroll, agentic streaming for daily LP research, and private Arena rooms with recoverable risk.
- **Agent Commerce:** Buyer/seller agent dashboards, Circle wallet mapping, x402 payments, and agent activity receipts.
- **0G Proof Layer:** Payment and agent activity records can be archived to 0G Storage and anchored on 0G Mainnet.

## Infrastructure Stack

| Layer | Usage |
|---|---|
| Circle USDC / wallets | USDC settlement and wallet sessions where supported |
| Privy | Email sign-in and user session layer |
| Paycrest | Base USDC to NGN POS payout routing through verified Paycrest senders/providers |
| Arc Network | StreamPay payroll, agentic streams, and Arena escrow settlement |
| 0G Storage | Durable payment and agent activity proof records |
| Polymarket public APIs | PolyDesk portfolio, market, score, and LP context |
| Postgres | Durable app state on Render for payment receipts, agent/helper state, POS profiles, Arena rooms, Privy/Circle mappings, and PolyDesk settings |

Use “built with” or “infrastructure stack” language unless a formal partnership is explicitly approved.

## Routes

```txt
/                         Foundation page
/app                      Create Hash PayLink app
/pay                      Hosted checkout
/dashboard                Multi-payer dashboard
/telegram/payment-links   Telegram dashboard
/polymarket               PolyDesk entry
/agent                    Agent wallet/helper dashboard
/receipt/:activityId      x402/agent receipt
/?app=streampay           StreamPay app
/docs                     Developer and product docs
```

## SDK

The current SDK is intentionally thin. It builds hosted Hash PayLink checkout URLs and renders React payment buttons. Wallet execution stays inside the hosted checkout so merchant apps do not duplicate relayers, smart-wallet sessions, or chain-specific payment logic.

```bash
npm install @hashpaylink/sdk
```

```tsx
import { PayLinkButton, buildPayLinkUrl } from '@hashpaylink/sdk'

export function InvoiceButton() {
  return (
    <PayLinkButton
      recipientEVM="0xYourMerchantAddress"
      network="base"
      amount="25"
      memo="Invoice #042"
    />
  )
}

const url = buildPayLinkUrl({
  recipientEVM: '0xYourMerchantAddress',
  recipientSolana: 'YourSolanaAddress',
  amount: '10',
  multiChain: true,
  memo: 'Order #1001',
})
```

No wallet providers, wagmi, or RainbowKit setup is required in the integrating app.

## 0G Proof Layer

0G is the verifiable memory layer for the Hash PayLink ecosystem.

| Surface | 0G usage |
|---|---|
| Multi-payer collections | Payer rows can be uploaded as JSON records and anchored through `PayLinkArchive` on 0G Mainnet |
| Organizer dashboards | Payment rows show archive status and proof metadata |
| Agent access | `/api/agent-verify` unlocks paid services after a valid proof exists |
| x402 receipts | Agent payment activity can be archived and linked to receipt pages |
| StreamPay extension | Payroll, agentic stream, and Arena settlement receipts follow the same proof pattern |

Archive contract: `0x79a804C49e1E5EBC279A228Ab73a7570A0D0819a` on 0G Mainnet.

## StreamPay Arena

Render Postgres is the durable app-state layer for receipts, agent/helper profiles, POS profiles, Privy/Circle mappings, PolyDesk settings, and Arena room settings. Arc escrow contracts handle Arena money movement; Postgres does not custody funds.

- Room state: entry, player count, rounds, risk curve, timer, invite URL, status, escrow address.
- Escrow state: deposits, recoverable refunds, winner settlement, and 0.5% platform fee.
- Future proof layer: final room results can be archived to 0G.

## Nigerian POS Off-Ramp

The first POS off-ramp is deliberately narrow: Nigerian merchants can add a verified bank account, customers pay Base USDC from Circle Smart Wallet, and Paycrest routes NGN to the merchant bank account. Hash PayLink does not custody the funds; it stores the POS intent, payer email/wallet, Paycrest order id, tx hash, and status for support and reconciliation.

Required server env:

```env
PAYCREST_API_KEY=
PAYCREST_API_SECRET=
NG_POS_BANK_ENCRYPTION_KEY=
DATABASE_URL=
```

Optional server env:

```env
PAYCREST_API_BASE=https://api.paycrest.io
PAYCREST_WEBHOOK_SECRET=
PAYCREST_SENDER_FEE_PERCENT=
PAYCREST_POS_STORE_KEY=hashpaylink:paycrest-pos-orders
NG_POS_STORE_KEY=hashpaylink:ng-pos-merchants
NG_POS_BANK_KEY_VERSION=local-v1
```

Webhook URL: `/api/paycrest-webhook`. Do not expose Paycrest keys with a `VITE_` prefix.

## Development

```bash
npm install
npm run typecheck
npm run build
npm run start
```

Render uses the committed frontend bundle in `dist/`. When frontend changes are ready for deployment, rebuild the bundle and force-stage `dist/` if it is ignored.

## Security Notes

- Never commit `.env`, private keys, wallet seed phrases, API keys, handoff files, or local session files.
- Do not add `VITE_` to private server keys.
- Hash PayLink does not custody merchant funds.
- Naira or fiat settlement should only be handled through verified licensed wallet or payout partners.

## Contact

- App: https://hashpaylink.com
- Telegram bot: https://t.me/HashPayLinkBot
- Support: support@hashpaylink.com
