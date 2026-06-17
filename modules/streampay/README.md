# StreamPay

USDC streaming payments on Arc Network. Payroll, agentic streams, and Arena rooms in one platform.

**Live:** [hashkey-paylink.onrender.com/?app=streampay](https://hashkey-paylink.onrender.com/?app=streampay)  
**Primary route:** `https://hashpaylink.com/?app=streampay`

---

## What It Does

| Mode | Flow | Description |
|---|---|---|
| **Payroll** | Time-Sovereign | Pre-fund a vault · USDC unlocks linearly to the recipient · gasless withdrawal |
| **Agentic Stream** | Agent-Sovereign | Stream Arc USDC to the Hash PayLink Agent for recurring services such as daily LP research |
| **StreamPay Arena** | Game-Sovereign | Competitive rooms where player deposits stream into a prize pool while they stay active |
| **Creator Studio** | Legacy direct route | Existing creator/gate code remains in the module, but it is not the primary public StreamPay nav |

---

## Deployed Contracts — Arc Testnet (chainId 5042002)

| Contract | Address | Purpose |
|---|---|---|
| `StreamVaultFactory` | `0xBAecf54084A0cB65b77a88cbDEf2b663Be71c61b` | CREATE2 factory — deploys one `StreamVault` per stream |
| `ArenaRoomEscrowFactory` | `0x82D313F193BE77cba64BEc046CCcb82154941D58` | Deploys deterministic per-room Arena escrows |
| `ArenaRoomEscrow` | Per room | Holds deposits, refunds unstreamed risk, settles winners, and collects the 0.5% platform fee |
| `PoASettlement` | `0x91DbDb49c8C68e5775554D42A1B5ce15C89C814B` | Legacy direct-route proof-of-attention settlement |
| USDC (Arc precompile) | `0x3600000000000000000000000000000000000000` | Native USDC on Arc |

---

## Environment Variables

Set in Render → Service → **Environment**.

| Variable | Side | Purpose |
|---|---|---|
| `RELAYER_PRIVATE_KEY_ARC` | Server | Gasless relay wallet for claim/cancel and PoA settlement |
| `PRIVATE_RPC_URL_ARC` | Server | Alchemy or private Arc RPC endpoint |
| `STREAM_FACTORY_ADDRESS` | Server | `StreamVaultFactory` address |
| `VITE_STREAM_FACTORY_ADDRESS` | Browser | Same — must match server value |
| `ARENA_ESCROW_FACTORY_ADDRESS` | Server | Dedicated multiplayer Arena escrow factory: `0x82D313F193BE77cba64BEc046CCcb82154941D58` |
| `VITE_ARENA_ESCROW_FACTORY_ADDRESS` | Browser | Same Arena factory address for client-side room readiness |
| `ARENA_RELAYER_PRIVATE_KEY` | Server | Room escrow deployer/settlement wallet. Must match the deployed Arena factory relayer. Never expose with `VITE_` |
| `ARC_POA_CONTRACT` | Server | `PoASettlement` address |
| `VITE_POA_CONTRACT` | Browser | Same — must match server value |

`VITE_` prefixed variables are baked into the frontend bundle at build time.  
Never add `VITE_` to private keys — they would be exposed to the browser.

---

### Arena Storage

StreamPay Arena uses Postgres as the durable source of truth for private room settings. Set `DATABASE_URL` on Render. The `/api/arena-room` route stores entry amount, player count, round count, risk curve, timer, start rule, room status, escrow/payment status, deposit asset, and the fixed 0.5% platform fee in the `arena_rooms` table. The table is created or migrated automatically on first use.

Postgres does not custody funds. Real-money Arena deposits, stream halts, refunds, platform fee collection, and winner claims go through `ArenaRoomEscrow` contracts deployed by `ArenaRoomEscrowFactory`. When `ARENA_ESCROW_FACTORY_ADDRESS`, `VITE_ARENA_ESCROW_FACTORY_ADDRESS`, and a matching server-side `ARENA_RELAYER_PRIVATE_KEY` are configured, `/api/arena-room` deploys one deterministic escrow per private room and stores that escrow address with `payment_status = deposit_open`. If the relayer key is missing or does not match the factory relayer, the room remains saved as `escrow_pending` and paid deposits stay disabled.

Arena contract files:

- `ArenaRoomEscrow.sol` — per-room USDC custody, recoverable refunds, winner settlement, 0.5% platform fee.
- `ArenaRoomEscrowFactory.sol` — CREATE2 factory for deterministic per-room escrow addresses.

0G Storage should be used later for permanent room proofs and final result archives, while Arc contracts handle USDC custody and settlement.

## Module Structure

```
modules/streampay/
├── src/
│   ├── StreamPayApp.tsx              # Root router (Payroll + Agentic + Arena + Creator routes)
│   ├── components/
│   │   ├── StreamPayHeader.tsx       # Shared nav (Payroll / Agentic / Arena, wallet)
│   │   ├── StreamPayLayout.tsx       # Shell (header + footer)
│   │   ├── CreateStreamForm.tsx      # Payroll: create a stream
│   │   ├── StreamView.tsx            # Payroll: view + claim/cancel a stream
│   │   ├── StreamNotFound.tsx        # 404 state for bad vault addresses
│   │   ├── TriStateBar.tsx           # Progress bar (claimed / unlocked / locked)
│   │   ├── ArenaPage.tsx             # Arena private rooms and game preview flow
│   │   └── creator/
│   │       ├── LinkFactory.tsx       # Creator: generate a gate link
│   │       ├── StreamGate.tsx        # Viewer: 4-step auth + content reveal + HUD
│   │       └── CreatorPage.tsx       # Creator: link factory + settlement dashboard
│   ├── hooks/
│   │   ├── usePoAStream.ts           # PoA drip engine (EIP-712 signing, ghost vault)
│   │   ├── usePasskey.ts             # WebAuthn passkey registration + auth
│   │   └── useStreamState.ts         # Live stream ticker (100ms updates)
│   └── lib/
│       └── streamVaultAbi.ts         # StreamVault + StreamVaultFactory ABIs
│
├── api/
│   ├── relay-stream.ts               # POST /api/relay-stream  (gasless claim/cancel)
│   ├── settle-poa.ts                 # POST /api/settle-poa    (PoA settlement)
│   ├── content.ts                    # POST /api/store-content, GET /api/get-content
│   ├── vault-registry.ts             # POST /api/register-vault, GET /api/get-vault, GET /api/list-viewers
│   └── stream-og.ts                  # GET  /stream/:vault      (OG meta tags)
│
├── contracts/
│   ├── StreamVault.sol               # Per-stream vault with EIP-712 claim/cancel
│   ├── StreamVaultFactory.sol        # CREATE2 factory
│   └── PoASettlement.sol             # PoA signature settlement (transferFrom)
│
├── scripts/
│   └── verify-create2.ts             # Determinism checks before mainnet deploy
│
└── DEPLOYMENT.md                     # Mainnet launch checklist
```

---

## Payroll Flow

Active sender wallet path:

- Privy email sign-in is the primary StreamPay identity layer.
- Circle Smart Wallet on Arc is opened for payroll and agentic stream creation.
- The Circle wallet is saved through `/api/privy-circle-link` against the Privy user, so returning users can restore the mapped wallet.
- The old connected-wallet toggle is intentionally hidden from Payroll and Agentic streams.

```
Creator                          Arc Network              Recipient
  │                                  │                        │
  ├─ transfer USDC to vault ────────>│                        │
  ├─ deploy StreamVault (CREATE2) ──>│                        │
  │                                  │ time passes…           │
  │                                  │ USDC unlocks linearly  │
  │                                  │                        │
  │                              EIP-712 sign ───────────────>│
  │                                  │<─ relay-stream POST ───┤
  │                                  │  (gasless, relayer pays)
  │                                  │                        │
  │                              USDC arrives ───────────────>│
```

Stream links look like: `/stream/0xVaultAddress?reason=April+Salary`

---

## Creator / PoA Flow

```
Creator                        Viewer                   Arc Network
  │                               │                          │
  ├─ paste content / private URL  │                          │
  ├─ POST /api/store-content ────>│                          │
  ├─ generate gate link           │                          │
  │                               │                          │
  │                ── gate link ──>│                          │
  │                               ├─ connect wallet          │
  │                               ├─ switch to Arc           │
  │                               ├─ passkey register        │
  │                               ├─ approve USDC ──────────>│ (one tx)
  │                               │                          │
  │                               │  content unlocked        │
  │                               │  drip meter running      │
  │                               │                          │
  │                               ├─ click End Session       │
  │                               ├─ EIP-712 sign ──────────>│ (one wallet popup)
  │                               ├─ POST /api/register-vault│
  │                               │                          │
  ├─ paste gate link in dashboard │                          │
  ├─ see viewer row               │                          │
  ├─ click Claim Revenue          │                          │
  ├─ POST /api/settle-poa ───────────────────────────────────>│
  │                                                   USDC transferred
```

Gate links look like: `/gate?id=abc123&cr=0xCreator&r=1000&cap=100000`

---

## Ghost Vault

The EIP-712 `SessionIntent` signature is the only on-chain proof of consumption.

- Stored locally in `localStorage` as `sp_poa_{contentId}_{viewer}` — survives page reloads
- Pushed to `/api/register-vault` after every sign — enables cross-device settlement
- Only the latest (highest amount) signature is kept — it supersedes all prior sigs
- If the viewer closes the tab without signing, the existing vault is sent via `navigator.sendBeacon`

The creator never needs the viewer's wallet address — `/api/list-viewers?id=contentId` returns everyone who has signed.

---

## Tech Stack

- React 18 + TypeScript + Vite
- Privy email sign-in, Circle Smart Wallet mapping, Viem v2, Wagmi v2, TanStack Query v5
- Arc Network (chainId 5042002) — standalone `createPublicClient` bypasses wagmi chain management
- EIP-712 typed signatures for gasless payroll relay and PoA session intents
- WebAuthn (passkeys) for viewer session authorization
- Tailwind CSS (JIT) — arbitrary classes work because `tailwind.config.js` scans `modules/**`

---

## Local Development

```bash
# From repo root
npm install
npm run dev       # Vite on :5173

# Load StreamPay in the browser
http://localhost:5173/?app=streampay
```

Copy `.env.example` (or set manually):
```
RELAYER_PRIVATE_KEY_ARC=0x...
PRIVATE_RPC_URL_ARC=https://rpc.testnet.arc.network
STREAM_FACTORY_ADDRESS=0xBAecf54084A0cB65b77a88cbDEf2b663Be71c61b
VITE_STREAM_FACTORY_ADDRESS=0xBAecf54084A0cB65b77a88cbDEf2b663Be71c61b
ARC_POA_CONTRACT=0x91DbDb49c8C68e5775554D42A1B5ce15C89C814B
VITE_POA_CONTRACT=0x91DbDb49c8C68e5775554D42A1B5ce15C89C814B
```

---

## Known Limitations (Testnet)

- **In-memory storage** — content registry and vault registry are in-memory Maps. Data is lost when Render restarts (free tier sleeps after 15 min). Add Redis for persistence.
- **No Arc Paymaster** — the "First $0.02 sponsored" label is UI copy only. Viewers pay their own USDC gas for the approval transaction.
- **No Arc Smart Account / JIT provisioning** — viewers use regular EVM wallets. Passkey is a local auth gate, not linked to an on-chain account.
- **PoASettlement requires USDC approval** — the settlement contract calls `transferFrom`. Viewers must approve the contract (Step 4 in the gate) before settlement works.
