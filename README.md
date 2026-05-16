# HashPayLink — Monorepo

This repository contains **two independent products** deployed together on a single Render service.

| Product | What it does | Live |
|---|---|---|
| **Hash PayLink** | Multi-chain USDC/HSK payment links across Base, HashKey, Starknet, Arc, and Solana | [hashpaylink.com](https://hashpaylink.com) |
| **StreamPay** | USDC streaming payroll + Creator Proof-of-Attention paywall on Arc | [hashpaylink.com/?app=streampay](https://hashpaylink.com/?app=streampay) |

The active product is selected by hostname — StreamPay loads automatically on `streampay.xyz` once DNS is configured. See [`modules/streampay/README.md`](modules/streampay/README.md) for StreamPay-specific documentation.

## 0G-Powered Ecosystem

0G is the verifiable memory and proof layer for the Hash PayLink ecosystem. Hash PayLink handles payment creation and multi-chain settlement; 0G turns the resulting payment events into permanent, independently verifiable records that agents, dashboards, APIs, and future StreamPay modules can trust without relying on a centralized database.

| Product surface | How 0G is used |
|---|---|
| **Multi-Payer Collection** | Every payer row is uploaded as a JSON record to 0G Storage and anchored through `PayLinkArchive` on 0G Mainnet. |
| **Organizer Dashboard** | Each payment shows a live 0G archive badge and explorer proof, so event organizers can prove who paid, when, on which chain, and for how much. |
| **Access Mode** | AI agents, APIs, and gated services call `/api/agent-verify` to unlock access only after a 0G-anchored payment proof exists. |
| **Photon Telegram Agent** | Telegram creates PayLinks, asks users to pay, then verifies 0G proofs before returning paid AI answers. |
| **Built-in AI Agent** | `/api/agent-ask` checks `PayLinkArchive` on 0G Mainnet before returning Anthropic-powered Circle/Arc/Hash PayLink strategy responses. |
| **StreamPay / Creator PoA** | StreamPay produces time-based and attention-based payment events; the product architecture is designed to attach those stream and PoA settlement records to the same 0G proof layer. |

The hackathon thesis is simple: **0G makes Hash PayLink payments agent-readable.** A payment is no longer just a chain transaction; it becomes persistent agent memory that can unlock AI responses, prove event attendance, verify creator access, and support autonomous payment workflows.

> **Agentic Economy — Trustless Payment-Gated AI**
> Hash PayLink uses [0G decentralized storage](https://0g.ai) to create permanent, verifiable payment proofs — enabling any AI agent to confirm payment before responding, with no database, no login system, and no intermediary.
> **Live demo:** [hashpaylink.com/agent](https://hashpaylink.com/agent) · **Verification API:** `GET https://hashpaylink.com/api/agent-verify?eventId=test-0g-1778114523394&payer=HashPayLink+0G+Test`
> [Jump to 0G Integration →](#0g-storage-integration--decentralized-payment-archive)

### Repository Structure

```
hashkey-paylink/
├── src/                      # Hash PayLink — React frontend
├── api/                      # Hash PayLink — Express API handlers
├── contracts/                # Hardhat project (PayLinkFactoryV2 + archived router contracts)
├── modules/
│   └── streampay/            # StreamPay — fully self-contained module
├── server.ts                 # Shared Express server
└── tailwind.config.js        # Shared Tailwind config
```

---

# Hash PayLink &nbsp;`v2.0.0`

> **The contactless USDC payment layer for the real world.**
> One link. Five chains. Zero gas for the payer. No bank account required.

[![Live App](https://img.shields.io/badge/Live-hashpaylink.com-0071E3)](https://hashpaylink.com)
[![Base App Store](https://img.shields.io/badge/Base_App_Store-Listed-0052FF?logo=ethereum)](https://base.org/ecosystem)
[![Base Builder Code](https://img.shields.io/badge/ERC--8021-bc__8qtb7tny-0052FF)](https://base.org/builders)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## What is Hash PayLink?

Hash PayLink is a **stateless, non-custodial payment infrastructure** that turns a single shareable URL or QR code into a complete multi-chain checkout experience. No app download. No merchant account. No gas tokens in the payer's wallet. Just a link — and payment arrives in seconds.

**Payer experience:** scan a QR code or tap a link → select a chain → pay in USDC (or HSK) → done. Zero setup, zero friction.

**Organizer experience:** generate a link in under 30 seconds → share it → watch a live dashboard update as payments arrive in real time → export to CSV.

---

## Why Hash PayLink?

| Problem | Hash PayLink Fix |
|---|---|
| Accept crypto = 200 lines of wagmi boilerplate | One `<PayLinkButton>` component |
| Users stranded on wrong chain | Auto-switch: click a chain pill → wallet switches instantly |
| Gas friction kills micro-payments | Every chain is gasless for the payer (see Gasless Engine below) |
| Solana users excluded from EVM payments | Native Solana USDC support with full gasless relay |
| Payment links tied to one chain | One link covers 5 chains — payer picks their preferred chain |
| No visibility into fees | Transparent platform fee shown before every signature |
| Payments hard to track | Real-time on-chain listener + live organizer dashboard |
| Restaurants/shops need a POS terminal | QR code acts as a contactless, always-on payment terminal |
| Long error messages confuse payers | Human-readable: "Insufficient funds", "Transaction cancelled" |
| Underpayments silently logged wrong | Full / Partial / Underpayment detection with exact shortfall shown |

---

## Penta-Chain Engine

| Chain | Asset | Finality | Gas Model | Pay Modes | Chain ID |
|---|---|---|---|---|---|
| 🔵 **Base** | USDC | ~2 s | Circle/Paymaster Sponsored · Wallet fallback | Wallet Connect · Send via Address | 8453 |
| 🟡 **HashKey** | HSK | ~3 s | Native HSK | Wallet Connect | 177 |
| 🟣 **Starknet** | USDC | ~2 s | AVNU Paymaster · Sponsored | Wallet Connect | — |
| 🩵 **Arc** | USDC | Sub-second | Native USDC Gas | Wallet Connect · Send via Address | 5042002 |
| 🟢 **Solana** | USDC | ~0.5 s | Relayer Sponsored | Circle Smart Wallet · Wallet Connect · Send via Address | — |
| 🔷 **Arbitrum** | USDC | ~2 s | Relayer Sponsored · Circle Paymaster / Smart Wallet | Wallet Connect · Send via Address | 42161 |

---

## The Gasless Engine — How Nobody Pays Gas

This is the core innovation of Hash PayLink. **On every supported chain, the payer never needs to hold or spend a gas token.** Here is exactly how each chain achieves this:

---

### Base — Circle Smart Wallet / EVM Wallet Checkout

1. Circle email smart-wallet payments route USDC directly to the merchant and treasury in one hosted checkout flow. The payer needs USDC, not Base ETH.
2. Connected Base wallet payments first try Coinbase/CDP Paymaster sponsorship for compatible Coinbase Smart Wallet/Base Account connections.
3. If the connected wallet does not support the sponsored call path, Base falls back to a standard wallet transaction, which requires the payer to hold Base ETH.
4. Sponsored smart-wallet payments can include a configured internal USDC gas recovery amount routed to treasury.
5. On **Base Mainnet**, every supported connected-wallet transaction appends the ERC-8021 Base Builder Code (`bc_8qtb7tny`) to calldata for Base attribution.

### Arbitrum — Connected-Wallet Relayer / Circle Paymaster

1. Connected-wallet Arbitrum payments use an EIP-2612 permit signature. The payer signs off-chain, then Hash PayLink submits the transaction through `/api/relay-gho`.
2. The Hash PayLink Arbitrum relayer pays ETH gas. The payer needs Arbitrum USDC, not Arbitrum ETH.
3. Circle Paymaster is configured for the Arbitrum Circle Smart Wallet path, so compatible Circle smart-wallet payments can use Circle's paymaster route instead of the Hash PayLink `/api/relay-gho` fallback.
4. Arbitrum Send via Address uses the same ghost-vault settlement model described below.

> **Why this matters:** the production payment surface stays direct and stateless. Hash PayLink does not custody funds or depend on a pre-deployed merchant router.

---

### Base, Arbitrum & Arc — CREATE2 Ghost Vault (Send via Address)

1. When the payer selects "Send via Address", Hash PayLink calls `PayLinkFactoryV2.getVaultAddress(linkId, recipient)` — a **pure on-chain computation** that predicts a deterministic CREATE2 address. No transaction needed.
2. The payer sends USDC to this address from **any wallet, CEX withdrawal, or existing balance** — no wallet connection required.
3. A Hash PayLink relayer polls the vault address every 3 seconds. The moment USDC arrives, it calls `PayLinkFactoryV2.relay(linkId, recipient, gasReimbUsdc)`.
4. The contract forwards USDC to the recipient, deducts the platform fee to treasury, and reimburses the relayer's gas cost in USDC. The relayer pays ETH gas — never the payer.
5. The contract enforces: `onlyRelayer`, `MAX_GAS_REIMB` cap (1.00 USDC), and CREATE2 collision guard — double-relay reverts at the contract level.

> **Payer needs:** USDC in any wallet. Zero ETH. Zero wallet connection. Zero app.

---

### Starknet — AVNU Paymaster (Wallet Connect)

1. The payer connects ArgentX or Braavos — the two leading Starknet wallets.
2. Hash PayLink constructs a USDC transfer call using Starknet's native `invoke` transaction format.
3. **AVNU Paymaster** sponsors the STRK gas fee entirely — it pays Starknet's sequencer on the payer's behalf.
4. The payer signs in their wallet and sees only a USDC debit — no STRK balance required whatsoever.
5. Hash PayLink polls the Starknet JSON-RPC for `ACCEPTED_ON_L2` status (finalised within ~2 seconds) before confirming success.

> **Payer needs:** USDC on Starknet. Zero STRK.

---

### HashKey Chain — Native HSK (Wallet Connect)

1. The payer connects their wallet to HashKey Chain (Chain ID 177).
2. Hash PayLink constructs a direct native HSK transfer — no token contract, no permit.
3. The payer signs one transaction. Gas is paid in HSK and is negligible (~0.0001 HSK).
4. Hash PayLink polls the HSK balance of the recipient address every 2 seconds for confirmation.

> **HashKey is the only chain where the payer spends a small amount of the payment asset (HSK) as gas. On all other chains, gas is fully sponsored.**

---

### Solana — Circle Smart Wallet / Relayer as Fee Payer

1. When the payer chooses Circle Smart Wallet or Connect Wallet on Solana, their wallet address is sent to Hash PayLink's relay server.
2. The server calls `/api/solana-build-tx` and builds a Solana transaction with `feePayer: relayer.publicKey` — the **relayer's wallet pays all SOL network fees**, not the payer.
3. The relayer partially signs the transaction as fee payer.
4. The partially-signed transaction (base64-encoded) is returned to Circle Smart Wallet or the payer's Phantom/Solflare/Backpack wallet for signing.
5. The payer signs **only the USDC `transferChecked` instruction** — authorising the USDC transfer from their Associated Token Account (ATA) to the recipient's ATA.
6. The fully-signed transaction is submitted via `/api/solana-relay`. The platform fee (0.2%), configured internal gas recovery, and any first-time recipient ATA recovery are routed to the Hash PayLink treasury ATA atomically.
7. Recipient and treasury ATAs are not temporary accounts, so they are not closed after direct payments. If the relayer creates them once, later payments to the same addresses are cheaper.

> **Payer needs:** USDC on Solana. Zero SOL.

---

### Solana — Vault ATA (Send via Address)

1. Hash PayLink derives a deterministic vault keypair from `SHA-256("hashpaylink_sol_vault_" + linkId)`.
2. The vault's Associated Token Account (ATA) address is returned to the payer.
3. The payer sends USDC to this ATA from any Solana wallet — no connection required.
4. Hash PayLink polls the vault ATA every 3 seconds. On USDC arrival, `/api/solana-sweep` executes:
   - Transfers net USDC to the recipient's ATA
   - Transfers the 0.2% platform fee plus configured internal gas recovery to the Hash PayLink treasury ATA
   - Adds configured recipient ATA recovery only when the sweep has to create the recipient's USDC token account
   - **Closes the vault ATA** — returning ~0.002 SOL rent back to the relayer
5. This rent recovery keeps the relayer **self-funding** — every sweep replenishes SOL that covers future sweeps. No manual top-ups required.
6. The sweep response returns the exact `recipientAmount` (actual USDC received), which is shown in the success card and logged on the organizer dashboard.

> **Payer needs:** USDC on Solana. Zero SOL. Zero wallet connection.

---

## Payment Pages & UI

### Payment Card

When a payer opens a Hash PayLink URL, they see a **payment card** that includes:

- **Chain selector pills** — one for each chain the link supports. Active chain highlighted in its brand color (blue for Base, gold for HashKey, purple for Starknet, teal for Arc, green for Solana). Switching chains auto-updates the network in the connected wallet.
- **Amount display** — the requested USDC/HSK amount in large bold type with the asset label.
- **On-chain memo** — if set by the organizer, shown as a pill badge below the amount.
- **Network details row** — chain name, engine type, Chain ID, and platform fee.
- **Pay mode toggle** — "Connect Wallet" or "Send via Address" (available on Base, Arc, Solana).
- **Underpayment detection** — if the actual received amount differs from the requested amount, the success card changes state:
  - ✅ **≥99% received** → Green "Payment Sent!" (standard)
  - 🟡 **50–99% received** → Amber "Partial Payment" with exact shortfall displayed
  - 🔴 **<50% received** → Red "Underpayment Detected" with exact shortfall

### Flexible Amount Mode

When the organizer enables **Flexible Amount**, the payer sees:

```
    ENTER AMOUNT
    [  0.00  ]  USDC
```

A large centered input directly under the "Enter Amount" label. The payer types how much they want to pay. No reason/memo field — just the amount. This is ideal for restaurants, donations, tipping, and any context where the payer chooses what they pay.

### Full-Screen Success Card

After payment confirmation, the payer sees a full-screen success card with:
- Chain-specific glow effect and brand colors
- Exact amount received (actual on-chain value)
- Transaction hash with direct explorer link
- Event registration confirmation (multi-payer mode)

---

## Multi-Chain Payment Links

A single Hash PayLink can carry addresses for **multiple chains simultaneously**. The organizer fills in EVM, Starknet, and Solana addresses during link creation — and the payer sees all available chains as selectable pills. One link. Any chain.

**URL format:**
```
https://hashpaylink.com/pay?x=1&a=10&e=0xYour...&k=0xYourStark...&s=YourSolana...
```

**How it works:**
- `x=1` unlocks all chain selectors
- The payer chooses their preferred chain — only the relevant address is used for that payment
- The organizer receives funds on whichever chain the payer chose

---

## Multi-Payer Collection (Event Mode)

Designed for events, classes, group splits, and any scenario where **many people pay one organizer**. Enabled by toggling "Multi-payer Collection" on the link creation page.

**Payer flow:**
1. Payer opens the payment link
2. Enters their name (required for event registration)
3. Selects chain and pays
4. Their name, amount, chain, and transaction hash are logged in real time

**Organizer dashboard features:**
- Live payment feed — each attendee's name, chain, amount, and timestamp appear as payments arrive
- Actual received amount logged (not the requested URL amount — real on-chain value)
- Multi-chain monitoring — watches Base, Arc, HashKey, Starknet, and Solana simultaneously
- CSV export — download full payment log with one click
- QR code display — show the event QR code on a screen for attendees to scan
- Dashboard URL is shareable separately from the payment link

**Real-world use cases:**
- School/class fee collection
- Conference or event registrations
- Group dinners and bill splits
- Community dues and subscriptions
- Online fundraisers and charity drives
- Sports team registration fees

---

## QR Code Feature

Every Hash PayLink automatically generates a **downloadable QR code** at 1024×1024px — suitable for print, display screens, and physical terminals. The QR code encodes the full payment URL including the recipient's address, amount, and memo.

### Self-Service QR Codes (Anyone Can Generate)

Anyone can generate and use Hash PayLink QR codes for free — no sign-up, no approval required. Hash PayLink processes payments statelessly — we never hold funds and have no involvement in individual payments.

### Branded QR Codes (For Merchants & Organizations)

For businesses that need **credibility, trust, and a professional presentation** — restaurants, retail shops, event organizers, universities — Hash PayLink offers a **branded QR code service**.

**How it works:**
1. Email us at [support@hashpaylink.com](mailto:support@hashpaylink.com) with:
   - Your business/organization name
   - Up to 3 wallet addresses (EVM, Solana, Starknet — your choice)
   - The chain(s) you want to accept payments on
   - Your preferred memo (e.g. "Village Chief Restaurant")
2. Hash PayLink generates a **custom branded QR code** in our glass-card design, with your business name as the memo and "Scan to pay in USDC" as the instruction.
3. We email you the branded QR code **and** the organizer dashboard URL so you can monitor all payments made to your wallet in real time.

**What you get:**
- Glass-branded Hash PayLink QR code with your business name
- Memo pre-filled: e.g. `Memo: Village Chief Restaurant`
- Dashboard URL for live payment tracking — no login required
- Multi-chain support (payer chooses Base, Solana, Starknet, etc.)

> **Think of it as distributing contactless POS terminals and ATM cards to merchants — except it's a QR code, it never expires, works globally, accepts USDC, and requires no hardware.**

**Why branded QR codes matter:**
- Customers scanning a QR code at a restaurant want to see a professional, recognizable label — not a random URL
- Branded QR codes signal legitimacy and trust, the same way a bank card logo does on a physical terminal
- Once printed and laminated on a table or counter, payments come in automatically — no staff action needed
- The organizer dashboard URL gives you a permanent window into all incoming payments, self-served

> **Note:** Anyone can create their own Hash PayLink QR code independently. The branded service is for organizations that want the credibility and recognition of a registered Hash PayLink identity.

---

## Local Currency FX Display

Available exclusively on **Multi-Payer Collection** links. Organisers can enable a live local currency equivalent shown directly on the payer's payment card — building trust and removing mental conversion friction for customers who think in their home currency.

### Supported Currencies

| Code | Symbol | Country / Region |
|---|---|---|
| **NGN** | ₦ | Nigeria |
| **GHS** | ₵ | Ghana |
| **KES** | KSh | Kenya |
| **SGD** | S$ | Singapore |

### How It Works

**Organiser (link creation):**
1. Toggle **Multi-payer Collection** ON
2. A "Local Currency Display" section appears — toggle it ON
3. Choose currency (NGN / GHS / KES / SGD)
4. Choose rate source:
   - **Live (Fixer.io)** — fetches the current market rate automatically, cached for 10 minutes
   - **Custom / Street** — organiser enters their own rate (e.g. a parallel market rate) — baked into the link, no API dependency
5. Generate → all FX settings are embedded in the payment URL

**Payer (payment card):**

Below the USDC amount, a single subtle line appears:
```
≈ 17,800 ₦  ·  1 USDC = 1,780 NGN  ↻
```
The `↻` icon manually refreshes the rate (live mode). A thin banner reads:
```
Pricing in USDC · Shown in Nigerian Naira at live market rates
```

### Currency Swap (Flexible Amount Mode)

When the organiser has enabled both **Flexible Amount** and **FX Display**, the payer gets a swap toggle on the input:

```
    ENTER AMOUNT
    [ 0.00 ]  USDC
    ⇄ Switch to NGN
```

Tapping the swap button flips the input to local currency:

```
    ENTER AMOUNT
    [ 5,000 ]  ₦
    ⇄ Switch to USDC
    You will pay ≈ 2.98 USDC
```

The payment always settles in USDC — the local currency input is converted at the live rate before the transaction is submitted.

### Custom / Street Rate

For markets where the official exchange rate differs significantly from real purchasing power (e.g. Nigeria's parallel market), organisers can enter their own rate:

- Type `1780` as the custom NGN/USDC rate
- This rate is baked permanently into the payment link URL
- No Fixer.io API key required — works fully offline/standalone
- Regenerate the link if the rate shifts significantly

### Setup (Live Rate Mode)

Add your Fixer.io API key to your server environment:

```env
FIXER_API_KEY=your_fixer_api_key
```

Free plan (100 req/month) is sufficient for low-volume events with 10-minute caching. Custom rate mode requires no API key.

---

## Dark Mode

Hash PayLink ships with a full **dark / light mode toggle** accessible from the header on every page.

- **Default:** follows your operating system's color scheme preference (`prefers-color-scheme`)
- **Toggle:** Sun/Moon button in the top-right header
- **Persistence:** preference saved to `localStorage` — stays between sessions
- **Coverage:** all pages, all cards, all chain-specific gradients, inputs, badges, error states, success cards, and the RainbowKit wallet modal

Both modes are fully production-quality — the dark theme uses a three-level surface hierarchy (`#121212` page / `#1e1e1e` cards / `#252525` inputs) with proper contrast across every UI element.

---

## Organizer Dashboard

The organizer dashboard is a **live, shareable payment monitoring page** — no login, no account required. It auto-refreshes in real time as payments arrive.

**URL format:**
```
https://hashpaylink.com/event?id=YOUR_EVENT_ID&e=0xYour...&a=10
```

**Dashboard shows:**
- Event name and payment amount (or "Flexible" for flex links)
- Chain(s) being monitored
- Live payment log: name, chain badge, amount (actual received), transaction hash, timestamp
- Running total of payments collected
- CSV export button
- QR code for the payment link

**Multi-chain monitoring:** the dashboard watches all configured chains simultaneously — a Base payment and a Solana payment to the same event both appear in the same live feed.

**Actual amount logging:** the dashboard logs the exact USDC/HSK received on-chain — not the URL-requested amount. If a payer sends 2 USDC on a 5 USDC link, the dashboard shows 2 USDC, not 5.

---

## Security — Where Hash PayLink Wins

### Non-Custodial by Design

Hash PayLink **never holds funds at any point**. Payments go directly from payer to recipient (or via transparent on-chain contracts). Even in the Send via Address flow, the CREATE2 vault exists only for seconds before the relayer sweeps it — and the relayer is an immutable contract, not a human intermediary.

### Trustless Smart Contracts

The `PayLinkFactoryV2` contract enforces:
- `onlyRelayer` — only the registered Hash PayLink relayer can trigger a relay
- `MAX_GAS_REIMB` cap (1.00 USDC) — relayer cannot overcharge gas reimbursement
- CREATE2 collision guard — attempting to relay the same `linkId` twice reverts at the contract level (double-spend impossible)
- All fee splits are deterministic and transparent — `recipient_amount = total - fee - gas_reimb`

### Private Key Security

- `RELAYER_PRIVATE_KEY` is stored exclusively as a server-side environment variable (Render/Vercel secrets)
- It is **never prefixed `NEXT_PUBLIC_` or `VITE_`** — it can never reach the browser
- The relayer key is used only inside API route handlers, isolated per request
- Starknet and Solana each have their own dedicated relayer keys (`RELAYER_PRIVATE_KEY_STARKNET`, `RELAYER_PRIVATE_KEY_SOLANA`) — chain-isolated

### EIP-712 Typed Signatures

All gasless operations on EVM chains use structured **EIP-712 typed data** — not raw `eth_sign` or `personal_sign`. The payer's wallet displays the exact permit parameters (spender, amount, deadline) before signing. Nothing is hidden.

### No Backend Required for Validation

Payment validity is enforced on-chain. Hash PayLink's backend is a **relay layer only** — it cannot steal funds, cannot forge signatures, and cannot prevent a payer from paying directly to a recipient address.

### Open Source

The complete payment logic is open for audit: [`src/pages/PaymentPage.tsx`](src/pages/PaymentPage.tsx), [`api/relay-v2.ts`](api/relay-v2.ts), [`api/relay-solana.ts`](api/relay-solana.ts).

### Underpayment Protection

The payer-facing success card and organizer dashboard always reflect the **actual on-chain received amount**, not the URL-requested amount. Partial and underpayments are clearly flagged — protecting merchants from silent revenue discrepancies.

---

## Base App Store

Hash PayLink is **live on the Base App Store** with Base Builder Code attribution integrated.

- **App ID:** `69f5ac9d7a671bc641dfdc70`
- **Builder Code:** `bc_8qtb7tny` (ERC-8021)
- Every Base Mainnet transaction appends the builder code to calldata — enabling Base to attribute onchain volume and qualifying Hash PayLink for Base builder incentive programs

---

## Real-World Use Cases

Hash PayLink is already powering use cases across five categories:

### Retail & Hospitality
- **Restaurants** — laminated QR code on tables. Customer scans, pays in USDC. Merchant receives notification on their dashboard in under 3 seconds. No POS hardware, no payment processor contract.
- **Coffee shops & cafes** — flexible amount QR code at the counter. Customer enters their bill total, pays.
- **Market stalls & pop-ups** — a QR code on the phone screen is the entire payment terminal.
- **Hotels & Airbnb** — payment link in the booking confirmation email. Guest pays in advance in USDC.

### Freelance & Professional Services
- **Developers, designers, writers** — generate a link per invoice. Share in any email, Telegram, or X DM. Client pays from any chain.
- **Consulting & agencies** — invoice with a payment link embedded. No bank account or Stripe setup required.
- **Cross-border contractors** — the link works globally. No currency conversion, no wire fee, no SWIFT delay.

### Events & Organizations
- **Conference registrations** — event mode link tracks every attendee's payment with their name. Organizer exports CSV at the end.
- **School & university fee collection** — semester fees, exam registration, activity dues.
- **Sports clubs** — membership fees, tournament registrations, kit payments.
- **Churches & nonprofits** — tithe, donations, fundraising campaigns with live tracking.
- **DAOs & Web3 communities** — contributor payments, grant disbursements, on-chain receipts.

### Digital & Creator Economy
- **Newsletter & content creators** — paid subscription links. Send once, pay forever — no renewal system needed.
- **Musicians & artists** — tip jars, merch payments, exclusive content access.
- **Educators** — course registration, tutoring sessions, workshop fees.
- **Gaming projects** — in-game purchases, tournament entry fees, NFT mint payments.

### Business & Enterprise
- **E-commerce** — add a "Pay with USDC" button to any product page using `<PayLinkButton>`. No payment processor contract.
- **SaaS** — subscription billing without a merchant account. One component, five chains.
- **Payroll** — combine with StreamPay for streaming salary disbursement.
- **Inter-company settlements** — stateless invoicing between Web3 companies with on-chain proof of payment.

---

## Hash PayLink SDK — Plug and Play

The Hash PayLink SDK gives any developer a **drop-in payment layer for their platform** — the same way Stripe provides a payment button, but for USDC across five blockchains.

### Installation

```bash
npm install @hashpaylink/sdk
# or
yarn add @hashpaylink/sdk
# or
pnpm add @hashpaylink/sdk
```

### One-Liner Checkout (Zero Config)

No wallet providers. No wagmi. No RainbowKit. Hash PayLink hosts the entire checkout experience.

```tsx
import { PayLinkButton } from '@hashpaylink/sdk'

export default function Checkout() {
  return (
    <PayLinkButton
      recipientEVM="0xYourEVMAddress"
      recipientSolana="YourSolanaAddress"
      amount="10"
      memo="Invoice #001"
      onPaymentSuccess={({ txHash, chain }) => {
        console.log('Paid!', txHash, 'on', chain)
        // Update your database, unlock content, send receipt, etc.
      }}
    />
  )
}
```

**What the payer sees when they click the button:**

A full Hash PayLink checkout page opens in a new tab showing:
1. A chain selector with pills for Base, HashKey, Starknet, Arc, and Solana
2. The payment amount in large type with the asset label
3. The memo as a badge
4. "Connect Wallet" or "Send via Address" toggle
5. A pay button branded to the selected chain
6. Full-screen success card after payment with transaction hash

The checkout UI is fully branded as Hash PayLink — clean, professional, and mobile-optimized.

### Full Props Reference

```tsx
<PayLinkButton
  recipientEVM="0x..."           // EVM address (Base · HashKey · Arc)
  recipientStark="0x..."         // Starknet address (0x + 64 hex)
  recipientSolana="..."          // Solana base58 address
  amount="25"                    // Fixed payment amount ("25" = 25 USDC)
  memo="Invoice #042"            // On-chain memo (≤100 chars)
  flex={false}                   // true = payer enters amount at checkout
  multiChain={true}              // true = show all chains with addresses
  platformFeeBps={20}            // Default: 20 (0.2%). Set 0 to disable.
  hosted={true}                  // true = new tab checkout (default, zero config)
                                 // false = inline widget (requires wagmi setup)
  label="Pay with Crypto"        // Custom button label
  onPaymentSuccess={(params) => {
    const { txHash, chain, amount, asset, platformFee, timestamp } = params
    // Fires after on-chain confirmation
  }}
  onPaymentError={(error) => {
    console.error(error.message)
  }}
/>
```

### Inline Widget Mode

Embeds the full payment UI directly inside your page — no new tab. Requires wagmi + provider setup.

```tsx
// 1. Set up providers (once, in your app root)
import { WagmiProvider } from 'wagmi'
import { RainbowKitProvider } from '@rainbow-me/rainbowkit'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { StarknetProvider } from '@hashpaylink/sdk/starknet'

export function Providers({ children }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={new QueryClient()}>
        <RainbowKitProvider>
          <StarknetProvider>{children}</StarknetProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}

// 2. Drop the inline widget wherever you need it
import { PayLinkButton } from '@hashpaylink/sdk'

export default function ProductPage({ product }) {
  return (
    <PayLinkButton
      recipientEVM={process.env.NEXT_PUBLIC_TREASURY_EVM}
      recipientSolana={process.env.NEXT_PUBLIC_TREASURY_SOLANA}
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

### The Widget UI (Inline Mode)

When `hosted={false}`, a self-contained card is rendered inline with:

```
┌─────────────────────────────────┐
│      PAYMENT REQUEST            │
│   25.00  USDC · HSK             │
│   "Invoice #042"                │
├─────────────────────────────────┤
│  ● Base  ● HashKey  ● Arc       │
│  ● Starknet  ● Solana           │
├─────────────────────────────────┤
│  Includes 0.2% platform fee     │
│                                 │
│  ⚡ Pay 25 USDC  ↗              │
│                                 │
│  Powered by Hash PayLink SDK    │
│  Non-custodial                  │
└─────────────────────────────────┘
```

Clicking the button in inline mode opens the hosted checkout — the inline widget is the integration surface, the checkout is handled by Hash PayLink's infrastructure.

### How It Syncs with Your Platform (Like Stripe)

```
Your platform          Hash PayLink
─────────────          ─────────────────────────────
User clicks "Pay"  →   Hosted checkout opens in new tab
                        Payer selects chain
                        Payer connects wallet or uses address
                        Payment confirmed on-chain (< 3 seconds)
                   ←   onPaymentSuccess({ txHash, chain, amount })
Your backend           ↓
receives callback  →   Verify txHash on-chain
                   →   Mark order paid, send receipt, unlock content
```

The integration is designed to be **modular** — Hash PayLink handles all wallet UX, gas sponsorship, chain switching, and confirmation logic. Your platform only sees the callback.

### URL-Based Integration (No SDK Required)

For platforms that can't install npm packages, embed a direct link:

```
https://hashpaylink.com/pay?e=0xYour...&s=YourSolana...&a=25&m=Invoice+042
```

**Full URL parameter reference:**

| Param | Description | Example |
|---|---|---|
| `evm` | EVM recipient (Base · HashKey · Arc) | `0xAbCd…` |
| `stark` | Starknet recipient | `0x04a3…` (64 hex) |
| `sol` | Solana recipient | `YourBase58Address` |
| `amt` | Fixed amount | `10` |
| `flex` | Flexible amount mode | `1` |
| `memo` | On-chain memo | `Coffee` |
| `net` | Lock to one chain | `base` · `arc` · `hashkey` · `starknet` · `solana` |
| `multi` | Multi-chain mode | `1` |
| `event` | Event/multi-payer mode | `1` |
| `id` | Event ID | `abc123…` |

---

## Fee Engine

Hash PayLink charges a **0.2% platform fee** (20 bps) on every transaction. Sponsored EVM payments can also include a configured USDC gas recovery amount routed to treasury in the same settlement transaction.

```
User pays:        10.00 USDC
Platform fee:      0.02 USDC  (0.2%)
Recipient gets:    9.98 USDC before any sponsored gas recovery
```

The fee is collected **atomically in the same transaction** — there is no separate fee transfer, no trust required. Defaults: Base sponsored payments recover 0.01 USDC, and Arbitrum sponsored payments recover 0.03 USDC, capped so tiny payments still leave a recipient amount.

### DefiLlama Fee Analytics

Hash PayLink has a merged DefiLlama fees adapter: [DefiLlama/dimension-adapters#6932](https://github.com/DefiLlama/dimension-adapters/pull/6932). The adapter tracks USDC transfers received by the Hash PayLink EVM treasury on Base and Arbitrum from `2026-05-01` onward.

Reported metrics:
- `dailyFees`
- `dailyUserFees`
- `dailyRevenue`
- `dailyProtocolRevenue`

Hash PayLink remains stateless and non-custodial: this is fee/revenue analytics only, not TVL. Solana and Starknet treasury tracking are planned follow-up adapter updates once their data sources can run cleanly in DefiLlama CI.

---

## Real-Time Payment Detection

- **Base & Arc (wallet):** `watchContractEvent` on the USDC ERC-20 contract, 2-second polling, detects in under 3 seconds
- **Base & Arc (vault):** balance polling on the CREATE2 vault address every 3 seconds
- **HashKey:** native HSK balance polling every 2 seconds
- **Starknet:** `starknet_getTransactionReceipt` polling until `ACCEPTED_ON_L2`
- **Solana (wallet):** transaction confirmed via `confirmTransaction` with blockhash commitment
- **Solana (vault):** ATA balance polling every 3 seconds via `/api/solana-sweep`

---

## Folder Structure

```
src/
├── lib/
│   ├── chains.ts              ← ChainKey, CHAIN_META, PLATFORM_FEE_BPS
│   ├── wagmi.ts               ← wagmiConfig
│   ├── router.ts              ← EVM clients + PayLinkFactoryV2 ABI constants
│   ├── utils.ts               ← encodeErc20Transfer, fee helpers, formatAmount
│   ├── StarknetContext.tsx    ← Global Starknet wallet state (ArgentX/Braavos)
│   └── SolanaContext.tsx      ← Global Solana wallet state (Phantom/Solflare/Backpack)
│
├── pages/
│   ├── CreateLink.tsx         ← Link generator — all options, QR download
│   ├── PaymentPage.tsx        ← Full payment checkout (all 5 chains)
│   ├── EventDashboard.tsx     ← Live multi-payer organizer dashboard
│   └── Dashboard.tsx          ← Single-wallet payment history
│
├── Layout.tsx                 ← Sticky header, 5-chain network switcher,
│                                 dark/light toggle, Hash Assistant chat
│
api/
├── relay-v2.ts                ← EVM Direct Send relay (Base + Arc)
├── relay-solana.ts            ← Solana gasless relay + vault sweep
├── event-register.ts          ← Multi-payer event log
└── tx-status.ts               ← Hash Assistant tx lookup

contracts/
├── PayLinkFactoryV2.sol       ← CREATE2 vault factory + relay logic
└── PaymentRouter*.sol         ← Archived legacy router contracts

packages/
└── sdk/                       ← @hashpaylink/sdk public package
```

---

## Contributing & Local Development

```bash
git clone https://github.com/Cyano88/hashkey-paylink
cd hashkey-paylink
npm install
npm run dev       # http://localhost:5173 (Vite frontend)
npm run server    # http://localhost:3001 (Express API)
```

**Required environment variables for full functionality:**

```env
RELAYER_PRIVATE_KEY=              # Base/Arc EVM relay key
RELAYER_PRIVATE_KEY_ARC=          # Arc-specific relay key (optional, falls back to above)
RELAYER_PRIVATE_KEY_SOLANA=       # Solana relay key (base58, JSON array, or base64)
PRIVATE_RPC_URL=                  # Private Alchemy/QuickNode RPC (Base)
PRIVATE_RPC_URL_ARC=              # Private Arc RPC
SOLANA_RPC_URL=                   # Private QuickNode Solana RPC
PAYLINK_FACTORY_V2=               # PayLinkFactoryV2 contract address (Base)
PAYLINK_FACTORY_V2_ARC=           # PayLinkFactoryV2 contract address (Arc)
TREASURY_ADDRESS=                 # EVM treasury cold wallet
ADMIN_SECRET=                     # Long random secret for protected maintenance endpoints
CRON_SECRET=                      # Optional long random secret for cron/maintenance calls
SOLANA_TREASURY=                  # Solana treasury wallet address
```

PRs welcome. Open an issue first for large changes.

---

## Pricing

| Tier | Fee | Includes |
|---|---|---|
| **Standard** | Platform fee per tx | All 5 chains, hosted checkout, real-time detection, gasless relay, organizer dashboard |
| **Branded QR** | Free (email request) | Custom branded QR code + dashboard URL for merchants |
| **Enterprise** | Contact us | Whitelabel UI, custom domain, priority support, custom fee structure |

---

## Support & Contact

- **Email:** [support@hashpaylink.com](mailto:support@hashpaylink.com)
- **X / Twitter:** [@Hash_PayLink](https://x.com/Hash_PayLink)
- **Branded QR Code requests:** email us with your business name, wallet addresses, and preferred chains

For branded QR code requests, please include:
1. Business/organization name
2. Up to 3 wallet addresses (EVM, Solana, Starknet)
3. Preferred payment chains
4. Any specific memo text you want on the QR

We'll respond within 24 hours with your branded QR code and dashboard URL.

---

---

## 0G Storage Integration — Decentralized Payment Archive

Hash PayLink integrates [0G decentralized storage](https://0g.ai) to permanently archive every payment record made through multi-payer collection links. Payment proofs are stored on 0G Storage and anchored on-chain via the `PayLinkArchive` smart contract deployed on 0G Mainnet (Chain ID 16661).

### What 0G Powers Across Hash PayLink

0G is not a passive backup. It is the shared proof substrate used across the Hash PayLink product suite:

1. **Permanent payment memory** — every supported payment chain can feed into one durable proof layer, so a Base, Arbitrum, Solana, Starknet, Arc, or HashKey payment can be represented as a normalized 0G archive record.
2. **Trustless agent access** — AI agents do not need Hash PayLink sessions or private databases. They can check `PayLinkArchive` on 0G Mainnet and unlock only after a payer is verified.
3. **Cross-product receipts** — collection payments, AI access payments, and future StreamPay/PoA settlement records can share the same root-hash plus on-chain-anchor pattern.
4. **Audit-ready dashboards** — organizers and creators can export or show a public 0G proof instead of asking users to trust a private dashboard row.
5. **Composable developer primitive** — any external agent can use `/api/agent-verify` or query 0G directly to build pay-per-use AI, paid APIs, course tutors, event assistants, or creator unlocks.

For the 0G APAC Hackathon, Hash PayLink demonstrates 0G Storage, 0G Chain, and an agent-verification pattern in one user flow:

```
Telegram or web request
  -> Hash PayLink creates a USDC PayLink
  -> payer completes payment on any supported chain
  -> payment JSON is uploaded to 0G Storage
  -> root hash is anchored on 0G Mainnet through PayLinkArchive
  -> AI agent calls /api/agent-verify
  -> verified answer/content/access is returned with a 0G proof link
```

### Why 0G Storage

The current Web3 payment landscape has a silent problem: payment records live on centralized servers. If the server goes down, the payment history disappears — even though the on-chain transaction is permanent.

Hash PayLink solves this with 0G Storage. Every payment in a multi-payer collection is:

1. **Uploaded as a JSON record** to 0G decentralized storage (content-addressed, permanent)
2. **Anchored on-chain** via `PayLinkArchive.sol` on 0G Mainnet — creating an immutable, verifiable proof

The organizer's payment dashboard is the last server that needs to exist. The records live forever on 0G regardless.

---

### PayLinkArchive Contract

| | |
|---|---|
| **Contract** | `PayLinkArchive.sol` |
| **Network** | 0G Mainnet (Chain ID 16661) |
| **Address** | [`0x79a804C49e1E5EBC279A228Ab73a7570A0D0819a`](https://chainscan.0g.ai/address/0x79a804C49e1E5EBC279A228Ab73a7570A0D0819a) |
| **All archived payments** | [View on 0G Explorer →](https://chainscan.0g.ai/address/0x79a804C49e1E5EBC279A228Ab73a7570A0D0819a#events) |

---

### How It Works

```
Payer completes payment on Hash PayLink
          │
          ▼
Server logs payment (primary — instant)
          │
          ▼  (background, non-blocking)
Payment JSON uploaded to 0G Storage
  {
    "eventId":    "evt_abc123",
    "txHash":     "0xabc...",
    "chain":      "base",
    "payer":      "Alice",
    "amount":     "10.00",
    "ts":         1746614523394,
    "archivedBy": "Hash PayLink",
    "version":    "1"
  }
          │
          ▼
Root hash (content address) anchored on 0G Mainnet
  PayLinkArchive.archive(eventId, rootHash, chain, payer, amount, ts)
          │
          ▼
PaymentArchived event emitted → permanent, verifiable, censorship-resistant
```

---

### How to Verify a Payment

Anyone can independently verify a Hash PayLink payment record:

**Step 1 — Find the on-chain anchor**

Go to the [PayLinkArchive events page](https://chainscan.0g.ai/address/0x79a804C49e1E5EBC279A228Ab73a7570A0D0819a#events) and find the `PaymentArchived` event for the payment you want to verify. Each event contains:
- `eventId` — the Hash PayLink collection identifier
- `rootHash` — the 0G Storage content address of the payment JSON
- `chain`, `payer`, `amount`, `ts` — payment metadata

**Step 2 — Fetch the JSON from 0G Storage**

Using the 0G TypeScript SDK:

```typescript
import { Indexer } from '@0gfoundation/0g-ts-sdk'

const indexer = new Indexer('https://indexer-storage-turbo.0g.ai')
await indexer.download(rootHash, './payment-record.json', true) // true = verify merkle proof
```

**Step 3 — Cross-check with the payment chain**

The JSON contains the original `txHash`. Verify it exists on the payment chain's explorer (Basescan, Arbiscan, Solscan, etc.).

---

### Organizer Dashboard — 0G Archive Indicator

The organizer dashboard shows a live archive status for every payment:

| Badge | Meaning |
|---|---|
| Grey `0G` | Upload in progress (~30–60 seconds) |
| Purple `0G` (clickable) | Archived and anchored — links to the on-chain proof |

A footer counter shows how many payments in the event have been successfully archived:

```
[0G]  Payment records permanently archived on 0G decentralized storage — 5/5 archived
```

---

### Product-by-Product 0G Usage

| Product | 0G role | Demo proof |
|---|---|---|
| **Hash PayLink checkout** | Normalizes confirmed payments into archive records containing event ID, payer, chain, amount, tx hash, and timestamp. | Pay any multi-payer collection and watch the dashboard badge move from pending to archived. |
| **Multi-Payer Dashboard** | Displays 0G archive state per payer and links to the 0G Chain transaction that anchored the proof. | Open `/event?id=...` or `/dashboard?id=...` after payment. |
| **Access Mode** | Converts a payment into reusable access credentials for AI agents, APIs, and gated content. | Use an access link, then call `/api/agent-verify`. |
| **Built-in AI Access** | `/api/agent-ask` refuses unpaid users and answers only after payment is verified from 0G. | `POST /api/agent-ask` with a verified event ID and payer name. |
| **Photon Telegram Agent** | Telegram commands create paid AI requests, then `/answer payer-name` checks the same 0G proof path before returning the answer. | `/askpaid ...`, pay, then `/answer your-name`. |
| **StreamPay and Creator PoA** | Stream and attention settlement records are designed to become 0G-verifiable receipts using the same archive pattern. | Current StreamPay demo shows Arc streams; the repository documents the 0G extension path. |

This makes the architecture bigger than a payment app: Hash PayLink is a payment execution layer, while 0G is the durable agent memory layer.

---

## Agentic Economy Primitives

The 0G Storage integration unlocks a new capability: **trustless payment verification for AI agents**.

Any AI service can call the Hash PayLink verification API and confirm a payment was made — without trusting any centralized server. The proof comes directly from the `PayLinkArchive` contract on 0G Mainnet. No database. No session. No intermediary.

---

### `GET /api/agent-verify` — Trustless Payment Proof

```bash
curl "https://hashpaylink.com/api/agent-verify?eventId=evt_abc123&payer=Alice"
```

**Verified (200):**
```json
{
  "verified": true,
  "payment": { "payer": "Alice", "chain": "base", "amount": "10.00", "ts": 1746614523394 },
  "proof": {
    "ogTxHash":   "0xbd97e81f...",
    "ogExplorer": "https://chainscan.0g.ai/tx/0xbd97e81f...",
    "rootHash":   "0x3078...",
    "contract":   "0x79a804C49e1E5EBC279A228Ab73a7570A0D0819a",
    "network":    "0G Mainnet (Chain ID 16661)"
  }
}
```

**Not verified (402):**
```json
{
  "verified": false,
  "error": "No verified payment found for this payer on 0G Storage",
  "hint":  "Payment may still be archiving (~30–60s after confirmation)"
}
```

---

### `POST /api/agent-ask` — Payment-Gated AI Service Demo

```bash
curl -X POST https://hashpaylink.com/api/agent-ask \
  -H "Content-Type: application/json" \
  -d '{ "eventId": "evt_abc123", "payer": "Alice", "question": "Your question here" }'
```

**Paid payer:**
```json
{
  "answer": "...",
  "paymentVerified": true,
  "payment": { "payer": "Alice", "chain": "base", "amount": "10.00" },
  "proof":   { "ogTxHash": "0xbd97...", "ogExplorer": "https://chainscan.0g.ai/tx/..." }
}
```

**Unpaid payer (402):**
```json
{
  "error": "Payment required",
  "paymentRequired": true,
  "paymentLink": "https://hashpaylink.com/pay?v=1&id=evt_abc123"
}
```

---

### Integrating Into Your Own AI Agent

Imagine you run an online graphic design course. Normally, you'd need a payment processor, a user database, a login system, and backend logic to check who has paid before showing them content. With Hash PayLink + 0G, you need **none of that**.

Here is what you actually need:

---

#### What you need (the full list)

| What | Where you get it | Time |
|---|---|---|
| A payment event | Create one on [hashpaylink.com](https://hashpaylink.com) — takes 30 seconds | 30 seconds |
| A payment link | Generated automatically when you create the event | Instant |
| One API call | `GET /api/agent-verify` — check if a person has paid | 5 minutes to add |
| A system prompt | Tell the AI what it's teaching / selling | 10 minutes to write |

That's it. No database. No login system. No payment processor contract.

---

#### How it works in plain English

1. **You create a payment event** on hashpaylink.com. You get an `eventId` and a payment link like `https://hashpaylink.com/pay?v=1&id=your-event-id&a=50&e=0xYourWallet`. This is your paywall.

2. **Your customer pays.** They open the link, type their name, pick a chain (Base, Solana, Starknet, Arc, or Arbitrum), and pay in USDC. Zero gas. No app needed.

3. **Hash PayLink archives the payment to 0G decentralized storage** automatically. A permanent, tamper-proof proof of the payment is anchored on 0G Mainnet. Nobody can fake or delete this.

4. **Your AI checks before answering.** Every time your AI receives a question, it calls `/api/agent-verify` with the event ID and the customer's name. If verified → answer. If not → send them to the payment link.

5. **Revenue accrues to your wallet.** Payments go directly to the wallet address you set when creating the event. No intermediary holds your funds.

---

#### Two ways to integrate

**Path A — Use Hash PayLink's hosted API (fastest, no infrastructure needed)**

You call one HTTPS endpoint that Hash PayLink runs. No code to deploy, no 0G setup, no contract interaction. Just an HTTP call from your existing backend.

```
GET https://hashpaylink.com/api/agent-verify?eventId=YOUR_EVENT_ID&payer=CUSTOMER_NAME
```

Returns `{ "verified": true }` or `{ "verified": false }`. Add this check anywhere in your AI service — one line in any language.

**This is the right path if:** you already have an AI service and want to add a payment gate in under an hour.

---

**Path B — Query 0G Mainnet directly (maximum independence)**

You copy the verification logic and run it yourself. Your server talks directly to the `PayLinkArchive` contract on 0G Mainnet — completely bypassing Hash PayLink's server. Even if hashpaylink.com goes offline, your payment gate still works forever.

See **Pattern 3** below for the exact code. You need no API key, no account — just an RPC connection to 0G Mainnet (`https://evmrpc.0g.ai`), which is free and public.

**This is the right path if:** you need zero dependency on any third-party server, or you want to self-host the entire verification stack.

---

#### Step-by-step: Build a payment-gated AI for your graphic design course

```
Step 1 — Create a payment event
  Go to hashpaylink.com → toggle "Multi-payer Collection" → set amount (e.g. $50)
  → enter your wallet address → Generate → copy your eventId

Step 2 — Share the payment link with your students
  https://hashpaylink.com/pay?v=1&id=YOUR_EVENT_ID&a=50&e=0xYourWallet
  Put this link on your website, in your emails, or as a QR code

Step 3 — Add the payment check to your AI backend
  Before your AI responds, call:
  GET https://hashpaylink.com/api/agent-verify?eventId=YOUR_EVENT_ID&payer=STUDENT_NAME
  → verified: true  →  serve the lesson
  → verified: false →  "Please pay first: [link]"

Step 4 — Write your system prompt
  system: "You are a graphic design tutor. You teach logo design, color theory,
           and Adobe Illustrator. Access granted to ${payerName} who paid ${amount}.
           Only answer questions about the course material."

Done. Your AI now earns revenue 24/7 without you doing anything.
```

The student's name they type on the payment page is the same name they give your AI. That name-to-payment lookup is what `/api/agent-verify` does — checked against an immutable on-chain record.

---

Any developer can add Hash PayLink payment verification to their AI service in minutes. The verification queries 0G Mainnet directly — no API key, no account, no trust required.

#### Pattern 1 — HTTP check before serving (any language)

```typescript
// Node.js / TypeScript
async function serveWithPaymentGate(eventId: string, payer: string, question: string) {
  const verification = await fetch(
    `https://hashpaylink.com/api/agent-verify?eventId=${eventId}&payer=${encodeURIComponent(payer)}`
  ).then(r => r.json())

  if (!verification.verified) {
    return {
      error: 'Payment required',
      paymentLink: `https://hashpaylink.com/pay?v=1&id=${eventId}`,
    }
  }

  // Payment confirmed on 0G — serve your AI response
  const answer = await yourAiModel.ask(question)
  return { answer, proof: verification.proof }
}
```

```python
# Python
import requests

def serve_with_payment_gate(event_id: str, payer: str, question: str):
    res = requests.get(
        "https://hashpaylink.com/api/agent-verify",
        params={"eventId": event_id, "payer": payer}
    ).json()

    if not res.get("verified"):
        return {
            "error": "Payment required",
            "payment_link": f"https://hashpaylink.com/pay?v=1&id={event_id}"
        }

    # Verified — serve your response
    answer = your_ai_model.ask(question)
    return {"answer": answer, "proof": res["proof"]}
```

#### Pattern 2 — Express middleware

```typescript
import express from 'express'

function requireHashPayLinkPayment(eventId: string) {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const payer = req.body?.payer ?? req.query?.payer as string
    if (!payer) return res.status(400).json({ error: 'payer required' })

    const result = await fetch(
      `https://hashpaylink.com/api/agent-verify?eventId=${eventId}&payer=${encodeURIComponent(payer)}`
    ).then(r => r.json()) as { verified: boolean; proof?: object }

    if (!result.verified) {
      return res.status(402).json({
        error: 'Payment required',
        paymentLink: `https://hashpaylink.com/pay?v=1&id=${eventId}`,
      })
    }

    // Attach proof to request for downstream handlers
    (req as any).paymentProof = result.proof
    next()
  }
}

// Usage — any route protected with one line
app.post('/api/premium-endpoint',
  requireHashPayLinkPayment('your-event-id'),
  async (req, res) => {
    const answer = await yourAiModel.ask(req.body.question)
    res.json({ answer, proof: (req as any).paymentProof })
  }
)
```

#### Pattern 3 — Query 0G Mainnet directly (no Hash PayLink server)

For maximum trustlessness, query `PayLinkArchive` yourself:

```typescript
import { ethers } from 'ethers'

const provider = new ethers.JsonRpcProvider('https://evmrpc.0g.ai')
const contract  = new ethers.Contract(
  '0x79a804C49e1E5EBC279A228Ab73a7570A0D0819a',
  ['event PaymentArchived(string indexed eventId, bytes32 indexed rootHash, string chain, string payer, string amount, uint256 ts)'],
  provider,
)

async function verifyOnChain(eventId: string, payer: string): Promise<boolean> {
  const latest = await provider.getBlockNumber()
  const events = await contract.queryFilter(
    contract.filters.PaymentArchived(eventId),
    latest - 500_000,
    latest,
  )
  return events.some(e => 'args' in e && (e.args[3] as string).toLowerCase() === payer.toLowerCase())
}
```

This pattern requires **zero trust** in Hash PayLink — the verification is purely on-chain, readable by any node connected to 0G Mainnet.

---

### The Full Agentic Economy Flow

```
User wants access to an AI service
          │
          ▼
Developer creates a Hash PayLink multi-payer collection link
  https://hashpaylink.com/pay?v=1&id=your-event-id&a=10&e=0xYour...
          │
          ▼
User pays in USDC (Base, Arc, Starknet, Solana, Arbitrum)
  — zero gas for payer — any chain — no wallet required for Send via Address
          │
          ▼
Payment archived to 0G Storage + anchored on PayLinkArchive (0G Mainnet)
          │
          ▼
AI service calls /api/agent-verify (or queries 0G directly)
          │
     ┌────┴────┐
     │         │
  verified   not verified
     │         │
     ▼         ▼
Service       402 + payment link
responds      (user pays, then retries)
+ proof
```

---

### Clean 0G APAC Demo Flow

Use this sequence for the 3-minute hackathon video:

1. **Open Hash PayLink and create a multi-payer collection**  
   Show amount, memo, recipient wallet, and multi-payer collection enabled. Explain that this creates the payment event ID that 0G will later verify.

2. **Pay the link from one supported chain**  
   Use the fastest available path for the recording: Base, Arbitrum, Solana, or Circle Smart Wallet. The important visual is the payer name entered on the checkout.

3. **Open the organizer dashboard**  
   Show the payer row, amount, chain, transaction hash, and the 0G badge. If the badge is still pending, say archiving is non-blocking and refresh until the explorer link appears.

4. **Click the 0G proof**  
   Open the 0G explorer transaction for `PayLinkArchive`. Show that the payment record is anchored on 0G Mainnet with event ID, root hash, payer, chain, amount, and timestamp.

5. **Verify through the API**  
   Open or show:
   ```bash
   GET https://hashpaylink.com/api/agent-verify?eventId=YOUR_EVENT_ID&payer=YOUR_PAYER_NAME
   ```
   Show `verified: true`, `rootHash`, `ogTxHash`, and the 0G explorer link.

6. **Unlock paid AI access**  
   Use the Photon Telegram flow or `/api/agent-ask`: user asks a paid AI question, pays through Hash PayLink, the agent checks 0G, and only then returns the answer with proof.

7. **Show the ecosystem extension**  
   End on StreamPay and Access Mode: "The same 0G proof layer can verify one-time payments, paid AI access, future streaming receipts, and creator proof-of-attention settlements."

The key line for judges: **Hash PayLink turns any USDC payment into a permanent 0G-backed credential that AI agents can verify before acting.**

---

### Architecture

```
hashkey-paylink/
├── api/
│   ├── og-storage.ts          ← 0G upload + PayLinkArchive anchor
│   ├── event-registry.ts      ← patches ogRootHash/ogTxHash after archive
│   ├── agent-verify.ts        ← trustless payment proof from 0G Mainnet
│   └── agent-ask.ts           ← payment-gated AI service demo
├── contracts/
│   └── contracts/
│       └── PayLinkArchive.sol ← on-chain root hash registry (0G Mainnet)
└── src/pages/
    └── EventDashboard.tsx     ← 0G badge per payment + archive footer
```

### Key Files

| File | Purpose |
|---|---|
| [`api/og-storage.ts`](api/og-storage.ts) | Uploads payment JSON to 0G Storage, anchors root hash on-chain |
| [`api/event-registry.ts`](api/event-registry.ts) | Event payment registry — fires 0G archive after each registration |
| [`api/agent-verify.ts`](api/agent-verify.ts) | Trustless payment verification via 0G Mainnet contract query |
| [`api/agent-ask.ts`](api/agent-ask.ts) | Payment-gated AI service demo — 402 if unpaid, response + proof if verified |
| [`contracts/contracts/PayLinkArchive.sol`](contracts/contracts/PayLinkArchive.sol) | On-chain root hash registry deployed on 0G Mainnet |
| [`contracts/scripts/deploy-og-archive.ts`](contracts/scripts/deploy-og-archive.ts) | Hardhat deploy script for 0G Mainnet |

### Environment Variables

```env
OG_STORAGE_KEY=       # Private key of wallet holding OG tokens (gas for uploads)
OG_ARCHIVE_ADDRESS=   # PayLinkArchive contract: 0x79a804C49e1E5EBC279A228Ab73a7570A0D0819a
```

---

## License

MIT © 2026 Hash PayLink Contributors

*Live on [Base App Store](https://base.org/ecosystem) · Built on [Base](https://basescan.org) · [Arbitrum](https://arbiscan.io) · [Starknet](https://starkscan.co) · [Arc Economic OS](https://arc.fun) · [Solana](https://solscan.io) · [0G Storage](https://chainscan.0g.ai/address/0x79a804C49e1E5EBC279A228Ab73a7570A0D0819a)*
