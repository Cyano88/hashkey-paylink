# Pocket regional identity foundation

## Shipped scope

The server owns the verification policy. New attempts pin country, provider and policy version; existing records without metadata retain their original Nigeria/Smile interpretation. The app obtains ID selection and consent settings from the server. Country here means the verification jurisdiction; it is not inferred citizenship, residence, IP location or payment eligibility.

Nigeria retains the existing Smile flow and separate production rollout guard. Kenya and Rwanda are explicit planned configurations, rejected before any verification job or provider session is created. Unknown provider/policy metadata cannot grant current Nigerian POS eligibility. A result country must match the recorded attempt policy. The client cannot select its own provider.

Government-ID limit upgrades are planned, not enabled by passing this identity flow. No spending limit, bank payout, mobile-money or currency capability is enabled by this change. Sumsub is a potential provider in the model, not an implemented adapter.

## Next country launch work

1. Compare Smile and Sumsub on the exact documents, authority checks, liveness, sandbox fixtures, production permissions, review handling and commercial terms needed for each country.
2. Implement a provider adapter and versioned country policy with authenticated result normalization. Retain original provider/policy routing for pending and historical attempts; never send an existing job to another provider.
3. Track identity approval separately from government-ID checks required for higher limits. Define those requirements with payment partners before enabling upgrades.
4. Add explicit residence/market onboarding and separate KES/RWF currencies, payment methods, recipient validation, settlement, fees, limits and notifications. Do not reuse Nigerian NGN/bills/POS permissions for another country.
5. Run sandbox acceptance for success, review, rejection, replay, wrong country, duplicate submission and provider outage. Enable production per country only after partner and operational readiness.

## Verification

API regression tests cover authentication, job ownership, signed callbacks, sandbox isolation, legacy records, country launch gates, country-bound resume and wrong-country success rejection. Browser tests verify that the existing Nigeria flow receives its ID/consent selection from the session policy and retains clear result states.
