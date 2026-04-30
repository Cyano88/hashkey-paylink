# HashPayLink — Monorepo

This repository contains **two independent products** deployed together on a single Render service.

| Product | What it does | Live |
|---|---|---|
| **Hash PayLink** | Multi-chain USDC payment request links across Base, HashKey, Starknet, and Arc | [hashkey-paylink.onrender.com](https://hashkey-paylink.onrender.com) |
| **StreamPay** | USDC streaming payroll + Creator Proof-of-Attention paywall on Arc | [hashkey-paylink.onrender.com/?app=streampay](https://hashkey-paylink.onrender.com/?app=streampay) |

The active product is selected by hostname — StreamPay loads automatically on `streampay.xyz` once DNS is configured. See [`modules/streampay/README.md`](modules/streampay/README.md) for StreamPay-specific documentation.

### Repository Structure

```
hashkey-paylink/
├── src/                      # Hash PayLink — React frontend
├── api/                      # Hash PayLink — Express API handlers
├── contracts/                # Hardhat project (shared + HashPayLink contracts)
├── modules/
│   └── streampay/            # StreamPay — fully self-contained module
│       ├── src/              #   React frontend
│       ├── api/              #   Express API handlers
│       └── contracts/        #   StreamVault + PoASettlement Solidity
├── server.ts                 # Shared Express server (routes for both products)
└── tailwind.config.js        # Shared Tailwind config
```

---

# Hash PayLink SDK &nbsp;`v1.0.0`

> **The Stripe of the Modular Future.**  
> One line of code to accept stablecoins across the world's most efficient networks.

[![npm](https://img.shields.io/badge/npm-%40hashpaylink%2Fsdk-black?logo=npm)](https://www.npmjs.com/package/@hashpaylink/sdk)
[![Live App](https://img.shields.io/badge/Live-hashkey--paylink.onrender.com-0071E3)](https://hashkey-paylink.onrender.com)
[![Arc Economic OS](https://img.shields.io/badge/Arc-Economic_OS-7C3AED?logo=ethereum)](https://arc.fun)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## Why Hash PayLink?

### The Gasless Economy Gap

Every chain has its own gas token, wallet standard, and payment UX. For builders, this means hundreds of lines of boilerplate per chain — and for users, it means friction at exactly the moment they're trying to pay. Hash PayLink solves this end-to-end:

| Problem | Hash PayLink Fix |
|---|---|
| Accept crypto = 200 lines of wagmi boilerplate | One `<PayLinkButton>` component |
| Users stranded on the wrong chain | Auto-switch: click a chain pill → wallet switches instantly |
| Gas friction kills micro-payments on Base | EIP-7702 sponsored transactions (gasless for the payer) |
| Starknet has no simple EVM integration path | Native ArgentX/Braavos via injected provider |
| Payment links tied to a single chain | One link covers 4 chains — payer chooses |
| No visibility into fees before signing | Transparent 0.2% fee shown in every tx before confirmation |
| Stateless payments hard to track | Real-time on-chain listener detects payments in under 3 seconds |

---

## Target Audience

Hash PayLink is built for builders, merchants, and platforms that need to **accept stablecoins without the overhead** of full wallet integration:

- **Freelancers & Contractors** — generate a payment link, share it in an email or Telegram. Get paid in USDC across Base, Arc, or HSK.
- **SaaS & API products** — drop in `<PayLinkButton>` for subscription billing or one-time checkouts. No backend required.
- **Creator platforms** — gate content, accept tips, or sell access tokens. Already powering [StreamPay](https://hashkey-paylink.onrender.com/?app=streampay).
- **E-commerce & marketplaces** — stateless checkout links work in any email, QR code, or invoice. No SDK installation required on the buyer's side.
- **DAOs & grant platforms** — request multi-chain contributions via a single link. Recipients can pay from their preferred chain.
- **Payroll teams** — combine with StreamPay's streaming payroll for time-sovereign salary disbursement.
- **Web2 platforms adding crypto** — hosted checkout mode requires zero wallet setup in the host app.

---

## Where Stateless Payment Links Shine

A Hash PayLink is just a URL. This makes it uniquely powerful in contexts where traditional payment flows don't work:

- **Email invoicing** — paste the link in any email client. Recipient clicks, pays.
- **QR codes** — encode as a QR on a physical receipt, product, or event badge.
- **Telegram / Discord / X DMs** — send a payment request as a message. Works on any device.
- **No-code tools** — embed in Notion, Webflow, Linktree, or any platform that accepts links.
- **Request payment without a website** — no hosting, no backend, no code required.
- **Cross-border freelance invoices** — one link, four chains, instant settlement.
- **Tipping & donations** — share publicly. Anyone with any supported wallet can pay.

---

## Quad-Chain Engine

| Chain | Asset | Finality | Gas Model | Pay Mode | Chain ID |
|---|---|---|---|---|---|
| ⬡ **Arc** | USDC | **Sub-second** | Native USDC Gas | Wallet Connect · Send via Address | 5042002 |
| 🔵 **Base** | USDC | ~2 s | EIP-7702 Sponsored | Wallet Connect · Send via Address | 8453 |
| 🟡 **HashKey** | HSK | ~3 s | Native HSK | Wallet Connect | 177 |
| 🟣 **Starknet** | USDC | ~2 s | AVNU Paymaster · Gas Sponsored | Wallet Connect | — |

> **Starknet note:** Gas is sponsored by AVNU Paymaster via the ArgentX/Braavos wallet connection — payers pay in USDC with no STRK required. Starknet currently supports Wallet Connect only; Send via Address is not available on Starknet.

> **Send via Address** (Base & Arc only): the payer sends USDC directly to a CREATE2 ghost vault address — no wallet connection required. The relayer sweeps funds to the recipient automatically.

---

## Installation

```bash
npm install @hashpaylink/sdk
```

```bash
yarn add @hashpaylink/sdk
```

```bash
pnpm add @hashpaylink/sdk
```

> **Zero peer-dep setup for hosted mode.** If you're using the hosted checkout (default), you do not need wagmi, RainbowKit, or any wallet provider in your app. The SDK opens the Hash PayLink hosted page — your app just listens for the `onPaymentSuccess` callback.

---

## Quick Start

**Five lines of code:**

```tsx
import { PayLinkButton } from '@hashpaylink/sdk'

export default function Checkout() {
  return (
    <PayLinkButton
      recipientEVM="0xYourEVMAddress"
      amount="10"
      memo="Invoice #001"
      onPaymentSuccess={({ txHash, chain }) => console.log('Paid!', txHash, 'on', chain)}
    />
  )
}
```

This opens Hash PayLink's **hosted checkout** in a new tab. The payer selects their chain and pays — on **Base and Arc** they can either connect a wallet or choose **Send via Address** (send from any EVM wallet or CEX directly to a generated address, no wallet connection required). On HashKey and Starknet, wallet connect is used. You receive the `onPaymentSuccess` callback with the transaction hash and chain.

---

## API Reference

### `<PayLinkButton>`

```tsx
<PayLinkButton
  recipientEVM="0x..."          // EVM address (Base · HashKey · Arc)
  recipientStark="0x..."        // Starknet address (optional — 0x + 64 hex chars)
  amount="25"                   // Amount in asset units ("25" = 25 USDC)
  memo="Invoice #042"           // Stored on-chain in tx calldata
  platformFeeBps={20}           // Default: 20 (0.2%). Set 0 to disable.
  hosted={true}                 // true = hosted checkout tab (default)
                                // false = inline widget
  label="Pay with Crypto"       // Custom button label
  onPaymentSuccess={(params) => {
    console.log(params.txHash)        // "0xabc..."
    console.log(params.chain)         // 'arc' | 'base' | 'starknet' | 'hashkey'
    console.log(params.platformFee)   // "0.05" (fee in asset units)
  }}
  onPaymentError={(error) => {
    console.error(error.message)
  }}
/>
```

#### Props

| Prop | Type | Required | Default | Description |
|---|---|---|---|---|
| `recipientEVM` | `string` | * | — | EVM address (`0x` + 40 hex) — required for Base, HashKey, Arc |
| `recipientStark` | `string` | * | — | Starknet address (`0x` + 64 hex) |
| `amount` | `string` | ✓ | — | Payment amount |
| `memo` | `string` | — | — | On-chain memo (≤100 chars) |
| `platformFeeBps` | `number` | — | `20` | Fee in basis points (20 = 0.2%) |
| `hosted` | `boolean` | — | `true` | Hosted checkout tab vs inline widget |
| `label` | `string` | — | `"Pay {amount} USDC"` | Button label |
| `onPaymentSuccess` | `function` | — | — | Fires after on-chain confirmation |
| `onPaymentError` | `function` | — | — | Fires on wallet rejection or tx failure |

*At least one of `recipientEVM` or `recipientStark` is required.

---

## Getting Started Guide

### 1 · Hosted Checkout (Zero Config — Recommended)

No wallet providers, no wagmi, no RainbowKit needed. Hash PayLink hosts the entire payment flow.

```tsx
// pages/checkout.tsx
import { PayLinkButton } from '@hashpaylink/sdk'

export default function CheckoutPage({ invoice }) {
  return (
    <div className="flex justify-center py-16">
      <PayLinkButton
        recipientEVM={process.env.NEXT_PUBLIC_TREASURY_EVM}
        recipientStark={process.env.NEXT_PUBLIC_TREASURY_STARK}
        amount={invoice.total.toString()}
        memo={`Invoice #${invoice.id}`}
        onPaymentSuccess={async ({ txHash, chain }) => {
          await fetch('/api/invoices/confirm', {
            method: 'POST',
            body: JSON.stringify({ invoiceId: invoice.id, txHash, chain }),
          })
        }}
      />
    </div>
  )
}
```

---

### 2 · Generate a Payment Link (No SDK Required)

Use the hosted checkout URL directly — embed in emails, QR codes, or any message.

```
https://hashkey-paylink.onrender.com/pay?evm=0xYourAddress&stark=0xYourStark&amt=10&memo=Coffee
```

**URL parameters:**

| Param | Description | Example |
|---|---|---|
| `evm` | EVM recipient address | `0xAbCd…` |
| `stark` | Starknet recipient address | `0x04a3…` (64 hex) |
| `amt` | Amount | `10` |
| `memo` | On-chain memo | `Coffee` |
| `net` | Lock to a specific chain | `base` · `arc` · `hashkey` · `starknet` |

---

### 3 · Inline Widget (Full Control)

Embeds the payment UI directly in your page. Requires wagmi + Starknet providers in the host app.

```tsx
// app/providers.tsx
import { WagmiProvider } from 'wagmi'
import { RainbowKitProvider } from '@rainbow-me/rainbowkit'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { StarknetProvider } from '@hashpaylink/sdk/starknet'
import { wagmiConfig } from './wagmi'

const queryClient = new QueryClient()

export function Providers({ children }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <StarknetProvider>{children}</StarknetProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
```

```tsx
// app/checkout/page.tsx
import { PayLinkButton } from '@hashpaylink/sdk'

export default function Checkout() {
  return (
    <PayLinkButton
      recipientEVM="0xYour..."
      amount="25"
      hosted={false}
      onPaymentSuccess={({ txHash }) => router.push(`/receipt?tx=${txHash}`)}
    />
  )
}
```

---

## Fee Engine

Hash PayLink charges a **0.2% platform fee** (20 bps) on every transaction, shown transparently before the user signs.

```
User pays:       10.00 USDC
Platform fee:     0.02 USDC  (0.2%)
Recipient gets:   9.98 USDC
```

### Fee Configuration

```tsx
// Disable (self-hosted deployments)
<PayLinkButton platformFeeBps={0} ... />

// Custom (Enterprise)
<PayLinkButton platformFeeBps={10} ... />  // 0.1%
```

### FeeRouter Contract (On-chain Collection)

Full on-chain fee splitting uses the FeeRouter contract deployed on Base and Arc.

```solidity
// FeeRouter.sol (interface)
interface IFeeRouter {
    function routePayment(
        address token,
        address recipient,
        uint256 amount,
        uint16  feeBps
    ) external;
}
```

---

## Webhooks / `onPaymentSuccess`

The callback fires after on-chain confirmation.

```tsx
<PayLinkButton
  ...
  onPaymentSuccess={async (params) => {
    const {
      txHash,           // "0xabc123..."
      chain,            // "arc" | "base" | "starknet" | "hashkey"
      amount,           // "10"
      asset,            // "USDC" | "HSK"
      recipientAddress, // "0xYour..."
      platformFee,      // "0.02"
      timestamp,        // Unix ms
    } = params

    await fetch('https://api.yourapp.com/payments/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
  }}
/>
```

> For production, verify `txHash` on-chain server-side before fulfilling orders.

---

## Validation

Strict address validation enforced at input:

```ts
// EVM (Base, HashKey, Arc) — viem isAddress
isAddress("0xAbCd...1234")       // ✓  0x + 40 hex chars

// Starknet — exactly 64 hex chars after 0x
/^0x[0-9a-fA-F]{64}$/.test(v)   // ✓  0x + 64 hex chars
```

Attempting to paste an EVM address into the Starknet field shows:
```
⚠️ Must be a valid 64-character Starknet address.
```

---

## Auto-Switch Network

When a user clicks a chain pill on the payment page:

| User clicks | Wallet action | Result |
|---|---|---|
| **Arc** | `wallet_switchEthereumChain` (5042002) | Arc branding, sub-second badge |
| **Base** | `wallet_switchEthereumChain` (8453) | Blue glow, EIP-7702 gas |
| **HashKey** | `wallet_switchEthereumChain` (177) | Gold glow, native HSK |
| **Starknet** | `window.starknet.enable()` | ArgentX / Braavos popup |

If the chain isn't in the wallet, `wallet_addEthereumChain` fires automatically — users never touch network settings.

---

## Real-Time Payment Detection

Hash PayLink monitors for incoming payments in real time — no polling button required:

- **EVM chains (Base, Arc):** `watchContractEvent` on the USDC contract, 2-second polling interval. Payment detected in under 3 seconds.
- **HashKey:** native balance polling every 2 seconds.
- **Starknet:** receipt polling via JSON-RPC until `ACCEPTED_ON_L2`.

After detection, a relayer automatically sweeps USDC from the payment router to the recipient (Base & Arc). No action required from the recipient.

---

## Powering StreamPay

The Hash PayLink SDK is the payment backbone of **[StreamPay](https://hashkey-paylink.onrender.com/?app=streampay)** — a USDC streaming platform built on top of this codebase.

StreamPay uses:
- **Arc chain config** from `CHAIN_META.arc` for the StreamVault and PoASettlement contracts
- **EIP-712 typed signing** (same pattern as the payroll relay) for gasless claim and Proof-of-Attention session intents
- **The same USDC precompile** (`0x3600000000000000000000000000000000000000`) for all streaming payments
- **Hash PayLink's relayer infrastructure** for gasless vault claims

StreamPay demonstrates that the SDK's primitives — typed signing, chain abstraction, USDC routing — extend naturally to streaming and event-driven payment flows.

---

## Folder Structure

```
src/
├── lib/
│   ├── chains.ts            ← ChainKey, CHAIN_META, arcChain, PLATFORM_FEE_BPS
│   ├── wagmi.ts             ← wagmiConfig (Base + HashKey + Arc)
│   ├── router.ts            ← FeeRouter factory + ABI constants
│   ├── utils.ts             ← encodeErc20Transfer, isValidRecipient, fee helpers
│   └── StarknetContext.tsx  ← Global Starknet wallet state
│
├── sdk/                     ← @hashpaylink/sdk public surface
│   ├── index.ts             ← Exports: PayLinkButton, CHAIN_META, types
│   ├── PayLinkButton.tsx    ← Drop-in component (hosted + inline modes)
│   └── types.ts             ← TypeScript interfaces
│
├── pages/
│   ├── CreateLink.tsx       ← Link generator (sender flow)
│   ├── PaymentPage.tsx      ← Payment checkout (payer flow)
│   └── Dashboard.tsx        ← Payment history dashboard
│
└── Layout.tsx               ← Sticky header, dual-wallet, Hash Assistant chat
```

---

## Who Should Integrate

Hash PayLink is designed as a **drop-in payment layer** for any product that handles money movement. Integration effort is under an hour for hosted mode.

| Platform Type | Use Case |
|---|---|
| **Freelance / invoice tools** | Generate and send payment links without a merchant account |
| **SaaS subscriptions** | One-click checkout for monthly/annual plans |
| **Creator economy** | Tip jars, paid newsletters, gated content |
| **Marketplaces** | Buyer checkout across chains without wallet setup |
| **DAOs & treasuries** | Contributor payments, grant disbursements |
| **Gaming & NFT projects** | In-game purchases, mint payments |
| **Fintech / neobanks** | Crypto off-ramp or on-chain settlement layer |
| **Event platforms** | Ticket sales, registrations, on-chain receipts |
| **Payroll platforms** | Combined with StreamPay for streaming salary flows |

---

## Security

- **Non-custodial:** the SDK never holds funds — all payments are direct wallet-to-wallet or via transparent FeeRouter contracts
- **No backend required:** payment validation happens on-chain
- **Open source:** audit the [payment logic](src/pages/PaymentPage.tsx) yourself
- **Strict validation:** EVM (40-char) and Starknet (64-char) enforced at input and on generate
- **No private key exposure:** injected wallet providers only (`window.ethereum`, `window.starknet`)
- **EIP-712 typed data:** all gasless operations use structured typed signatures — no raw transaction signing

---

## Pricing

| Tier | Fee | Includes |
|---|---|---|
| **Standard** | 0.2% per tx | All 4 chains, hosted checkout, real-time detection, open source |
| **Enterprise** | Custom | Whitelabel UI, custom domains, priority support, FeeRouter deployment |

Contact us to discuss enterprise pricing or custom integrations.

---

## Contributing

```bash
git clone https://github.com/Cyano88/hashkey-paylink
cd hashkey-paylink
npm install
npm run dev       # http://localhost:5173
```

PRs welcome. Open an issue first for large changes.

**Support & Contact**

- Email: [support@hashpaylink.com](mailto:support@hashpaylink.com)
- X: [@Hash_PayLink](https://x.com/Hash_PayLink)

---

## License

MIT © 2026 Hash PayLink Contributors

*Built on [HashKey Chain](https://explorer.hsk.xyz) · [Base](https://basescan.org) · [Starknet](https://starkscan.co) · [Arc Economic OS](https://arc.fun)*
