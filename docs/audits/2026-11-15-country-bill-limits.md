# Country bill limits and rounded USD policy

Owner-approved scope: clean USD policy cards, country-specific provider details, one shared budget across countries, identical verified-green treatment for Basic and Advanced. Keep eSIM independent of BVN-gated purchase/transfer allowances. Kenya remains coming soon.

## Verified provider facts

Read-only live VTpass catalogue checks on 2026-11-15 confirmed Nigeria airtime maxima: Airtel and 9mobile NGN 50,000, MTN NGN 200,000, Glo NGN 100,000. Data ceilings vary by provider (NGN 150,000 to 1,000,000); TV NGN 200,000 to 500,000; electricity NGN 100,000 to 10,000,000, with additional meter restrictions possible. These are provider service limits, not customer daily allowances. No provider order was placed.

Uganda is a distinct international airtime/data catalogue. Live flexible airtime ranges: Airtel and MTN UGX 50 to 519,480; UTel UGX 50 to 467,945. At inspection, the supplier's NGN-per-UGX rates were 0.385 and 0.4274 respectively. MTN data returned 19 supported data plans, UGX 250 to 100,000. These snapshots are evidence only: no amounts or rates are hardcoded into the country detail implementation. TV/electricity remain Nigeria-only; Uganda bill availability does not activate Uganda local bank settlement.

Sources: https://vtpass.com/documentation/service-ids/ documents service minima/maxima; the authenticated live catalogue provided the exact current values above. Existing electricity verification checks meter-specific bounds before quoting. eSIM supplier documentation https://docs.esimaccess.com/ supports repeat/batch orders; our runtime already limits orders to one plan and USD 500 before network fees. That is a Pocket policy, not a documented supplier monetary ceiling.

## Implementation

Canonical bill policy: USD 50 airtime per payment, USD 150 airtime daily, USD 750 daily shared by data/TV/electricity. Reservations sum each stored original bill quote at six-decimal precision, excluding separately quoted fees. Existing intents already hold the original bill amount; older records without a separate bill value retain their stored total rather than being reset or revalued. Country switching cannot reset allowance. Existing expiration, cancellation, refund, unknown-payment and durable-lock semantics remain intact. Provider reconciliation continues to compare NGN settlement amounts.

The authenticated catalogue endpoint exposes country limits from current provider data, current FX and the user's remaining allowance. Available maximum is the lower of provider bounds and Pocket budget. Uganda uses its supplier conversion to translate the funding budget into UGX face value, not Nigeria's network caps or a generic payout FX rate. Fixed Uganda data products are filtered for affordability. Nigerian data/TV rows describe a service budget, not a guarantee that every denomination is a purchasable plan. Electricity rows explicitly warn that the meter can impose a lower maximum. Final quote validation is still authoritative.

UI cards use selected platform currency. Expandable details use the destination currency, with separate provider and available amounts. Country details refresh every 30 seconds while visible; failed refreshes show a retry instead of claiming stale availability. Kenya is disabled/coming soon; Uganda TV/electricity are disabled. The eSIM card discloses its unchanged per-order ceiling and no BVN requirement. No new country, token or settlement rail is activated.

Limits API uses USD fields; older NGN-only limit readers must update. Legacy NGN config fields are retained for configuration compatibility but no longer define bill spending policy. Native source files were synced through the existing source-policy allowlist.

## Validation

New deterministic tests cover exact micro-unit ceilings, concurrency, preserved quote values, fee separation, shared NG/UG spending, combined other-bill spending, Lagos reset, provider bounds, fresh FX, Uganda supplier conversion and exhausted allowance. Existing bill store, handler, client, meter and Uganda provider tests passed. Browser checks cover Basic/Advanced green badges, selected USD/NGN/UGX, Nigeria/UGX detail selection, 320/390 widths and light/dark layouts. Focused web/native TypeScript checks passed. Native build and live Pixel verification follow release below.
