# Hash PayLink CLI

A small Node.js CLI for builders and agents using **human hosted checkouts**.
Version 0.1.0 uses existing project API keys. It does not contain a wallet,
sign transactions, configure settlement, or administer accounts.

## Install from this repository

Requires Node.js 20.19 or newer. This package is not yet published to npm.

```sh
npm install -g ./packages/cli
hashpaylink --help
```

Inject a live developer project key into `HASHPAYLINK_API_KEY` with your
secret manager or protected process environment. Do not put keys into command
arguments, shell history, chat, frontend variables, or committed files.
The CLI neither saves credentials nor reads local .env files.
Revoke the underlying key through the developer portal when access should end.

## Commands

```sh
hashpaylink doctor --json
hashpaylink project show --json
hashpaylink checkout create --amount 2 --title "Order 1042" --idempotency-key order_1042_checkout --dry-run --json
hashpaylink checkout create --amount 2 --title "Order 1042" --idempotency-key order_1042_checkout --json
hashpaylink checkout status --id chk_REPLACE_WITH_ID --json
hashpaylink agent-prompt --json
```

The project must have an active live key, approved settlement configuration,
and human checkout mode. The API enforces that mode and the merchant's pinned
routing. A CLI operated by an agent still creates a **human payment checkout**;
it does not enable the separate agent-wallet payment product.

`doctor` and `project show` use the new read-only `GET /api/v2/project`
route, which must be deployed with this change. Creation and status use
`/api/v2/checkouts`. The destination is fixed to
`https://developer.hashpaylink.com`; redirects are refused.

Optional creation flags: `--description`, `--return-url` (HTTPS and
allowlisted in the portal), `--expires-in-minutes` (5-1440).
USDC amounts stay decimal strings with at most six fractional digits.
There are no recipient/network override flags.

Dry-run performs **local input validation only**, without authentication or
network activity. It does not validate project readiness, return URL
allowlisting, balances, or whether the server will accept the request.

## Automation contract

- `--json` emits a single JSON object to stdout, including on failure.
- Exit status is 0 for a successful command, 1 for an error.
- All commands are noninteractive; `--no-interactive` is accepted explicitly.
- Errors include a stable `error.code`: INVALID_ARGUMENT, AUTH_REQUIRED,
  ACCESS_DENIED, CONFLICT, RATE_LIMITED, API_ERROR, REQUEST_FAILED,
  INVALID_RESPONSE, or INTERNAL_ERROR. HTTP errors include `error.status`.
- Use a stable idempotency key per order (16-128 letters, digits, colons,
  underscores, or hyphens). Persist it in the caller's order record.
  Reuse the **same key and payload** after a timeout or uncertain response.
  A changed payload with the same key is a conflict.
- No automatic retry, polling, RPC request, or background job is performed.
- Status reports server-recorded payment state. Pending is not paid.
  Successful checkout creation, redirects, and transaction hashes are not
  proof of payment. Payment and settlement status remain separate API fields.
- Upstream error bodies are not printed, and project keys are redacted.
  Successful checkout/status output can contain transaction or customer data;
  treat saved output as sensitive.

Project API keys retain their existing backend permissions. This release does
**not** introduce narrower delegated agent credentials. Only supply a key to
a trusted agent/process; limiting CLI commands does not reduce that key's API
permissions outside the CLI.

## Deliberately deferred

Browser/device login, account-wide project listing/creation, key rotation,
webhook management, bridge/swap commands, and agreement commands are not in
this release. Browser login needs a reviewed, revocable delegation flow;
the CLI does not accept or export Privy session tokens.

## Validate and package

```sh
npm --prefix packages/cli test
node --import tsx scripts/developer-cli-project-smoke.mjs
npm pack ./packages/cli
```

No dependencies or build step are required. npm publication is a separate
release step.
