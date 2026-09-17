# Hash PayLink CLI

Version 0.2.0 adds owner-approved, project-scoped CLI access. It creates human
hosted checkouts and reads their recorded payment state. It cannot sign or
transfer funds, configure settlement, create API keys, or manage hosting.

## Install

Requires Node.js 20.19 or newer. Not yet published to npm.

```sh
npm install -g ./packages/cli
hashpaylink --help
```

## Owner-approved login

Create and configure your project in the developer portal first. Copy its
project ID; it is not a secret.

```sh
hashpaylink auth login --project dev_YOUR_PROJECT_ID --json
```

Open the returned verification URL, sign in with the existing inline email
flow, review the project and permissions, and enter the confirmation code
shown by your own CLI or trusted agent session. Do not approve an unsolicited
request. The request expires after ten minutes. Then run:

```sh
hashpaylink auth complete --json
hashpaylink doctor --json
hashpaylink auth status --json
hashpaylink auth logout --json
```

Default permissions are `project:read,checkout:read`. To request creation:

```sh
hashpaylink auth login --project dev_YOUR_PROJECT_ID --scopes project:read,checkout:read,checkout:create --json
```

Access expires one hour after approval. There is no refresh token, background
polling, or automatic renewal. Start another owner-approved login after expiry.
Log out before changing the selected project or requesting different scopes.
Owners can inspect and revoke requests at
`https://developer.hashpaylink.com/cli/authorize`, also linked from the portal.

Credentials are stored under `~/.hashpaylink/cli-session.json`. Windows uses
DPAPI encryption tied to the current Windows user. Other systems use a private
0700 directory and 0600 credential file; those systems do not use a keychain
or encryption in this release. Protect the operating-system account.
Neither the CLI token nor the owner's Privy token appears in command output.
The Privy token stays in the browser and is never passed to the CLI.
The server stores only a SHA-256 token challenge, never the CLI token.

If a local session exists, it takes precedence over an environment API key.
Pending or expired local access fails rather than falling back to a broader
key. For trusted backend automation without a local session, inject an existing
live key as `HASHPAYLINK_API_KEY` through your secret manager. Such ordinary
keys retain their existing backend permissions, not the CLI scopes.

## Checkout commands

```sh
hashpaylink project show --json
hashpaylink checkout create --amount 2 --title "Order 1042" --idempotency-key order_1042_checkout --dry-run --json
hashpaylink checkout create --amount 2 --title "Order 1042" --idempotency-key order_1042_checkout --json
hashpaylink checkout status --id chk_REPLACE_WITH_ID --json
hashpaylink agent-prompt --json
```

Project settlement must be ready, active, and configured for human checkout.
The API enforces the selected project's pinned routing. An agent operating
the CLI still creates a human hosted checkout, not an agent-wallet payment.

Optional creation flags: `--description`, `--return-url` (HTTPS and allowlisted
in the portal), `--expires-in-minutes` (5-1440). USDC amounts are decimal
strings with at most six fractional digits. No recipient/network override flags.

Dry-run performs local validation only, with no authentication or network
request. It does not verify project readiness or server acceptance.

## Automation contract

- `--json` emits one JSON object to stdout, including failures.
- Exit status is 0 for command success and 1 for error.
- Commands are noninteractive; `--no-interactive` is accepted.
- Login returns a pending approval request. An owner must approve it before
  `auth complete` can succeed. CLI output never contains the bearer token.
- Errors use stable `error.code`: INVALID_ARGUMENT, AUTH_REQUIRED, AUTH_FAILED,
  ACCESS_DENIED, CONFLICT, RATE_LIMITED, API_ERROR, REQUEST_FAILED,
  INVALID_RESPONSE, or INTERNAL_ERROR.
- Keep a stable idempotency key per order (16-128 letters, digits, colons,
  underscores, or hyphens). Reuse the same key and payload after uncertainty.
- No automatic retry, polling, RPC request, or background job.
- Status reports server-recorded payment state; it does not trigger on-chain
  verification. Pending, redirects, and transaction hashes are not proof of
  payment. Payment and settlement remain separate API fields.
- API destinations are fixed to `https://developer.hashpaylink.com`;
  redirects are refused. Secrets are never accepted as arguments.
- Successful status output can include customer/transaction data. Treat saved
  output as sensitive. Upstream error bodies are not echoed.

## Server boundary

`POST /api/v2/cli/auth` supports begin, status, logout and owner-only inspect,
approve, revoke, list. Owner operations require a verified Privy owner session.
Grant scope and current project owner, mode, readiness, and suspension are
checked when resolving API permissions. Server-side route restrictions reject
CLI credentials on other product surfaces. Revocation affects subsequent
authorization checks; an already-authorized request may finish.

Authorization actions have bounded audit records (the latest 2,000 events in
the shared CLI store). This is operational history, not an immutable compliance
log. Pending and expired grant records are pruned on new login requests.
No new database or infrastructure service is required.

## Next stages

Scoped project/key management and authorized Render/Railway secret injection
are not implemented yet. Hosting authorization must remain separate from
Hash PayLink authorization. CLI access cannot be used as a provider API token.
npm publication is also a separate release step.

## Validate

```sh
npm --prefix packages/cli test
node --import tsx scripts/developer-cli-grants-smoke.mjs
node --import tsx scripts/developer-cli-project-smoke.mjs
npm pack ./packages/cli
```
