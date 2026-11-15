# Personal transfer allowances and currency display

Approved policy: Basic USD 50 equivalent daily; Advanced USD 7,000 equivalent daily. This supersedes the old NGN 50,000 personal allowance and unconfigured Advanced ceiling. The USD 7,000 purchase ledger remains separate, as do bill allowances and marketplace earnings withdrawals.

Personal reservations store exact six-decimal USD units from the trusted provider funding quote. Local currency remains part of the immutable payment binding. KYC upgrades retain previous spending; changing the value of an existing reservation requires a new payment. Provider quotes and display conversions can refresh without rewriting historical usage. Preview checks use live provider capacity; payout execution retains provider-order validation.

Legacy active reservations are valued from their original canonical provider orders, matching the stored provider order ID when present. Missing or mismatched evidence fails closed. Uncertain submitted failures stay reserved; confirmed refunds and unsubmitted cancellations retain existing release behavior. The existing Uganda effective-payment-level mapping is unchanged; no public route gate is enabled.

The limits API now exposes canonical USD allowance fields. New clients reject old NGN-only responses rather than displaying the previous approximately USD 35 policy. Legacy NGN configuration fields remain in the KYC flow metadata for older clients; enforcement uses the new USD policy.

Pocket displays the selected platform currency (USD, NGN or UGX), refreshes rate estimates and allowances every 30 seconds while appropriate, and shows available per transfer as the lower of remaining allowance and provider capacity. Basic users see the Advanced upgrade path; Advanced users see their active status. Bills retain their NGN source policy. Developer compliance documentation reflects the new policy.

Validation: transfer smoke tests cover exact caps, concurrent reservations, upgrades, idempotency, frozen valuations, legacy migration, provider-capacity changes, refunds, cross-currency totals and Lagos midnight. Browser fixtures cover Basic/Advanced, USD/NGN/UGX, 320/390 widths, light/dark, error recovery and checkout verification. Focused web and native TypeScript checks passed. Native debug build passed. Live account read confirmed Advanced verification in Nigeria. No payment, KYC submission or email was made by these checks.

Deployment and final device verification are recorded after release below.
