# Pocket fee coverage audit — 2026-10-11

Local source audit; this is not a production billing or deployment attestation.

## Completed

- Ordinary Circle wallet-address and Pocket ID sends now use the same wallet-send quote. USDC and USDT collect execution reimbursement, with no 0.25% service fee. Unsupported assets/networks remain excluded.
- Confirmation shows Fee and Total before approval. Sub-cent display remains `<0.01`, never a false zero; exact quote units remain authoritative.
- X Layer transfer confirmation uses Fee and retains Covered by Pocket only for sponsored execution.
- Customer-facing Gas labels were removed from the affected Pocket screens. Separate execution costs remain separately described where a service/provider fee already has its own row.

## Remaining coverage and implementation boundaries

| Path | Current source behavior | Required next work |
| --- | --- | --- |
| Request payments | Sponsored, no reimbursement | Funding currently targets the exact requested amount. Quote the full debit and propagate it into funding, approval, balance checks and recovery before enabling reimbursement. |
| EVM USDC CCTP bridges | Local implementation now quotes execution reimbursement and collects it atomically | Coordinated backend/mobile rollout and live verification still required. |
| EVM USDT bridges | Signed quotes include execution reimbursement and provider cost; exact treasury transfer required in source proof | Coordinated backend/mobile rollout and live verification required. |
| Verified Base USDC payout funding | Exempt wallet-funding transfer | Paycrest payout already includes sender/provider fees. Reconcile actual sponsor expense with payout economics before adding another charge. |
| X Layer sponsored transfers | Privy sponsorship; no token reimbursement | Provider provisioning remains unresolved. Confirm sponsor billing and successful execution before changing charging design. |
| Solana USDC bridge | Local reimbursement implementation | Previously added quote/signing changes still require coordinated rollout and live verification. |

No fees were silently appended to an already approved transaction. No production deployment, Pixel installation, live charge or treasury movement was performed in this audit pass.

## Verification

- `solana-payment-fees-smoke.mjs`: USDC/USDT send reimbursement, payment service fees, quote-purpose isolation, lower-cost collection and relayer insufficiency checks passed.
- `circle-payment-idempotency-smoke.mjs`: five EVM rails, supported assets, quote-purpose isolation and payout exemption validation passed. Provider behavior is mocked.
- `pocket-send-sheet-browser-smoke.mjs`: both address and Pocket ID send modes, USDC/USDT, fee review before approval, duplicate prevention and success/pending/failure sheets passed in an isolated Chrome fixture. No real wallet transactions.

## EVM bridge reimbursement core (staged)

`api/pocket/evm-bridge-reimbursement.ts` now builds and seals a reimbursement quote around an already validated server-generated bridge batch. It appends the treasury transfer atomically, estimates the complete batch, converts with integer ceiling, and adds no service-fee percentage. It fails if estimates do not converge; fresh lower costs benefit the payer and higher costs require renewed review.

At the initial staging checkpoint this helper was not wired into an endpoint; the completion sections below supersede that state. It must receive only provider/CCTP-validated call data and pinned token addresses from the server, not arbitrary client call data. Activation requires passing the active Circle session into bridge and payment-funding previews, including the full debit in their balance ceilings, and consuming the bound quote in execution. USDT reconciliation must also distinguish reimbursement from bridge principal. Existing live charging behavior has not changed.

Verified against Circle's user-controlled contract execution estimate API: `X-User-Token` is required. Reference: https://developers.circle.com/api-reference/wallets/user-controlled-wallets/create-transaction-estimate-fee

`pocket-evm-bridge-reimbursement-smoke.mjs` passed nine synthetic asset/network combinations (Arc USDT excluded), exact batch preservation, treasury amount, expiry/tampering/binding rejection, lower-cost collection and higher-cost rejection. This is not live provider validation.

## USDC EVM wiring completed locally

The bridge API now requires the active Circle user session for EVM fee estimation. It returns a signed quote containing the exact CCTP batch plus reimbursement, with Fee and Total including both provider cost and execution cost. The receive amount and CCTP burn remain unchanged. Execution verifies the owner, wallet, route, asset, amount, expiry and current balance, then sends that exact batch. No unsigned-quote fallback remains.

Pocket bridge previews, payment-funding previews and hosted checkout now forward the Circle session. Funding execution is bounded by the reviewed total; a different route or increased debit returns to review. Funding notices include fee and total. Solana destination addresses remain case-sensitive.

Validation: five EVM USDC quote/execution paths passed in pocket-evm-bridge-integration-smoke.mjs; 30 directed quote routes passed adapter tests; funding session forwarding and fee ceilings passed pocket-funding-fee-review-smoke.mjs. All provider responses are synthetic. USDT reimbursement was outstanding at this checkpoint; see its completion section below. Repository-wide typechecking reports unrelated errors; no deployment or Pixel transaction test has been performed.

## USDT EVM wiring completed locally

Base, Arbitrum, Ethereum and Polygon USDT bridge quotes now estimate the validated provider batch plus an atomic reimbursement transfer using the active Circle session. The signed quote binds the full batch, total debit, reimbursement amount and treasury address. Provider receive/minimum amounts remain unchanged. No Pocket 0.25% fee is added. Execution checks the total balance; new submissions without reimbursement fields require a new quote, while existing challenges remain recoverable.

Source proof requires both the full debit and the exact USDT reimbursement transfer to the signed treasury. Destination proof remains mandatory. Old pending quotes retain their original debit rules. The shared USDC/USDT form shows Fee and Total, receipts carry Total, and USDT Max reserves the currently quoted reimbursement.

Validation: provider validation, nine synthetic EVM reimbursement combinations, legacy and new USDT recovery proofs, and isolated browser form coverage. Provider integrations are mocked; deployment and Pixel transaction testing remain pending.
