# HashPayStream standalone backend

## Status

The standalone backend boundary is available in parallel at:

```text
GET|POST /api/hashpaystream/v2/agreements
```

The standalone browser client now targets this route. Do not deploy the client
cutover until the server-only settings below are deployed, existing pilot
agreements are imported, and a live user-isolation test passes.

## Responsibilities

The standalone gateway:

- verifies the HashPayStream user's Privy bearer token;
- keeps the Hash PayLink project API key on the server;
- replaces browser-supplied external identifiers with user-scoped values;
- journals each agreement against an HMAC-derived user owner;
- filters list, read, payer-link rotation, and release requests by that owner;
- calls only the documented `/api/v2/agreements` integration contract.

Hash PayLink remains responsible for Arc policy, escrow activation, confirmed
chain reconciliation, payer review, operator execution, signed lifecycle
webhooks, and terminal receipts.

## Server-only configuration

```text
HASHPAYSTREAM_ARC_API_KEY=hpl_test_...
HASHPAYSTREAM_APP_OWNERSHIP_SECRET=<stable 32+ character secret>
HASHPAYSTREAM_APP_OWNERSHIP_STORE_KEY=hashpaystream:standalone-agreement-owners:v1
HASHPAYSTREAM_HASH_PAYLINK_BASE_URL=https://app.hashpaylink.com
```

Never use a `VITE_` prefix for these values. Losing or rotating the ownership
secret without a migration makes existing user ownership records unreadable.

## Cutover gate

Before deploying the browser route:

1. deploy the four server-only settings;
2. set `HASHPAYSTREAM_MIGRATION_OWNER_PRIVY_USER_ID` temporarily and run
   `npm run migrate:hashpaystream-standalone-owners` as a dry run;
3. review the counts, then re-run with
   `-- --confirm-hashpaystream-owner-import` and remove the temporary owner id;
4. create one agreement as test user A;
5. confirm test user B sees no agreement and receives 404 for A's id;
6. confirm signed webhooks persist across a process restart;
7. confirm completed, cancelled, and refunded receipts match Hash PayLink;
8. retain the embedded route as rollback until the standalone deployment has
   passed fixed, milestone, cancellation, refund, and receipt tests.

The migration command reads agreements only through Hash PayLink's public v2
API and writes only HashPayStream's ownership journal. It does not read Hash
PayLink's internal agreement or developer-project stores.
