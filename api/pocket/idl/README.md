# Solana router interface provenance

`okx-solana-v2.json` is a subset of the program-owned legacy Anchor IDL fetched
through the existing production Solana RPC on 2026-10-17, at slot 458024172.
It contains `swap_tob`, `create_token_account`, and their recursively referenced types.

- Program and verified IDL account owner: `proVF4pMXVaYqmy4NjniPh4pqKNfMmsihgd4wdkCX3u`
- Derived IDL address: `8wXL8gQduvMr6pmzhJnbUqsnnegJnmnPiZVPzehLjoeT`
- IDL authority: `cPabHQWcAH3PZu6qha2Tk8Zn9s1eD14GUZLb8ar2Gzs`
- Raw account SHA-256: `c858973c6d08d79abe1f34b948022adf6bf79bdf7acf68aae36c28b42b82a94d`
- Full parsed IDL JSON.stringify SHA-256: `c1f85197a5d96dd43fc2a1b981126cfe04c3eb6d2d68b3731129a259e45d54c9`

The legacy address and account layout follow
[Anchor v0.30.1](https://github.com/coral-xyz/anchor/blob/v0.30.1/ts/packages/anchor/src/idl.ts).
The account has the eight-byte Anchor discriminator, authority public key,
four-byte compressed-data length and zlib-compressed JSON.

This snapshot describes instruction layout, not deployed program behavior or
permission to sign. `inspectNativeSolanaSwap` remains inspection-only. Execution
still requires verification of all setup/cleanup instructions, account privileges,
fee semantics, simulation, approved message bytes and transaction effects.
Do not replace this snapshot with a provider-supplied schema at runtime.
