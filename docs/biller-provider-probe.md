# Biller Provider Probe

Hash PayLink is testing biller providers as a replacement path for the Monnify/VTPass biller review bottleneck.

The probe compares providers through one normalized flow:

1. Discover biller catalog.
2. Select a service/operator.
3. Validate customer, meter, smartcard, or account identifier.
4. Build quote context.
5. Pay only when explicitly enabled.
6. Capture provider receipt/status payload.

Run dry discovery:

```bash
node scripts/biller-provider-probe.mjs
```

Run one provider:

```bash
node scripts/biller-provider-probe.mjs --provider reloadly --country NG --category electricity --customer 12345678901 --amount 100
node scripts/biller-provider-probe.mjs --provider baxi --country NG --category electricity --customer 12345678901 --amount 100
```

Dry-run mode never vends. Real vending requires both:

```bash
node scripts/biller-provider-probe.mjs --provider reloadly --execute
```

and:

```bash
BILLER_PROBE_EXECUTE=true
```

Environment variables:

```bash
RELOADLY_CLIENT_ID=
RELOADLY_CLIENT_SECRET=
RELOADLY_AUTH_URL=https://auth.reloadly.com/oauth/token
RELOADLY_AIRTIME_BASE_URL=https://topups-sandbox.reloadly.com
RELOADLY_AIRTIME_AUDIENCE=https://topups.reloadly.com
RELOADLY_UTILITY_BASE_URL=https://utilities-sandbox.reloadly.com
RELOADLY_UTILITY_AUDIENCE=https://utilities-sandbox.reloadly.com
RELOADLY_OPERATOR_ID=

BAXI_BASE_URL=
BAXI_API_KEY=
BAXI_AUTH_HEADER=x-api-key
BAXI_SERVICE_ID=

BILLER_PROBE_COUNTRY=NG
BILLER_PROBE_CATEGORY=electricity
BILLER_PROBE_CUSTOMER=
BILLER_PROBE_AMOUNT=100
```

Decision rule:

Pick the provider that passes catalog and validation first, has the exact biller coverage we need, and returns a durable receipt/status reference. Do not wire a provider into production until real test receipts are confirmed.

Reloadly airtime/data categories use the Topups API. Utility-style bills use the Utility Payments API.
