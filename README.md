# HashPayLink — Monorepo

This repository contains **two independent products** deployed together on a single Render service.

| Product | What it does | Live |
|---|---|---|
| **Hash PayLink** | Multi-chain USDC payment request links across Base, HashKey, Starknet, Arc | [hashkey-paylink.onrender.com](https://hashkey-paylink.onrender.com) |
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

# Hash PayLink SDK &nbsp;`v1.0.0-Mainnet`

> **The Stripe of the Modular Future.**  
> One line of code to accept stablecoins across the world's most efficient networks.

[![npm](https://img.shields.io/badge/npm-%40hashpaylink%2Fsdk-black?logo=npm)](https://www.npmjs.com/package/@hashpaylink/sdk)
[![Live App](https://img.shields.io/badge/Live-hashkey--paylink.onrender.com-0071E3)](https://hashkey-paylink.onrender.com)
[![Arc Economic OS](https://img.shields.io/badge/Arc-Economic_OS-7C3AED?logo=ethereum)](https://arc.fun)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Built with Claude](https://img.shields.io/badge/Built_with-Claude_4.7-orange?logo=anthropic)](https://anthropic.com)

---

## Why Hash PayLink?

| Problem | Hash PayLink Fix |
|---|---|
| Accept crypto = 200 lines of wagmi boilerplate | One `<PayLinkButton>` component |
| Users stranded on the wrong chain | Auto-switch: click Arc → wallet switches instantly |
| Gas kills small payments | Zero-gas UX on Base (EIP-7702) and Starknet (AVNU) |
| No Starknet support in EVM SDKs | Native ArgentX/Braavos via injected provider |
| Revenue share opacity | Transparent 0.5% fee shown in every tx before signing |

---

## Quad-Chain Engine

| Chain | Asset | Finality | Gas Model | Chain ID |
|---|---|---|---|---|
| ⬡ **Arc** | USDC | **Sub-second** | Native USDC Gas | 5042002 |
| 🔵 **Base** | USDC | ~2 s | EIP-7702 Sponsored | 8453 |
| 🟣 **Starknet** | USDC | ~2 s | AVNU Paymaster | — |
| 🟡 **HashKey** | HSK | ~3 s | Native HSK | 177 |

---

## Installation

```bash
npm install @hashpaylink/sdk
# or
yarn add @hashpaylink/sdk
# or
pnpm add @hashpaylink/sdk
```

---

## Quick Start

Five lines. That's it.

```tsx
import { PayLinkButton } from '@hashpaylink/sdk'

export default function Checkout() {
  return (
    <PayLinkButton
      recipientEVM="0xYourEVMAddress"
      amount="10"
      memo="Coffee"
      onPaymentSuccess={({ txHash, chain }) => console.log('Paid!', txHash, 'on', chain)}
    />
  )
}
```

This opens Hash PayLink's **hosted checkout** — no wallet setup required in your app. Your user selects their preferred chain, connects their wallet, and pays. You get notified via `onPaymentSuccess`.

---

## API Reference

### `<PayLinkButton>`

```tsx
<PayLinkButton
  recipientEVM="0x..."          // EVM address (Base · HashKey · Arc)
  recipientStark="0x..."        // Starknet address (optional, exactly 64 hex chars)
  amount="25"                   // Amount in asset units ("25" = 25 USDC)
  memo="Invoice #042"           // Stored on-chain in tx input data
  platformFeeBps={50}           // Default: 50 (0.5%). Set 0 to disable.
  hosted={true}                 // true = hosted checkout tab (default)
                                // false = inline widget
  label="Pay with Crypto"       // Custom button label
  onPaymentSuccess={(params) => {
    console.log(params.txHash)        // "0xabc..."
    console.log(params.chain)         // 'arc' | 'base' | 'starknet' | 'hashkey'
    console.log(params.platformFee)   // "0.125" (fee in asset units)
  }}
  onPaymentError={(error) => {
    console.error(error.message)
  }}
/>
```

#### Props

| Prop | Type | Required | Default | Description |
|---|---|---|---|---|
| `recipientEVM` | `string` | * | — | EVM address (`0x` + 40 hex) |
| `recipientStark` | `string` | * | — | Starknet address (`0x` + 64 hex) |
| `amount` | `string` | ✓ | — | Payment amount |
| `memo` | `string` | — | — | On-chain memo (≤100 chars) |
| `platformFeeBps` | `number` | — | `50` | Fee in basis points |
| `hosted` | `boolean` | — | `true` | Hosted vs inline mode |
| `label` | `string` | — | `"Pay {amount} USDC"` | Button text |
| `onPaymentSuccess` | `function` | — | — | Success callback |
| `onPaymentError` | `function` | — | — | Error callback |

*At least one of `recipientEVM` or `recipientStark` is required.

---

## Getting Started Guide

### 1 · Hosted Checkout (Zero Config)

The fastest integration. No wallet providers, no wagmi, no RainbowKit needed in your app. Hash PayLink hosts the payment page.

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
          // Mark invoice paid in your database
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

### 2 · Generate a Payment Link (No SDK)

Use the hosted checkout URL directly — embed in emails, QR codes, or Telegram messages.

```
https://hash-paylink.vercel.app/pay?evm=0xYourAddress&stark=0xYourStark&amt=10&memo=Coffee
```

**URL parameters:**

| Param | Description | Example |
|---|---|---|
| `evm` | EVM recipient address | `0xAbCd...` |
| `stark` | Starknet recipient address | `0x04a3...` (64 hex) |
| `amt` | Amount | `10` |
| `memo` | On-chain memo | `Coffee` |

---

### 3 · Inline Widget (Full Control)

Embed the payment UI directly in your page. Requires wagmi + Starknet providers in the host app.

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
      hosted={false}   // renders inline widget
      onPaymentSuccess={({ txHash }) => router.push(`/receipt?tx=${txHash}`)}
    />
  )
}
```

---

## Fee Engine

Hash PayLink charges a **0.5% platform fee** (50 bps) on every transaction. The fee is shown transparently in the payment UI before the user signs — no surprises.

```
User pays:       10.00 USDC
Platform fee:     0.05 USDC  (0.5%)
Recipient gets:   9.95 USDC
```

### Fee Configuration

```tsx
// Disable (self-hosted deployments)
<PayLinkButton platformFeeBps={0} ... />

// Custom (Enterprise)
<PayLinkButton platformFeeBps={25} ... />  // 0.25%
```

### FeeRouter Contract (On-chain Collection)

Full on-chain fee splitting requires deploying the FeeRouter contract.  
Until deployed, the fee is displayed informationally — the full amount goes to the recipient.

```solidity
// FeeRouter.sol (interface)
interface IFeeRouter {
    /// @notice Route payment between recipient and treasury
    function routePayment(
        address token,      // ERC-20 or address(0) for native
        address recipient,
        uint256 amount,     // total including fee
        uint16  feeBps      // 50 = 0.5%
    ) external;
}
```

Deploy FeeRouter → set `PLATFORM_TREASURY` in `src/lib/chains.ts` → fees collected automatically.

---

## Webhooks / `onPaymentSuccess`

The callback fires after on-chain confirmation. Use it as a lightweight webhook.

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
      platformFee,      // "0.05"
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
/^0x[0-9a-fA-F]{64}$/.test(v)   // enforced — pasting an EVM address shows:
// ⚠️ Error: Must be a valid 64-character Starknet address.
```

---

## Auto-Switch Network

When a user clicks a chain pill on the payment page:

| User clicks | Wallet receives | Result |
|---|---|---|
| **Arc** | `wallet_switchEthereumChain` (5042002) | Arc branding + sub-second badge |
| **Base** | `wallet_switchEthereumChain` (8453) | Blue glow, EIP-7702 gas |
| **HashKey** | `wallet_switchEthereumChain` (177) | Gold glow, native HSK |
| **Starknet** | `window.starknet.enable()` | ArgentX/Braavos popup |

If the chain isn't in the wallet yet, `wallet_addEthereumChain` fires automatically — users never touch network settings manually.

---

## Folder Structure

```
src/
├── lib/
│   ├── chains.ts            ← ChainKey, CHAIN_META, arcChain, PLATFORM_FEE_BPS
│   ├── wagmi.ts             ← wagmiConfig (Base + HashKey + Arc)
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
│   └── PaymentPage.tsx      ← Payment checkout (payer flow)
│
└── Layout.tsx               ← Sticky header, dual-wallet, Starknet dropdown
```

---

## Pricing & Tiers

| Tier | Fee | Includes |
|---|---|---|
| **Standard** | 0.5% per tx | All 4 chains, hosted checkout, webhooks, open source |
| **Enterprise** | Custom | Whitelabel UI, custom domains, priority support, FeeRouter deployment |
| **Hackathon** | 0% | 30-day fee waiver — contact us on Discord |

---

## Arc Economic OS Partnership

Hash PayLink is built as a **first-class integration** for the Arc Economic OS ecosystem.

- **Sub-second finality** — Arc makes crypto payments feel like Stripe, not Web3
- **Native USDC Gas** — Circle's native deployment on Arc eliminates bridging friction
- **Chain ID 5042002** — pre-configured, no manual RPC setup required
- **Modular routing** — Arc's Economic OS architecture maps directly to Hash PayLink's chain-agnostic payment engine

> This project was built with **Claude 4.7** for the **Cerebral Valley Hackathon**.  
> We are partnership-ready for Arc Economic OS ecosystem grants, integration bounties, and co-marketing programs.

---

## Security

- **Non-custodial**: the SDK never holds funds — all payments are direct wallet-to-wallet
- **No backend required**: payment validation happens on-chain
- **Open source**: audit the [payment logic](src/pages/PaymentPage.tsx) yourself
- **Strict validation**: EVM (40-char) and Starknet (64-char) enforced at input and on generate
- **No private key exposure**: injected wallet providers only (`window.ethereum`, `window.starknet`)

---

## Contributing

```bash
git clone https://github.com/your-org/hash-paylink
cd hash-paylink
npm install
npm run dev       # http://localhost:5173
```

PRs welcome. Open an issue first for large changes.

---

## License

MIT © 2026 Hash PayLink Contributors  

*Built on [HashKey Chain](https://explorer.hsk.xyz) · [Base](https://basescan.org) · [Starknet](https://starkscan.co) · [Arc Economic OS](https://arc.fun)*
