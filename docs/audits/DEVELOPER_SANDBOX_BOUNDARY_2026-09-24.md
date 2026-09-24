# Sandbox boundary and capability discovery - 2026-09-24

## Delivered scope

This is a safety and discovery increment, not a completed sandbox payment engine. No sandbox key issuance, testnet payment execution, Agreement activation, bank payout simulation or Polymarket bridge simulation is enabled.

- Unknown, malformed and duplicated environment selectors fail closed. Existing calls without a selector retain their authenticated live behavior.
- Developer key creation accepts only exact live/test values; unsupported values cannot fall through to live key issuance. Test key issuance remains disabled explicitly.
- Test credentials and requests marked test are rejected before current checkout, Agreement or Funding handlers reach storage/providers. Express middleware covers nested payer and agent routes; core handlers also enforce the boundary for direct invocation.
- One public capability contract serves API and portal. It differentiates planned testnet support from enabled execution and inherits the enforced live checkout network policy.
- GET /api/v2/capabilities performs no project, wallet or secret lookup. CLI 0.3.1 capabilities --json reads it without loading a login session or transmitting a key. Package built locally; not published to npm.

## Verification

Strict value, repeated-query selector, nested HTTP route, test-key, no-provider/no-storage side-effect and product mapping tests pass. Developer project, hosted checkout, Agreement and Funding regression tests pass. All 36 CLI tests pass. Scoped TypeScript check passed. Production build result and deployment readback are recorded below when complete. No financial transaction or production key issuance was used in testing.

## Provider references checked

- Circle Wallets codes: https://developers.circle.com/wallets/supported-blockchains
- Circle Gateway testnets: https://developers.circle.com/gateway/references/supported-blockchains
- Arc testnet identity: https://docs.arc.io/arc/references/connect-to-arc
- Base Sepolia identity: https://docs.base.org/base-chain/api-reference/ethereum-json-rpc-api/eth_chainId
- Arbitrum Sepolia identity: https://docs.arbitrum.io/arbitrum-bridge/quickstart

These establish provider/network support, not Hash PayLink integration readiness.

## Remaining sandbox implementation

1. Separate owner-managed sandbox project routing, test keys, webhook destinations and signing secrets; never inherit live settlement or wallet sessions.
2. Separate test record namespaces, environment-bound request signatures, idempotency, receipts and journal events.
3. Human checkout: Circle testnet wallet/session and exact receipt verification using explicit testnet chain IDs and finality checks.
4. Agent checkout: Base Sepolia and Arc Testnet only, isolated Gateway challenges and reconciliation. Acceptance must not imply final settlement.
5. Agreements: Arc Testnet only; review the testnet factory/operator deployment before activation and lifecycle execution.
6. Test webhook retry/replay and cross-environment rejection end to end before allowing sandbox keys/payments.
7. Extend Agreement/Funding CLI scopes and commands without broadening existing checkout-only grants. Polymarket Funding remains live-only.

## Activity HTML failure follow-up
- Confirmed transient Render 502 HTML during rollout; service subsequently recovered (homepage/health 200; unauthenticated Activity 401).
- Activity now handles server errors and malformed JSON with safe retry messages; 401/403 have explicit session/access messages.
- Browser fixture verified HTML 502, successful retry, retained loaded records during refresh failure, and recovery. Existing project/environment checks remain.
- Response smoke checks and Vite build passed. Both sign-in headings verified with normal letter spacing on the live site.
- Live capabilities and CLI discovery passed; test-mode route requests return 409, invalid environment returns 400. Actual sandbox execution remains disabled.
