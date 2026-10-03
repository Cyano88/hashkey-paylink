# Local seller activation preparation

The selected 0.1 USDC Trade canary seller has an existing Circle ARC SCA record,
but no deployed wallet code. Production Trade release and execution policy stay
disabled while this prerequisite is completed and independently verified.

Run `node scripts/serve-arc-circle-activation.mjs` and open
http://127.0.0.1:4390/. The page reuses the existing Circle email login and
`deployCircleEvmEmailWallet` implementation. The latter requests a zero-USDC
self-transfer through Circle contract execution. This is wallet activation,
not Trade funding. Email verification and Circle approval remain user actions.

The server requires the private local canary wallet record, the existing local
signing UI stylesheet, and installed project dependencies. Vite uses the app's
existing Node polyfills to bundle the actual Circle SDK. It binds to loopback,
checks Host and POST Origin, limits actions and chain, and binds activation to
the selected seller wallet. It refuses wallet initialization and payments.
Session credentials remain in browser memory and request transport; the local
server does not log or persist them. No private operational records are tracked.

An exclusive journal file is created before forwarding an activation request.
Provider failure or an unknown outcome leaves the marker in place. Never remove
it merely to retry: inspect the recorded challenge and chain state first.
SDK completion and code presence are not final proof. Independently verify the
transaction, chain, wallet implementation and expected runtime before proceeding.

`node scripts/check-arc-circle-activation.mjs` checks HTTP delivery and rejects
wrong Host, Origin, action, chain, email and wallet without sending an OTP or
activation request. Browser OTP and approval remain to be exercised by the user.

After a user-reported wallet mismatch, the local proxy now selects the exact
linked wallet from the authenticated `listWallets` response instead of accepting
the shared helper's first eligible Arc wallet. ID, address, ARC, SCA and LIVE must
all match uniquely. Missing or ambiguous matches remain blocked. A local record
retains match booleans, wallet counts and allowlisted Arc wallet identity fields
for account reconciliation, without session credentials or full provider responses.
`node --test scripts/arc-circle-activation-selection.test.mjs` covers alternate
default selection and rejects identity, network, account type, state and duplicate
matches. A fresh provider and database read reconfirmed the linked seller wallet
is LIVE but undeployed. The prior browser response was not retained, so the
specific cause of that original mismatch remains unconfirmed pending login.

The next authenticated lookup returned five wallets with exactly one Arc wallet;
neither the expected wallet ID nor its address appeared. This rules out ordering
as the explanation for that response. A provider owner lookup confirmed the
stored buyer and seller wallets belong to distinct enabled EMAIL users, but did
not expose owner email addresses. No production link was changed. The local page
now displays and records the returned Arc identity on a mismatch so it can be
compared before any reconciliation or activation.

## Confirmed mismatch cause and local fix

Provider reads confirmed that the stored wallet and the login-returned wallet
have the same Circle user ID. The stored wallet has the Pocket replacement
reference prefix; the older returned wallet does not. The shared `listWallets`
route unconditionally filters replacement references, explaining their absence.
The database link is preserved.

The local server now reads Circle's wallet inventory using the user's session
token and the same live operator key as production, then requires the exact
stored wallet through the existing strict selector. The operator credential is
loaded into server memory from the verified Render service; it is never sent to
the browser, logged or persisted. Other actions still use the existing production
API. Generic discovery filters and production migration controls are unchanged.
The four focused provider/selection tests cover authenticated read headers,
replacement selection, missing sessions, provider rejection and wrong-wallet
rejection. End-to-end email confirmation still requires user interaction.

## Activation independently confirmed

Transaction `0x4dc6323f73d2f78f77c1cd6f90d2c77c8e6b7ad9aaecd20a9d5570bce894fb4b`
deployed the seller wallet on Arc mainnet at block 24071510. Circle reports
COMPLETE. The verifier checked absence of code at the preceding block, successful
receipt, canonical block, exact packed operation and zero-USDC self-transfer,
matching AccountDeployed/UserOperationEvent hashes and successful operation,
and buyer/seller runtime and implementation equality. No nonzero USDC transfer
from the seller appears in the receipt. This is activation, not Trade funding.

Run `node --import tsx scripts/verify-arc-circle-activation.mjs` for the read-only
provider and RPC check. Operational evidence remains under `.codex-temp`.

The actual transaction uses EntryPoint v0.7 at
`0x0000000071727de22e5e9d8baf0edac6f37da032`; the current production Trade verifier
is v0.6-specific. The local activation verifier uses the official v0.7
[packed structure](https://github.com/eth-infinitism/account-abstraction/blob/v0.7.0/contracts/interfaces/PackedUserOperation.sol)
and [hash encoding](https://github.com/eth-infinitism/account-abstraction/blob/v0.7.0/contracts/core/UserOperationLib.sol).
Production receipt support must be updated and tested, and implementation source
review completed, before enabling the Trade policy and funding the canary.
