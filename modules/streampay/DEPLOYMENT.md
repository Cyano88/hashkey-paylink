# Streampay — Arc Mainnet Deployment Checklist

> Complete every item in order. Items marked **BLOCKING** must pass before proceeding.

---

## Phase 1 — Pre-Deployment (Local)

### Contracts

- [ ] **BLOCKING** Audit `StreamVault.sol` and `StreamVaultFactory.sol`  
  Minimum: internal review of the EIP-712 domain, nonce handling, and CEI pattern.  
  Recommended: external audit or Slither static analysis (`slither modules/streampay/contracts/`).

- [ ] **BLOCKING** Run `verify-create2.ts` against Arc Testnet and confirm all 6 checks pass  
  ```bash
  npx tsx modules/streampay/scripts/verify-create2.ts
  ```
  Expected output: `ALL CHECKS PASSED · Ghost-to-live transition is 100% deterministic.`

- [ ] Confirm compiler settings match between testnet and mainnet deployment  
  `solc` version, optimizer runs, and `viaIR` flag must be identical.  
  The `initCodeHash` embedded in CREATE2 changes if any of these differ.

- [ ] Verify `StreamVault.DOMAIN_SEPARATOR` is correct on the target chain  
  Deploy one test vault and call `DOMAIN_SEPARATOR()`. Reconstruct manually:
  ```
  keccak256(abi.encode(
    keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
    keccak256("StreamVault"), keccak256("1"),
    <Arc Mainnet chainId>, <vault address>
  ))
  ```
  They must match. A mismatch means every signature will revert.

---

## Phase 2 — Wallet & Key Preparation

- [ ] **BLOCKING** Confirm the Arc Mainnet relayer wallet is the one registered in the factory  
  The wallet used to deploy the factory is set as `relayer` in the constructor.  
  Verify: `factory.relayer() === RELAYER_PRIVATE_KEY_ARC.address`

- [ ] Fund the relayer wallet with Arc Mainnet native USDC for gas  
  Estimate: ~0.5 USDC per relay call. Keep ≥ 10 USDC as buffer at all times.

- [ ] Rotate all testnet private keys — never reuse testnet keys on mainnet.

- [ ] Store mainnet private keys in Render's encrypted environment variables only.  
  They must never appear in `.env` files, logs, or git history.

---

## Phase 3 — Contract Deployment

- [ ] Deploy `StreamVaultFactory` to Arc Mainnet  
  ```bash
  npx hardhat run modules/streampay/scripts/deploy-factory.ts --network arc-mainnet
  ```
  Constructor args: `(USDC_ARC_MAINNET, TREASURY_ADDRESS, RELAYER_WALLET_ADDRESS)`

- [ ] Record the deployed factory address. It is immutable — all vaults derive from it.

- [ ] **BLOCKING** Call `factory.getVaultAddress(...)` with known params and verify the  
  returned address matches the CREATE2 formula manually. Confirms the deployment  
  bytecode matches what `verify-create2.ts` was testing.

- [ ] Verify factory on Arcscan (source code upload + constructor args).

---

## Phase 4 — Render Environment Variables

Add these to Render → Service → Environment tab:

| Variable | Value | Notes |
|---|---|---|
| `STREAM_FACTORY_ADDRESS` | `0x...` | Deployed `StreamVaultFactory` on Arc Mainnet |
| `RELAYER_PRIVATE_KEY_ARC` | `0x...` | Arc relayer wallet private key |
| `PRIVATE_RPC_URL_ARC` | `https://...` | Private RPC (Alchemy / QuickNode for Arc) |
| `RENDER_EXTERNAL_URL` | `https://hashkey-paylink.onrender.com` | Used for OG image absolute URLs |

- [ ] All 4 variables are set in Render environment.
- [ ] `RELAYER_PRIVATE_KEY_ARC` has no VITE_ prefix (must stay server-side only).
- [ ] Trigger a manual Render redeploy after setting variables.

---

## Phase 5 — Post-Deployment Verification

### Relayer

- [ ] Hit `/api/health` — confirm `{ ok: true }` response.
- [ ] Send a test POST to `/api/relay-stream` with a dummy vaultAddress.  
  Expected response: `400 { ok: false, error: "Pre-flight failed: ..." }` (not a 500).  
  A 500 means a missing env var or RPC error.

### CREATE2 determinism on mainnet

- [ ] Run `verify-create2.ts` again pointing at Arc Mainnet RPC + the mainnet factory.  
  **BLOCKING**: all 6 checks must pass before any real funds flow through the system.

### OG Tags

- [ ] Paste a stream URL into [opengraph.xyz](https://www.opengraph.xyz) and confirm:
  - Title: `Streampay: Active USDC Stream for 0x…`
  - Description: contains amount + time remaining
  - Image: the `/og-streampay.png` branded image loads

- [ ] Paste the URL into the Twitter card validator and WhatsApp — confirm preview renders.

### Zero-Balance state

- [ ] Create a stream with `startTime = now + 60s` and connect as recipient.  
  Confirm the Withdraw button shows "Earnings accruing — first withdrawal available soon"  
  and is greyed out. After `startTime` passes, confirm the button activates.

### Pending TX toast

- [ ] Sign a Claim, then immediately close the browser tab.  
  Reopen the stream page. Confirm the toast reappears and resolves to "Confirmed"  
  once the Arc block is mined (typically 2–4 seconds).

---

## Phase 6 — Monitoring

- [ ] Set up an external cron (cron-job.org, free) to hit `/api/health` every 5 minutes.  
  This keeps the Render free tier warm and prevents the 3-minute cold-start  
  from affecting real users.

- [ ] Monitor the relayer wallet balance. Set an alert if it drops below 2 USDC.  
  The relay calls cost ~0.05–0.15 USDC each in Arc gas.

- [ ] Watch for `[relay-stream] claim failed` or `cancel failed` in Render logs.  
  The most common failure is an expired `deadline` (user waited > 10 minutes  
  between signing and the relay broadcasting). Reduce deadline window if needed  
  or surface a "please retry" message in the UI.

---

## Arc Mainnet vs Testnet Delta

| Parameter | Testnet | Mainnet |
|---|---|---|
| Chain ID | 5042002 | TBA (Arc has not published mainnet chain ID yet) |
| USDC address | `0x3600000000000000000000000000000000000000` | Same precompile address |
| RPC | `https://rpc.testnet.arc.network` | `https://rpc.arc.network` (TBA) |
| Explorer | `https://testnet.arcscan.app` | `https://arcscan.app` |
| `isTestnet` flag | `true` | Remove from `CHAIN_META.arc` |

When Arc Mainnet launches: update `chainId`, `rpcUrls`, and `blockExplorers` in  
`src/lib/chains.ts` (the read-only SDK) — a single-file change covers InstantPay  
and Streampay simultaneously since both reference `CHAIN_META.arc`.

---

## Rollback Plan

1. If the factory has a bug: deploy a new factory at a new address.  
   Update `STREAM_FACTORY_ADDRESS` in Render env. Existing vaults are unaffected —  
   they are self-contained and do not depend on the factory after deployment.

2. If the relayer key is compromised: rotate `RELAYER_PRIVATE_KEY_ARC` in Render.  
   Deploy a new factory with the new relayer address.  
   Existing vaults with the old relayer will stop accepting relay calls — users  
   must wait for `endTime` to pass and claim the full amount, or the sender can  
   cancel via a direct wallet call if they have ETH/USDC for gas.

3. If the Render service goes down: users lose gasless UX but funds are safe.  
   Vaults are fully self-custodial — a technically capable user can always call  
   `claim()` or `cancel()` directly with their own gas.
