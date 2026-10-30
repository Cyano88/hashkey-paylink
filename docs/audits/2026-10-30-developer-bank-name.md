# Developer bank account name lookup

NGN receiving-account settings now resolve the account name automatically after a bank and a 10-digit account number are entered. The name is read-only; a shimmer appears during the debounced lookup and failures offer retry. Bank/account changes immediately hide prior results; aborted or late responses cannot replace the current name. Saved verified names remain visible when the number is masked.

The authenticated POST verify-bank-account action requires an owned active project, a listed Nigerian bank and exactly ten digits, and uses the existing Paycrest account resolver. The lookup does not save payout settings, activate settlement, grant KYC/KYB or send funds. Account numbers stay in the POST body rather than URLs. Saving independently repeats provider verification. NGN saves no longer fall back to manually supplied names when the provider returns no name or only OK. Uganda's existing registered-name flow remains unchanged.

Validation: developer-bank-name-browser-smoke passes incomplete-input suppression, read-only display, shimmer, bank/number invalidation, stale-response isolation, failure/retry and lookup-only calls. developer-local-settlement-smoke passes owner isolation, provider-name truth, no lookup persistence, invalid-input/provider rejection, no-name save rejection, and existing Uganda settlement/quote regressions. Updated the settlement fixture to explicitly select a personal profile for KYC checks; separate business-policy quote fixtures avoid calling live personal KYC.

The existing live Chrome form has unsaved changes and must not be refreshed or saved by this task. Live lookup will be tested separately.
