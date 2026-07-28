# Dependency security audit

Snapshot: 2026-07-28

## Remediated without breaking changes

- Updated PostCSS from `8.5.10` to `8.5.24`.
- The install also updated its `nanoid` dependency from `3.3.11` to `3.3.16`.
- This removed the PostCSS high-severity findings. The production dependency
  audit moved from 54 findings with 5 high-severity findings to 53 findings with
  4 high-severity findings.
- Development and preview servers now bind to `127.0.0.1` by default to reduce
  exposure while the Vite major-version migration remains outstanding.
- Saved LP Scout routes are normalized to same-origin absolute paths and reject
  backslashes and protocol-relative paths before reaching React Router.

## Unresolved upstream or breaking-upgrade findings

### Contracts development toolchain

`contracts/package-lock.json` is now tracked separately and bound into the Arc
Agreement review packet so the exact Hardhat, Solidity compiler, OpenZeppelin,
and test dependency tree can be reproduced. A normal, non-forced npm audit
remediation updated compatible transitive packages, including Axios, WebSocket,
YAML, URI, and form-data fixes.

The remaining contracts audit findings are development-toolchain transitive
dependencies. npm proposes breaking or invalid forced changes, including
Hardhat `0.0.7` or a major Toolbox migration. Do not use `npm audit fix --force`.
The reviewed lockfile currently reports 55 findings: 19 low, 9 moderate, and
27 high. These counts are not a clean security result; they are recorded so a
future toolchain migration can be measured against the same reproducible tree.
The contract compiler and tests must run from the reviewed lockfile in an
isolated build environment that does not process untrusted archives, YAML, or
network payloads.

### `bigint-buffer`

The vulnerable package is transitive through `@solana/spl-token` and related
Solana packages. The advisory has no patched package version. npm proposes
installing `@solana/spl-token@0.1.8`, which is a breaking downgrade and is not an
acceptable unattended fix.

The application has no direct import of `bigint-buffer`, `toBigIntLE`, or
`toBigIntBE`. Continue tracking the Solana and Circle dependency chain for a
supported removal or replacement.

Reference: https://github.com/advisories/GHSA-3gc7-fjrx-p6mg

### `elliptic`

The affected implementation is transitive through legacy ethers v5 packages
used by Polymarket clients and through browser polyfills. The advisory currently
lists no patched `elliptic` release. npm's proposed forced changes include
breaking downgrades and therefore must not be applied automatically.

Polymarket signing paths need a separate migration test before these legacy
packages can be removed. Until then, transaction signing must remain restricted
to the exact reviewed order payloads and must never accept opaque signing data.

Reference: https://github.com/advisories/GHSA-848j-6mx2-7j84

### React Router and Vite

Patched versions require major upgrades:

- React Router DOM 6 to 7.
- Vite 5 to 8.

Both migrations affect application routing, development tooling, plugins, and
browser bundles. They require isolated branches and complete UI and checkout
regressions. The same-origin route validation and loopback-only development
server defaults above are risk-reduction controls, not substitutes for those
migrations.

References:

- https://github.com/advisories/GHSA-wrjc-x8rr-h8h6
- https://github.com/advisories/GHSA-g7r4-m6w7-qqqr

## Release rule

Do not report `npm audit` as clean. Do not use `npm audit fix --force` in this
repository. Review upstream releases regularly and migrate each affected
product surface with its signing, routing, checkout, Pocket, and production
build tests intact.
