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
