# Hash PayLink CLI

Version 0.3.0 provides owner-approved, project-scoped CLI access. It creates human
hosted checkouts and reads their recorded payment state. It can create scoped backend keys and hand them to a reviewed Render/Railway
backend target. It cannot sign or transfer funds or configure settlement.

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
  INVALID_RESPONSE, KEY_OPERATION_FAILED, HOSTING_FAILED, or INTERNAL_ERROR.
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

## Deferred capabilities

Account-wide project creation/configuration and automatic deployments are not
part of this release. npm publication remains a separate release step.

## Validate

```sh
npm --prefix packages/cli test
node --import tsx scripts/developer-cli-grants-smoke.mjs
node --import tsx scripts/developer-cli-project-smoke.mjs
npm pack ./packages/cli
```

## Scoped backend keys

Request `keys:manage` explicitly when logging in, together with the checkout
permissions you want to put on backend keys:

```sh
hashpaylink auth login --project dev_YOUR_PROJECT_ID --scopes project:read,checkout:read,checkout:create,keys:manage --json
# Owner reviews the permissions in the browser, then:
hashpaylink auth complete --json
hashpaylink keys create --name "Checkout backend" --scopes project:read,checkout:read,checkout:create --expires-in-days 30 --idempotency-key merchant_checkout_v1 --json
hashpaylink keys list --json
hashpaylink keys revoke --key-id key_YOUR_KEY_ID --json
```

These `hpl_app_` credentials are restricted on the server to their approved
checkout/project scopes, expire in 1-30 days, and cannot administer keys, use
agreement APIs, sign, or withdraw. A key cannot receive a scope missing from
the approving CLI grant. Existing ordinary developer keys are unchanged.

**Backend keys outlive the one-hour CLI session.** Logging out or revoking CLI
access stops future management, but does not revoke issued backend keys.
Revoke them explicitly using `keys revoke` or the existing project's Keys tab.
Owners can see scoped-key expiry there. Suspension still blocks API use.

The CLI generates the secret locally, saves it in the protected
`~/.hashpaylink/cli-vault.json`, and sends it over HTTPS for registration.
The API stores only a keyed digest and metadata; responses never contain the
secret. Output contains the key ID, scopes and expiry. Retry uncertain creation
with the same operation ID and arguments on the same machine/vault. If the
vault is lost, revoke the key using its ID and create a replacement.

The local vault keeps up to 20 keys and 10 hosting plans. Key operations use an
exclusive local lock to prevent concurrent agents losing credentials.
After a process crash, remove a leftover `cli-vault.json.lock` only after
confirming its recorded PID is no longer running. Never delete the vault to
clear a lock. Key creation/revocation events are recorded in project operations.

## Hosting plan and apply

Hosting access is separate. Hash PayLink never receives provider credentials.

- Render: supply `RENDER_API_KEY` through a secret manager/protected environment.
  The adapter uses the official [single-variable API](https://api-docs.render.com/reference/update-env-var).
- Railway: authenticate the official Railway CLI separately, or supply an
  appropriate Railway token. Prefer project/environment-scoped access.
  The adapter uses [stdin for the value and --skip-deploys](https://docs.railway.com/cli/variable).
  It requires a CLI supporting explicit project/environment/service IDs and
  JSON output. The command interface was checked with Railway CLI 5.41.2.
  Windows requires a native railway.exe on PATH or in the official npm package.

```sh
hashpaylink hosting plan --provider render --service srv_YOUR_SERVICE --key-id key_YOUR_KEY_ID --backend --json

hashpaylink hosting plan --provider railway --project PROJECT_UUID --environment ENVIRONMENT_UUID --service SERVICE_UUID --key-id key_YOUR_KEY_ID --backend --json

# Review the returned target, variable, key ID and replacement status first:
hashpaylink hosting apply --plan PLAN_UUID --json
```

Plans last 15 minutes and are bound to the selected Hash PayLink project, key,
provider and target. `--backend` confirms the service is a backend; never point
this at a frontend build that exposes environment values. Render static sites
are rejected. The sole destination variable is `HASHPAYLINK_API_KEY`; there
are no arbitrary variable names or `VITE_*` secret destinations.

Planning does not write provider configuration. If an existing value differs,
planning requires an explicit `--replace`. Apply checks that the key remains
active and that the variable has not changed since planning, updates only that
variable, then compares readback internally. No value is printed.

A provider update and Hash PayLink registration are not a distributed
transaction. If a write response is uncertain, retry the same plan: an already
matching value is verified without writing again. There is no automatic
rollback or deletion of an existing key. Avoid concurrent edits to the same
variable; provider APIs do not offer an atomic compare-and-swap here.

Render checks only service-local variables; adding one can override an inherited
environment-group value. The plan explicitly calls this out. Review linked
groups before applying. Railway selection always includes project, environment
and service; the CLI does not silently use the locally linked project.

**No deployment is triggered.** The running service needs a separately authorized
deploy/restart to use its new value. For rotation, deploy and verify the new key
before explicitly revoking the old one.

Provider credentials retain their provider-granted permissions outside this
CLI. A reviewed local plan does not reduce an account-wide provider token's
authority. Protect the OS account and use the narrowest provider credentials
available.

## Provider verification boundary

Adapter tests use synthetic credentials and mocked provider mutations.
The implementation is not evidence that a particular live Render/Railway
service has received a key. Live handoff requires an owner-approved project
session plus a reviewed target plan and provider authorization.
