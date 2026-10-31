# HashpayStream

HashpayStream is the agreements-first Arc application powered by Hash PayLink.
It demonstrates how a product can use the Arc Agreements API without becoming
another developer portal.

## Primary product

The public HashpayStream experience is limited to:

- fixed agreements with one payer-approved release;
- progressive agreements with ordered completion checkpoints;
- milestone agreements with named percentage releases;
- private payer links with rotatable capabilities;
- delivery submission, payer review, issue reporting, cancellation, and refund;
- signed lifecycle events and unified terminal receipts.

The root route and visible navigation belong to Arc Agreements. Hash PayLink
remains the infrastructure and system of record for project policy, payer
wallet actions, confirmed Arc reconciliation, signed webhooks, and receipts.

## Current deployment boundary

The product has a dedicated `hashpaystream.app` hostname and a focused client,
but it still shares the Hash PayLink repository and runtime. In particular, the
dashboard uses `/api/hashpaystream/arc-agreements` for authenticated project
views and delivery actions.

A parallel user-scoped gateway now exists at
`/api/hashpaystream/v2/agreements`. It is intentionally not wired into the
browser until its server-only API key and ownership secret are deployed and
the live isolation gate in `STANDALONE_BACKEND.md` passes.

Do not extract this module into an independent deployment until:

1. every required creator-side read and lifecycle action is available through
   a documented Hash PayLink integration contract;
2. the standalone service owns its webhook receiver, durable projection, and
   replay recovery;
3. project identity and authorization work without importing Hash PayLink
   server internals;
4. fixed, progressive, milestone, cancellation, refund, and receipt flows pass
   cross-deployment tests;
5. legacy creator receipt lookups have a migration and rollback plan.

Current public-API parity includes project-scoped create, lifecycle-aware read
and list, unused payer-link rotation, payer-reviewed release requests, and
unified terminal receipts. The standalone service must keep its project key on
its backend and persist verified signed webhooks as its event history.

## Compatibility code

Creator content, timed payroll/stream contracts, x402 creator unlocks, and
Arena remain in this module only to preserve existing routes, identifiers, and
records. They are not first-level HashpayStream products. See
`LEGACY_BOUNDARY.md`.

Agentic x402 remains an independent Hash PayLink developer product. It should
not be presented as a HashpayStream agreement mode.

Arena is a separate game concept with a different user, risk, custody, and
compliance model. See `ARENA_STANDALONE_REVIEW.md` before extending it.

## Local preview

Run the main Vite application and open:

```text
http://127.0.0.1:5173/?app=streampay
```

The compatibility routes remain available for migration testing, but should
not be added back to the primary navigation.
