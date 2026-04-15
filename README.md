# HashKey PayLink

> **One-Sentence Pitch:** HashKey PayLink turns any wallet address into a shareable payment URL so anyone can request or receive HSK on HashKey Chain — no backend, no signup, no app download.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Cyano88/hashkey-paylink)

---

## The Problem We're Solving

Crypto payments in emerging markets — especially across Africa — are broken. Sending money today requires:
- Knowing the sender's full wallet address
- Both parties being on the same app
- Technical onboarding that most people can't navigate

**The result:** Web3 payments never reach the people who need them most.

---

## Our Solution

HashKey PayLink is a **stateless, link-based payment request system** built on HashKey Testnet.

**Creator flow:** Enter a wallet address + amount + optional memo → get a shareable link in seconds.  
**Payer flow:** Open the link → connect wallet → auto-switch to HashKey Testnet → confirm in one click.

The memo is encoded as UTF-8 hex in the transaction `data` field — permanently on-chain and visible in the explorer.

**This is PayFi in its purest form: permissionless, trustless, and instant.**

---

## Why This Matters — The Real-World Case

### Our First Partner: DashSend

We are already gearing up to integrate HashKey PayLink with **DashSend**, a fast-growing logistics and delivery service operating across **Nigerian university campuses**.

DashSend riders currently deal with:
- Cash payments that get lost or disputed
- USSD bank transfers that fail under network load
- No verifiable proof of payment at delivery

**With HashKey PayLink, a DashSend rider generates a payment link per delivery.** The customer opens it, pays in HSK, and the on-chain receipt acts as irrefutable proof of payment — no disputes, no chargebacks, no intermediaries.

### The Bigger Picture

DashSend is the proof of concept. The roadmap is deliberate and expanding:

```
Phase 1 (Now)     →  DashSend pilot — Nigerian university campuses
Phase 2 (Q3 2025) →  5 campus logistics partners across Nigeria & Ghana
Phase 3 (Q4 2025) →  Kenya, South Africa, Senegal
Phase 4 (2026+)   →  Global — any merchant, anywhere, any use case
```

> *One step at a time — prove it works locally, then expand relentlessly.*

Africa is not a test market. It **is** the market. 600M+ unbanked adults, a mobile-first population, and remittance fees eating 8–12% per transfer. HashKey PayLink is built for this reality.

---

## Features

| Feature | Detail |
|---|---|
| Link generator | Produces `/pay?to=&amt=&memo=` URL — zero server, zero DB |
| Auto network switch | Detects wrong chain, prompts switch to HashKey Testnet (Chain 133) |
| On-chain memo | Memo encoded as hex in tx `data`, readable in explorer |
| Live tx tracking | Pending hash + explorer link shown while confirming |
| Success receipt | Full receipt with tx details + one-click explorer button |
| Apple-style UI | Inter font, frosted header, card shadows, smooth animations |
| Mobile responsive | Works on all screen sizes — critical for mobile-first markets |
| Zero backend | No server, no database, no API keys required |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite 5 + TypeScript |
| Styling | Tailwind CSS v3 + custom keyframe animations |
| Web3 | Wagmi v2 + Viem v2 + RainbowKit v2 |
| Blockchain | HashKey Testnet (Chain ID: 133) |
| RPC | `https://testnet.hsk.xyz` |
| Explorer | `https://testnet-explorer.hsk.xyz` |
| Deployment | Vercel |

---

## For Judges: Quick Test Guide

### Step 1 — Add HashKey Testnet to MetaMask

| Field | Value |
|---|---|
| Network Name | HashKey Testnet |
| RPC URL | `https://testnet.hsk.xyz` |
| Chain ID | `133` |
| Currency Symbol | `HSK` |
| Block Explorer | `https://testnet-explorer.hsk.xyz` |

Get testnet HSK from the [HashKey faucet](https://docs.hsk.xyz).

---

### Step 2 — Test a Pre-built Demo Link

Open this URL in your browser (replace `YOUR_DEPLOYMENT` with the live Vercel URL):

```
https://YOUR_DEPLOYMENT/pay?to=0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045&amt=0.001&memo=DashSend+Delivery+%231
```

**Expected flow:**
1. Payment card: `0.001 HSK` · memo `"DashSend Delivery #1"`
2. Click **"Connect Wallet to Pay"** → RainbowKit modal opens
3. Connect MetaMask (auto-switch to Chain 133 triggers if needed)
4. Click **"Pay 0.001 HSK"** → MetaMask confirmation popup
5. Confirm → green **"Payment Sent!"** screen
6. Click **"View on HashKey Explorer"** → live on-chain

---

### Step 3 — Generate Your Own Link

1. Visit the homepage `/`
2. Paste any testnet wallet address
3. Enter `0.001` HSK
4. Add memo: `Judge Test`
5. Click **Generate** → **Copy** → open in new tab

---

## Local Development

```bash
git clone https://github.com/Cyano88/hashkey-paylink.git
cd hashkey-paylink
npm install
npm run dev
# → http://localhost:5173
```

No `.env` required — MetaMask works without WalletConnect project ID.

---

## Deploy to Vercel

```bash
npm i -g vercel
vercel --prod
```

`vercel.json` handles SPA routing automatically.

---

## Architecture

```
src/
├── main.tsx          Wagmi + QueryClient + RainbowKit providers
├── App.tsx           React Router: / and /pay routes
├── Layout.tsx        Sticky frosted header + ConnectButton
├── pages/
│   ├── CreateLink.tsx    URL generator
│   └── PaymentPage.tsx   Payment receiver (parses ?to=&amt=&memo=)
└── lib/
    ├── wagmi.ts      HashKey Testnet chain + wagmiConfig
    └── utils.ts      cn, truncateAddress, formatHSK, memoToHex
```

### Payment Link Format

```
/pay?to=0x{address}&amt={hsk_amount}&memo={optional_text}
```

All state is in the URL — fully stateless, shareable, cacheable.

---

## Network Configuration

```
Chain ID:  133
Symbol:    HSK
RPC:       https://testnet.hsk.xyz
Fallback:  https://hashkey-testnet.drpc.org
Explorer:  https://testnet-explorer.hsk.xyz
```

---

## HashKey Explorer Testing Guide

### Find Your Transaction
```
https://testnet-explorer.hsk.xyz/tx/YOUR_TX_HASH
```

### Verify Fields

| Field | Expected |
|---|---|
| **From** | Your wallet |
| **To** | Recipient from the link |
| **Value** | Amount in wei (`0.001 HSK` = `1000000000000000`) |
| **Input Data** | UTF-8 decoded memo |
| **Status** | Success ✓ |

### Decode the Memo
Input Data tab → UTF-8 → memo string is permanently on-chain.

---

## License

MIT — Built for **HashKey Chain Horizon Hackathon 2025**

---

*Trustless · Non-custodial · Open source · Deployed on HashKey Testnet (Chain 133)*  
*Integrating with DashSend — campus logistics across Nigeria, expanding across Africa.*
