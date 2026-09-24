# Hosted account connections

Implemented locally on 24 September 2026. Not deployed or connected to the Hash PayStream backend yet.

Hash PayLink owns the hosted identity and payment UI. Circle remains the Arc wallet provider; Privy remains the xStocks wallet provider. This endpoint links a Hash PayLink identity, not a wallet balance or a signing permission. Wallet setup and exact ownership checks remain in the hosted payment flows.

## Backend integration

1. Authenticate the user in the builder app. Derive `subject` (an opaque internal account reference) and verified `email` from the server session, never from unchecked browser input.
2. Generate a random 32-byte base64url verifier on the backend. Persist it with the initiating account and pending session, never in browser storage or a URL. Set `challenge` to the lowercase hex SHA-256 of that verifier.
3. With a live Agreement project key carrying `wallet:connect`, POST `/api/v2/wallet-connections` with `{ action: 'create', subject, email, challenge }`. The project must have `arc_agreements` or `xstocks_agreements`. Sandbox credentials are rejected.
4. Open `https://app.hashpaylink.com` plus the returned `connectPath`. Preserve its fragment. The hosted screen requires the matching verified email and explicit account approval. Access expires after ten minutes. It never redirects to a caller-controlled destination.
5. From the initiating user's authenticated backend session, POST the same endpoint with `{ action: 'redeem', id, verifier }`. A pending approval returns 409; poll with backoff. A successful response contains `subject`, `hashPayLinkUserId`, and `walletAppId` only.
6. Verify the returned subject against the server's pending record and atomically persist the association to that authenticated account. Reject a different identity if already linked; do not silently rebind. Use this Hash PayLink user ID for new xStocks draft participants. Do not copy an old app's Privy ID.

Redemption is retry-safe with the same project key and verifier until expiry. The approved identity cannot be replaced. Cross-project reads and redemption are blocked. Only hashes of connection access, email and the verifier are stored. The server stores the opaque subject and approved identity for the handshake; expired records are inaccessible, but automatic record deletion is not implemented yet.

The browser participant route is `/api/v2/wallet-connections/participant`; it accepts `read` and `approve` with `{ id, access }` and a Hash PayLink Privy bearer token. Developer API keys cannot authorize this route. Existing Agreement-only keys do not acquire `wallet:connect` automatically.

No balances, Circle user tokens, Privy tokens, signing keys or API keys are returned to the builder browser. General live project keys retain their general access. User payment consent is still required separately.

## Cutover remaining

- Implement the authenticated create/redeem bridge and immutable identity mapping in the correct Hash PayStream checkout, with explicit migration reconciliation against its newer source.
- Wire Circle wallet operations to Hash PayLink's hosted UI; account linking alone does not migrate those operations.
- Reconcile existing wallets, balances and escrows before removing any old integration. No old wallets or recovery code were removed.
- Review cleanup/retention, cancellation, native return navigation and real sign-in end to end before production rollout.

## Validation

`npm run test:wallet-connections` covers verified email, consent, project isolation, backend proof, expiry, app binding, immutable replay, storage failure and scope routing. `scripts/developer-cli-keys-smoke.mjs` covers actual scoped key enforcement. The mobile browser preview uses synthetic identities only; it cannot sign or move funds.
