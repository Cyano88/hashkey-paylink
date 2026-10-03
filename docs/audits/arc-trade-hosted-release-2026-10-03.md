# Arc Trade hosted release preparation

The source now pins the verified Trade factory, 2-of-2 Safe and reviewed Circle
v0.7 implementation used by the completed 0.10 USDC funding/refund canary.
The source-release mainnet preflight passed at confirmed/head blocks
24110585/24110590. Factory, token, Safe owners/threshold and both wallet
configurations passed checks. Existing runtime and project gates remain required.

Six focused Hash PayLink suites passed: rail terms, planner, execution, preflight,
receipt and hosted handlers. Hash PayStream Arc hosted integration and hosted
route suites passed. These tests do not substitute for a real hosted agreement.

Live configuration inspection found Hash PayStream on commit fe67705c210b1f993aa8ddaf16a033f2cd06d05f
and Hash PayLink on dccd830b435ee35c9af47e51267c1a6bd1075373.
Neither had the Arc Trade enable flag; Hash PayLink had no Trade project allowlist
and Hash PayStream had no Arc Trade key variable. The existing mainnet Arc key
resolved through the public project endpoint to live human USDC project
`dev_25f636321f644b4284` with Arc capability and a signed webhook configured.
The deployed Trade endpoint rejected scoped credentials because this release's
route integration is not deployed. Do not replace it with broader credentials.

Next: integrate changes with the current deployment branches, verify the scoped
route, configure the confirmed project's connection, then perform the lifecycle
through Hash PayStream. Hosted identity/consent, reviewer production validation
and the separate XLayer two-signer split remain outstanding.
