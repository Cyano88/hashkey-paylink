# Optional receiving-wallet recovery

The developer enable button called the full Pocket reconnect/bootstrap controller.
Additional-network alignment selected a wallet matching the Base anchor, then
refused activation when an unlinked original Ethereum/Polygon wallet also existed.
That produced the reported Restore your existing wallet / HTTP 500 response.

The developer button now uses a receiving-only adapter. Existing server-linked
wallets are ownership-checked and returned without alignment. If a link is missing,
the provider inventory must contain exactly one valid original LIVE SCA wallet;
replacement candidates are excluded. Recovery uses compare-and-set link storage.
Ambiguous or truncated inventories fail with a 409 and a support message. No
migration, balance movement or arbitrary newest-wallet selection is performed.
The existing Pocket default request path is unchanged. No APK is rebuilt/installed.

The handler fixture reproduces an original wallet plus a matching replacement
candidate, then verifies original restoration, repeat reuse, authentication and
concurrent-link failure. Inventory tests cover Ethereum and Polygon, duplicates,
invalid states/types and truncated lists. Browser fixtures verify optional setup,
no mount-time provisioning, owner email, cancellation/retry, duplicate clicks,
existing wallets and preservation of typed custom receiving addresses.

This is fixture verification of the reported condition, not confirmation of a
successful retry by the affected real user. No production wallet links or funds
are changed by these tests.
