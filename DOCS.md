# Hash PayLink — Complete Documentation

> **The contactless USDC payment layer for the real world.**
> One link. Five chains. Zero gas for the payer.

---

## Table of Contents

1. [What is Hash PayLink?](#1-what-is-hash-paylink)
2. [Try It Free — Arc Testnet](#2-try-it-free--arc-testnet)
3. [Chain Overview](#3-chain-overview)
4. [Wallet Setup Guide](#4-wallet-setup-guide)
   - [EVM Wallets (Base, HashKey, Arc)](#41-evm-wallets--base-hashkey-arc)
   - [Starknet Wallets](#42-starknet-wallets)
   - [Solana Wallets](#43-solana-wallets)
   - [Nigerian Merchants — NGN Off-Ramp via Spenda](#44-nigerian-merchants--ngn-off-ramp-via-spenda)
5. [Creating a Payment Link](#5-creating-a-payment-link)
6. [Paying via a Hash PayLink](#6-paying-via-a-hash-paylink)
7. [Multi-Payer Collection (Event Mode)](#7-multi-payer-collection-event-mode)
8. [Flexible Amount](#8-flexible-amount)
9. [Local Currency FX Display](#9-local-currency-fx-display)
10. [Currency Swap on Payer Card](#10-currency-swap-on-payer-card)
11. [Organizer Dashboard](#11-organizer-dashboard)
12. [QR Code Service](#12-qr-code-service)
13. [Branded QR Code (Business Registration)](#13-branded-qr-code-business-registration)
14. [Dark Mode](#14-dark-mode)
15. [SDK — Developer Integration Guide](#15-sdk--developer-integration-guide)
16. [Security Architecture](#16-security-architecture)
17. [Agent Legal Wrapper Roadmap](#17-agent-legal-wrapper-roadmap)
18. [Environment Variables Reference](#18-environment-variables-reference)
19. [Support & Contact](#19-support--contact)

---

## 1. What is Hash PayLink?

Hash PayLink is a **stateless, non-custodial payment infrastructure** that converts a single shareable URL or QR code into a full multi-chain USDC checkout experience.

- **No app download** required for the payer
- **No merchant account** required for the organiser
- **No gas tokens** needed in the payer's wallet — every chain is gasless for the payer
- **No custodian** — funds go directly on-chain from payer to recipient

**Who it is for:**

| User | How they use it |
|---|---|
| Freelancers & contractors | Generate a link, share via email or DM, get paid in USDC |
| Restaurants & shops | Display a QR code at the counter — customers scan and pay |
| Event organisers | Track payments from many attendees in a live dashboard |
| Developers | Drop one SDK component into any web app to accept USDC |
| DAOs & nonprofits | Accept multi-chain contributions via a single link |
| Schools & clubs | Collect fees with named payment logs and CSV export |

**Live at:** [hashpaylink.com](https://hashpaylink.com)
**Base App Store:** Listed with Builder Code `bc_8qtb7tny` (ERC-8021)

---

## 2. Try It Free — Arc Testnet

> **Not ready to use real USDC yet? Start here.**

**Arc Testnet** (Chain ID `5042002`) is a live test environment where you can experience the full Hash PayLink flow — creating links, making payments, monitoring dashboards — using **free test USDC with no real money at risk.**

### Step 1 — Add Arc Testnet to your wallet

In MetaMask or any EVM wallet, add a custom network:

| Field | Value |
|---|---|
| Network Name | Arc Testnet |
| RPC URL | `https://rpc.testnet.arc.network` |
| Chain ID | `5042002` |
| Currency Symbol | USDC |
| Block Explorer | `https://testnet.arcscan.app` |

### Step 2 — Get free test USDC

Visit the Arc Testnet faucet and request free USDC:
**[https://faucet.testnet.arc.network](https://faucet.testnet.arc.network)**

> If that URL changes, check **[arc.fun](https://arc.fun)** or the Arc Discord for the latest faucet link.

### Step 3 — Test the full flow

1. Go to [hashpaylink.com](https://hashpaylink.com)
2. Select **Arc** as your chain
3. Generate a payment link with your wallet address
4. Open the link in another browser tab
5. Select **Arc**, connect your wallet, and pay
6. Watch the confirmation appear — this is exactly how it works on mainnet

> Arc testnet has sub-second finality. Your test payment confirms almost instantly.

---

## 3. Chain Overview

Hash PayLink runs on five chains. Every chain is **gasless for the payer.**

| Chain | Asset | Finality | Gas Model | Pay Modes | Chain ID |
|---|---|---|---|---|---|
| 🔵 **Base** | USDC | ~2 s | EIP-7702 Sponsored | Wallet Connect · Send via Address | 8453 |
| 🟡 **HashKey** | HSK | ~3 s | Native HSK | Wallet Connect | 177 |
| 🟣 **Starknet** | USDC | ~2 s | AVNU Paymaster | Wallet Connect | — |
| 🩵 **Arc** | USDC | Sub-second | Native USDC Gas | Wallet Connect · Send via Address | 5042002 |
| 🟢 **Solana** | USDC | ~0.5 s | Relayer Sponsored | Wallet Connect · Send via Address | — |

**Send via Address** — the payer sends USDC to a generated vault address from any wallet, CEX, or existing balance. No wallet connection required. Available on Base, Arc, and Solana.

**Wallet Connect** — the payer connects their wallet and signs the payment directly. Available on all chains.

---

## 4. Wallet Setup Guide

### 4.1 EVM Wallets — Base, HashKey, Arc

You need an EVM-compatible wallet to pay on Base, HashKey, or Arc.

#### Option A — Coinbase Smart Wallet (Recommended for beginners)

Coinbase Smart Wallet is gasless-native and works seamlessly with Base.

1. Visit [coinbase.com/wallet](https://coinbase.com/wallet) or install the **Coinbase Wallet** app
2. Create a new wallet — you'll get a passkey-based account (no seed phrase required on smart wallet)
3. Fund with USDC on Base via Coinbase exchange or any bridge
4. Connect at [hashpaylink.com](https://hashpaylink.com) — select **Base**, click **Connect Wallet**

#### Option B — MetaMask (Advanced users, all EVM chains)

1. Install MetaMask at [metamask.io](https://metamask.io) (browser extension or mobile)
2. Create a new wallet — **save your 12-word seed phrase offline, never digitally**
3. To add **HashKey Chain**:
   - Open MetaMask → Settings → Networks → Add Network
   - RPC: `https://mainnet.hsk.xyz` | Chain ID: `177` | Symbol: `HSK`
4. To add **Arc Testnet**: see [Section 2](#2-try-it-free--arc-testnet) above
5. Base is pre-listed in MetaMask's network selector

#### Funding your EVM wallet with USDC

| Chain | How to get USDC |
|---|---|
| Base | Buy on Coinbase → withdraw to Base. Or bridge from Ethereum via [bridge.base.org](https://bridge.base.org) |
| HashKey | Buy HSK on supported exchanges and withdraw to HashKey Chain (Chain ID 177) |
| Arc Testnet | Free from the Arc faucet (see Section 2) |

---

### 4.2 Starknet Wallets

Starknet uses its own wallet standard (not MetaMask). Gas is sponsored by AVNU Paymaster — **payers need zero STRK.**

#### Option A — ArgentX (Recommended)

1. Install from [argent.xyz](https://argent.xyz) → browser extension
2. Create a new Starknet account — ArgentX will deploy your smart contract wallet on first transaction
3. Fund with USDC on Starknet:
   - Bridge from Ethereum via [app.starkgate.finance](https://app.starkgate.finance)
   - Or buy USDC directly on a CEX that supports Starknet withdrawals
4. Connect at [hashpaylink.com](https://hashpaylink.com) → select **Starknet** → click **Connect Starknet Wallet**

#### Option B — Braavos

1. Install from [braavos.app](https://braavos.app)
2. Follow the same steps as ArgentX above

> **Important:** Starknet addresses are 66 characters long (0x + 64 hex). Make sure to copy your full address when sharing with a link creator.

---

### 4.3 Solana Wallets

#### Option A — Phantom (Recommended)

1. Install from [phantom.app](https://phantom.app) (browser extension or mobile)
2. Create a new wallet — save your seed phrase offline
3. Fund with USDC on Solana:
   - Buy on Coinbase → withdraw USDC to your Solana address
   - Or swap SOL → USDC on [jup.ag](https://jup.ag) (Jupiter)
4. Connect at [hashpaylink.com](https://hashpaylink.com) → select **Solana** → click **Connect Solana Wallet**

> **No SOL needed.** Hash PayLink's Solana relay pays all network fees on the payer's behalf. You only need USDC.

#### Option B — Solflare

1. Install from [solflare.com](https://solflare.com)
2. Follow the same steps as Phantom

#### Send via Address (no wallet connection needed)

On Solana, you can also pay by simply sending USDC to the displayed vault address from any wallet — including Phantom mobile, a CEX withdrawal, or any Solana app. No browser connection required.

---

### 4.4 Nigerian Merchants — NGN Off-Ramp via Spenda

> **For merchants in Nigeria who want to receive naira directly — not hold USDC**

Hash PayLink processes and settles all payments in USDC on-chain. If you want to automatically convert incoming USDC to Nigerian Naira (NGN) and withdraw to your bank account, we recommend registering on **Spenda**.

**What Spenda does:** Receives your USDC on Base or Solana and converts it to NGN, depositing directly to your Nigerian bank account.

**How to set up:**

1. Register at **[spenda.co](https://spenda.co)** and complete KYC verification
2. Generate your **USDC deposit address** on Base and/or Solana from your Spenda dashboard
3. Copy both addresses (Base EVM address + Solana address)
4. When requesting your branded Hash PayLink QR code (see [Section 13](#13-branded-qr-code-business-registration)), provide these two addresses
5. Hash PayLink will embed both addresses in your branded QR code
6. Every payment made to your QR code lands in Spenda → auto-converts to NGN → hits your bank

> **Cold wallet alternative:** If you prefer to hold USDC yourself, provide your personal EVM or Solana wallet address instead. Spenda is only needed if you want direct NGN settlement.

---

## 5. Creating a Payment Link

1. Go to [hashpaylink.com](https://hashpaylink.com)
2. Select your chain using the pill selector (Base, HashKey, Starknet, Arc, Solana)
3. Enter your **recipient wallet address** for that chain
4. Enter the **amount** (USDC or HSK)
5. Optionally add a **memo** (stored on-chain, e.g. "Coffee", "Invoice #042")
6. Click **Generate Payment Link**
7. Copy the link or download the QR code

**Advanced options (inside the form card):**

| Toggle | What it does |
|---|---|
| Multi-payer Collection | Enables named payment tracking + live organiser dashboard |
| Multi-Chain Payment | Adds addresses for multiple chains — payer picks their preferred chain |
| Flexible Amount | Skips the fixed price — payer enters the amount at checkout |
| Local Currency Display | Shows NGN/GHS/KES/SGD equivalent on the payer's card (Multi-Payer mode only) |

**Generated URL structure:**
```
https://hashpaylink.com/pay?n=base&e=0xYour...&a=10&m=Coffee
```

All parameters are in the URL — no database, no backend state, fully stateless.

---

## 6. Paying via a Hash PayLink

When a payer opens a Hash PayLink:

1. **Select chain** — chain pills show which chains the organiser has set up addresses for
2. **Choose pay mode** — "Connect Wallet" or "Send via Address" (Base, Arc, Solana)
3. **Connect wallet** (if wallet mode) — standard RainbowKit popup for EVM; ArgentX/Braavos for Starknet; Phantom/Solflare for Solana
4. **Review the payment** — amount, asset, network, chain ID, and platform fee displayed
5. **Pay** — sign in wallet. The transaction is submitted gaslessly — **the payer pays zero gas**
6. **Success card** — shows exact amount received, transaction hash, and a direct link to the block explorer

**Underpayment protection:**

| Actual received vs requested | Outcome |
|---|---|
| ≥ 99% | ✅ Green "Payment Sent!" |
| 50–99% | 🟡 Amber "Partial Payment" — shortfall shown |
| < 50% | 🔴 Red "Underpayment Detected" — shortfall shown |

The dashboard always logs the **actual received amount**, never the URL-requested amount.

---

## 7. Multi-Payer Collection (Event Mode)

For events, classes, group collections, and any scenario where many people pay one organiser.

**Enabling it:**
1. On the Create Link page, toggle **Multi-payer Collection** ON
2. Generate the link — a dashboard URL is also generated alongside the payment link

**Payer flow:**
1. Payer opens the link
2. Enters their **name** (required for registration)
3. Selects chain and pays
4. Their name, amount, chain, and transaction hash are logged to the live dashboard in real time

**Organiser dashboard shows:**
- Live payment feed with payer name, chain badge, amount, timestamp
- Running total collected
- QR code display for showing on screen at events
- CSV export button (downloads full payment log)
- Multi-chain support — Base, Arc, HashKey, Starknet, and Solana payments all appear in the same feed

**Use cases:** conference registrations · school fees · group dinners · club dues · donations · workshop registrations · sports team fees · church contributions

---

## 8. Flexible Amount

Organisers who do not want to set a fixed price enable **Flexible Amount**.

**On the create page:** toggle **Flexible Amount** ON → amount field disappears → `f=1` is baked into the link URL.

**On the payer card:**
```
    ENTER AMOUNT
    [ 0.00 ]  USDC
```

The payer types their own amount. This amount is:
- Processed on-chain as the actual payment value
- Logged in the organiser dashboard as the confirmed received amount
- Shown in the success card

**Best for:** restaurants · coffee shops · invoice payments · tips · donations · shops with variable pricing

---

## 9. Local Currency FX Display

> **Available exclusively in Multi-Payer Collection mode**

Organisers can enable a live local currency equivalent on the payer's card — building trust for customers who think in their home currency.

**Supported currencies:**

| Code | Symbol | Country |
|---|---|---|
| NGN | ₦ | Nigeria |
| GHS | ₵ | Ghana |
| KES | KSh | Kenya |
| SGD | S$ | Singapore |

**Enabling it (organiser):**
1. Toggle **Multi-payer Collection** ON
2. The "Local Currency Display" section appears — toggle it ON
3. Choose currency (NGN / GHS / KES / SGD)
4. Choose rate source:
   - **Live (Fixer.io)** — fetches live market rate, cached 10 minutes. Requires `FIXER_API_KEY` on the server.
   - **Custom / Street rate** — type your own rate (e.g. `1780` for NGN). Baked into the link permanently. No API key needed. Best for parallel/street market rates.
5. Generate link — FX settings are embedded in the payment URL

**What payers see:**
```
≈ 17,800 ₦  ·  1 USDC = 1,780 NGN  ↻
─────────────────────────────────────
Pricing in USDC · Shown in Nigerian Naira at live market rates
```

The `↻` icon refreshes the rate manually (live mode only).

> All payments are settled in USDC regardless of the local currency display. The FX line is informational only.

---

## 10. Currency Swap on Payer Card

> **Available in Flexible Amount + FX Display mode combined**

When both **Flexible Amount** and **Local Currency Display** are active and a rate is loaded, the payer sees a swap button on the input:

**USDC mode (default):**
```
    ENTER AMOUNT
    [ 0.00 ]  USDC
    ⇄ Switch to NGN
```

**After tapping ⇄:**
```
    ENTER AMOUNT
    [ 5,000 ]  ₦
    ⇄ Switch to USDC
    You will pay ≈ 2.98 USDC
```

The payer can type in their local currency and the USDC equivalent is computed and displayed before payment. **All payments are processed and settled in USDC** — the local input is converted at the live rate before the transaction is submitted.

---

## 11. Organizer Dashboard

The organiser dashboard is a **live, shareable monitoring page** — no login, no account required.

**Access:** generated automatically alongside any Multi-Payer Collection link, or via the `buildDashboardLink` function in the SDK.

**URL format:**
```
https://hashpaylink.com/event?id=EVENT_ID&e=0xYour...&a=10&m=My+Event
```

**Dashboard features:**
- Live payment feed auto-refreshing every 5 seconds
- Each entry: payer name, chain badge, **actual received amount**, transaction hash, timestamp
- Running total at the top
- Flash notification when a new payment arrives
- CSV export — downloads full payment log with one click
- QR code panel — shows and downloads the payment QR
- Copyable payment link and dashboard link
- Multi-chain monitoring — watches all chains simultaneously

---

## 12. QR Code Service

Every Hash PayLink generates a downloadable QR code automatically.

**Self-service (free, no registration):**
1. Generate any payment link on [hashpaylink.com](https://hashpaylink.com)
2. Click **Download QR** — downloads a 1024×1024px PNG with the Hash PayLink logo embedded in the centre
3. Print, display, or share anywhere

The QR code encodes the full payment URL including recipient address, amount, memo, and any FX settings. Anyone can scan it and pay immediately without any prior setup.

---

## 13. Branded QR Code (Business Registration)

For businesses that need **professional credibility** — restaurants, retail shops, hotels, NGOs, schools — Hash PayLink offers a **custom branded QR code service**.

**Why branded matters:** A customer scanning a QR code at a business wants to see a recognisable, professional label — not a raw URL. Branded QR codes signal legitimacy, the same way a payment terminal does. Once laminated and placed at a counter or on a table, payments flow in automatically with zero staff involvement.

**How to request:**

Email **[support@hashpaylink.com](mailto:support@hashpaylink.com)** with the following:

```
Subject: Branded QR Code Request

Business / Organisation Name: [Your name]
Wallet Addresses:
  - EVM (Base/Arc): 0x...
  - Solana: [Base58 address]  (optional)
  - Starknet: 0x...           (optional — up to 3 chains total)
Preferred memo text: e.g. "Village Chief Restaurant"
```

> **Nigerian merchants using Spenda:** provide your Spenda-generated USDC deposit addresses on Base and Solana. Payments will auto-convert to NGN and credit your bank account.

**What you receive back:**
- A glass-branded Hash PayLink QR code with your business name as the memo
- The QR scans as: *"Scan to pay in USDC — Village Chief Restaurant"*
- An organiser dashboard URL for live payment monitoring — self-serve, no login
- Multi-chain enabled (payer pays from whichever chain they prefer)

**Response time:** within 24 hours.

---

## 14. Dark Mode

Hash PayLink ships with a full dark / light mode toggle.

- **Toggle location:** Sun/Moon icon in the top-right header, visible on every page
- **Default:** follows your operating system's color scheme (`prefers-color-scheme`)
- **Persistence:** saved to `localStorage` — stays between sessions
- **Coverage:** all pages, cards, inputs, chain gradients, error states, success cards, and the RainbowKit wallet modal

---

## 15. SDK — Developer Integration Guide

The Hash PayLink SDK lets any web application create current hosted Hash PayLink checkout buttons and URLs with minimal code. Wallet execution remains inside the hosted checkout so merchant apps do not duplicate relayer or smart-wallet logic.

### Installation

```bash
npm install @hashpaylink/sdk
# or
yarn add @hashpaylink/sdk
# or
pnpm add @hashpaylink/sdk
```

---

### Option A — Hosted Checkout (Zero Config, Recommended)

No wallet providers, no wagmi, no RainbowKit required in your app. Hash PayLink hosts the entire payment flow.

```tsx
import { PayLinkButton } from '@hashpaylink/sdk'

export default function CheckoutPage({ invoice }) {
  return (
    <PayLinkButton
      recipientEVM="0xYourEVMAddress"
      recipientSolana="YourSolanaAddress"
      amount={invoice.total.toString()}
      memo={`Invoice #${invoice.id}`}
    />
  )
}
```

When the payer clicks the button, a full Hash PayLink checkout opens in a new tab. Use event dashboards, webhook-style backend polling, or your own explorer/indexer flow to reconcile confirmed payments.

**What the payer sees:**
```
┌────────────────────────────────────┐
│        PAYMENT REQUEST             │
│     25.00  USDC · HSK              │
│     "Invoice #042"                 │
├────────────────────────────────────┤
│  ● Base  ● HashKey  ● Arc          │
│  ● Starknet  ● Solana              │
├────────────────────────────────────┤
│  Includes 0.2% platform fee        │
│  ⚡ Pay 25 USDC  ↗                 │
│  Powered by Hash PayLink · Non-custodial │
└────────────────────────────────────┘
```

---

### Option B — Direct URL (No npm Install)

Embed a payment link directly in emails, HTML, Notion pages, or anywhere that accepts a URL:

```
https://hashpaylink.com/pay?e=0xYour...&s=YourSolana...&a=25&m=Invoice+042
```

**Full URL parameter reference:**

| Param | Description | Example |
|---|---|---|
| `evm` | EVM recipient (Base · Arbitrum · Arc · HashKey) | `0xAbCd…` |
| `stark` | Starknet recipient | `0x04a3…` (64 hex chars) |
| `sol` | Solana recipient | `YourBase58Address` |
| `amt` | Fixed USDC amount | `10` |
| `flex` | Flexible amount mode (payer enters amount) | `1` |
| `memo` | On-chain memo | `Coffee` |
| `net` | Lock to one chain | `base` · `arc` · `hashkey` · `starknet` · `solana` |
| `multi` | Multi-chain mode (payer picks chain) | `1` |
| `event` | Multi-Payer Collection mode | `1` |
| `id` | Event ID for dashboard tracking | `abc123…` |
| `fx` | Local currency display | `NGN` · `GHS` · `KES` · `SGD` |
| `fxshow` | Show FX to payer | `1` |
| `fxsrc` | Rate source | `live` · `custom` |
| `fxrate` | Custom rate value | `1780` |

---

### Option C — Inline Widget (Full Control)

Embeds the payment UI directly inside your page. Requires wallet providers.

#### Step 1 — Set up providers (once in your app root)

```tsx
// app/providers.tsx
import { WagmiProvider } from 'wagmi'
import { RainbowKitProvider, lightTheme } from '@rainbow-me/rainbowkit'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { StarknetProvider } from '@hashpaylink/sdk/starknet'
import { wagmiConfig } from './wagmi' // your wagmi config

import '@rainbow-me/rainbowkit/styles.css'

const queryClient = new QueryClient()

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={lightTheme({ accentColor: '#0071E3' })}>
          <StarknetProvider>
            {children}
          </StarknetProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
```

#### Step 2 — Drop the widget

```tsx
// app/checkout/page.tsx
import { PayLinkButton } from '@hashpaylink/sdk'

export default function Checkout({ product }) {
  return (
    <PayLinkButton
      recipientEVM={process.env.NEXT_PUBLIC_TREASURY_EVM}
      recipientSolana={process.env.NEXT_PUBLIC_TREASURY_SOL}
      amount={product.price.toString()}
      memo={product.name}
      hosted={false}
      onPaymentSuccess={({ txHash, chain }) =>
        router.push(`/receipt?tx=${txHash}&chain=${chain}`)
      }
    />
  )
}
```

---

### Full Props Reference

```tsx
<PayLinkButton
  recipientEVM="0x..."           // EVM address (Base · HashKey · Arc)
  recipientStark="0x..."         // Starknet address (0x + 64 hex chars)
  recipientSolana="..."          // Solana base58 address
  amount="25"                    // Fixed payment amount in USDC/HSK
  memo="Invoice #042"            // On-chain memo (≤100 chars)
  flex={false}                   // true = payer enters amount at checkout
  multiChain={true}              // true = show all chains the organiser has addresses for
  platformFeeBps={20}            // Default 20 (0.2%). Pass 0 to disable.
  hosted={true}                  // true = new tab checkout (zero config)
                                 // false = inline widget (requires wagmi setup)
  label="Pay with USDC"          // Custom button label
  onPaymentSuccess={(params) => {
    const {
      txHash,           // "0xabc…" or Solana signature
      chain,            // 'base' | 'arc' | 'hashkey' | 'starknet' | 'solana'
      amount,           // "25"
      asset,            // "USDC" | "HSK"
      recipientAddress, // "0xYour…"
      platformFee,      // "0.05"
      timestamp,        // Unix ms
    } = params
  }}
  onPaymentError={(error) => console.error(error.message)}
/>
```

---

### How It Syncs With Your Platform

```
Your platform                     Hash PayLink
──────────────                    ─────────────────────────────────
User clicks "Pay"          →      Hosted checkout opens in new tab
                                  Payer selects chain
                                  Payer connects wallet or uses address
                                  Payment confirmed on-chain (< 3 seconds)
                           ←      onPaymentSuccess({ txHash, chain, amount })
Your backend receives callback
  → Verify txHash on-chain
  → Mark order paid, send receipt, unlock content, etc.
```

> **For production:** always verify `txHash` server-side on the relevant block explorer before fulfilling orders.

---

### Verify a Payment On-Chain

| Chain | Explorer | Endpoint |
|---|---|---|
| Base | [basescan.org](https://basescan.org) | `basescan.org/tx/{txHash}` |
| HashKey | [explorer.hsk.xyz](https://explorer.hsk.xyz) | `explorer.hsk.xyz/tx/{txHash}` |
| Starknet | [starkscan.co](https://starkscan.co) | `starkscan.co/tx/{txHash}` |
| Arc | [testnet.arcscan.app](https://testnet.arcscan.app) | `testnet.arcscan.app/tx/{txHash}` |
| Solana | [solscan.io](https://solscan.io) | `solscan.io/tx/{txHash}` |

---

## 16. Security Architecture

Security is the foundation of Hash PayLink. Here is exactly how we protect every payment.

### Non-Custodial by Design

Hash PayLink **never holds funds at any point.** Payments go directly from payer to recipient address (or through transparent, auditable smart contracts). We cannot freeze, reverse, or intercept any payment.

### Smart Contract Guarantees (EVM)

The `PayLinkFactoryV2` contract enforces on-chain:

- **`onlyRelayer`** — only the registered Hash PayLink relayer can trigger a relay. No third party can intercept vault funds.
- **`MAX_GAS_REIMB` cap (1.00 USDC)** — the relayer cannot overcharge gas reimbursement, capped in the contract itself.
- **CREATE2 collision guard** — attempting to relay the same `linkId` twice reverts at the contract level. Double-spend is impossible.
- **Fee splits are deterministic** — `recipient = total - platform_fee - gas_reimb`. All values are transparent and verifiable on-chain.

### Private Key Security

- `RELAYER_PRIVATE_KEY` lives **only in server environment variables** (Render/Vercel secrets)
- It is **never prefixed `NEXT_PUBLIC_` or `VITE_`** — it can never reach the browser
- Each chain uses an isolated relayer key (`RELAYER_PRIVATE_KEY`, `RELAYER_PRIVATE_KEY_SOLANA`)
- The key is used only inside API route handlers, never stored or logged

### EIP-712 Typed Signatures

All gasless EVM operations use **EIP-712 structured typed data** — not raw `eth_sign`. The payer's wallet displays exact permit parameters (spender address, amount, deadline) before signing. Nothing is hidden or obfuscated.

### No Backend Required for Validation

Payment validity is enforced on-chain. The Hash PayLink backend is a **relay layer only** — it cannot forge signatures, steal funds, or prevent direct payments. You can always pay directly to the recipient address without using Hash PayLink's relay infrastructure.

### DefiLlama Fee Reporting

Hash PayLink's DefiLlama fees adapter was merged in [DefiLlama/dimension-adapters#6932](https://github.com/DefiLlama/dimension-adapters/pull/6932). It reports USDC transfers received by the Hash PayLink EVM treasury on Base and Arbitrum from `2026-05-01` onward.

The adapter reports `dailyFees`, `dailyUserFees`, `dailyRevenue`, and `dailyProtocolRevenue`. It is a fees/revenue adapter only: Hash PayLink remains stateless and non-custodial, so there is no TVL to count. Solana and Starknet treasury tracking can be added in follow-up adapter updates once their data source is compatible with DefiLlama CI.

### Open Source

The complete payment and relay logic is publicly auditable:
- [`src/pages/PaymentPage.tsx`](src/pages/PaymentPage.tsx) — full payer flow
- [`api/relay-v2.ts`](api/relay-v2.ts) — EVM relay
- [`api/relay-solana.ts`](api/relay-solana.ts) — Solana gasless relay

---

## 17. Agent Legal Wrapper Roadmap

Hash PayLink currently operates `hashpaylink-agent` as a software agent service. The agent can sell x402-gated API responses, record Circle Gateway x402 receipts, and attach governance metadata.

Current status:

| Layer | Status |
|---|---|
| Circle Gateway x402 receipts | Live |
| Agent governance metadata | Live |
| Legal wrapper | Planned |
| Entity-backed counterparty | Pending formation |

Planned legal wrapper: form an LLC or DAO LLC for `hashpaylink-agent`, then make that entity the named owner/operator in receipts, terms, Circle treasury records, and governance logs.

Important boundary: the codebase does not create an LLC or DAO LLC by itself. Until the entity is actually formed, Hash PayLink should not describe `hashpaylink-agent` as an LLC, DAO LLC, independent legal person, or independently contracting party.

Correct current wording:

> Hash PayLink operates `hashpaylink-agent` as a software agent service with Circle Gateway x402 receipts and governance metadata.

The `/agent-terms`, `/api/agent-legal-profile`, and `/api/agent-governance` surfaces are readiness infrastructure for future legal-entity metadata. They should receive official entity values only after formation and legal review.

---

## 18. Environment Variables Reference

Required on the server (Render / Vercel environment settings):

```env
# ── EVM Relay ────────────────────────────────────────────────────────────
RELAYER_PRIVATE_KEY=              # 0x-prefixed private key — Base + HashKey relay
RELAYER_PRIVATE_KEY_ARC=          # Arc-specific relay key (falls back to above if unset)
PRIVATE_RPC_URL=                  # Private Alchemy/QuickNode RPC for Base
PRIVATE_RPC_URL_ARC=              # Private Arc RPC
PAYLINK_FACTORY_V2=               # PayLinkFactoryV2 contract address on Base
PAYLINK_FACTORY_V2_ARC=           # PayLinkFactoryV2 contract address on Arc
TREASURY_ADDRESS=                 # EVM treasury wallet (receives platform fees)
ADMIN_SECRET=                     # Long random secret for protected maintenance endpoints
CRON_SECRET=                      # Optional long random secret for cron/maintenance calls

# ── Solana Relay ─────────────────────────────────────────────────────────
RELAYER_PRIVATE_KEY_SOLANA=       # Base58 or JSON-array Solana keypair
SOLANA_RPC_URL=                   # Private QuickNode Solana RPC
SOLANA_TREASURY=                  # Solana treasury wallet address

# ── FX Rate (optional — only needed for Live rate mode) ──────────────────
FIXER_API_KEY=                    # Fixer.io access key (free plan: 100 req/month)

# Agent legal/governance metadata, optional.
# Leave legal entity fields unset until the legal wrapper exists.
AGENT_LEGAL_ENTITY_NAME=
AGENT_LEGAL_ENTITY_TYPE=
AGENT_LEGAL_JURISDICTION=
AGENT_LEGAL_ENTITY_ID=
AGENT_LEGAL_EIN_LAST4=
AGENT_REGISTERED_AGENT=
AGENT_REGISTERED_AGENT_ADDRESS=
AGENT_LEGAL_TERMS_URL=
AGENT_OPERATOR_ROLE=
AGENT_GOVERNANCE_VERSION=
AGENT_MODEL_ID=
AGENT_PROMPT_HASH=
AGENT_CONFIG_HASH=
AGENT_OPERATING_AGREEMENT_HASH=
AGENT_GOVERNANCE_UPDATED_AT=
AGENT_GOVERNANCE_SECRET=

# Agentic Streaming daily LP reports.
AGENTIC_STREAMING_CRON_SECRET=          # Secret used by Render Cron or any scheduler
AGENTIC_STREAMING_FROM_EMAIL=           # Optional; falls back to STREAM_INVITE_FROM_EMAIL or ALERT_FROM_EMAIL
AGENTIC_STREAMING_FROM_NAME=            # Optional; defaults to Hash PayLink Agent
AGENTIC_STREAMING_REPORT_INTERVAL_HOURS=23
AGENTIC_STREAMING_STORE_KEY=hashpaylink:agentic-streaming
```

> **Custom rate mode** requires no `FIXER_API_KEY` — the rate is baked into the payment URL at link creation time.

---

## 19. Support & Contact

- **Email:** [support@hashpaylink.com](mailto:support@hashpaylink.com)
- **X / Twitter:** [@Hash_PayLink](https://x.com/Hash_PayLink)

**For branded QR code requests** (businesses and organisations):
Email [support@hashpaylink.com](mailto:support@hashpaylink.com) with your business name, wallet addresses, and preferred chains. We respond within 24 hours.

**For Nigerian merchants using Spenda for NGN off-ramp:**
Register at [spenda.co](https://spenda.co), generate your USDC deposit addresses, and include them in your branded QR code request email.

**For Arc testnet issues or faucet problems:**
Visit [arc.fun](https://arc.fun) or the Arc Discord community for the latest testnet resources.

---

*Hash PayLink is open source — MIT licensed.*
*Built on [Base](https://basescan.org) · [HashKey Chain](https://explorer.hsk.xyz) · [Starknet](https://starkscan.co) · [Arc Economic OS](https://arc.fun) · [Solana](https://solscan.io)*
