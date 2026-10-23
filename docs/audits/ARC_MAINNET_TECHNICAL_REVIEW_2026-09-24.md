# Arc Agreement mainnet technical review evidence - 2026-09-24

Scope: ArcAgreementFactory.sol and ArcAgreementEscrow.sol, official Arc mainnet USDC and an immutable managed Circle EOA operator. This is AI-assisted internal review, not an external audit or blanket production approval.

Three separate reviewer sessions covered arithmetic/access/economics/execution, invariants/periphery/first-principles/asymmetry, and boundaries/cross-function gaps. The third reviewer disclosed truncated specialty guidance; complete contract source was visible. No confirmed unprivileged theft path was identified under the stated token/operator assumptions. The review is bounded and does not prove absence of defects.

## Remediation
The constructor allowed a predicted escrow address as its own recipient. A self-transfer could leave principal in the escrow while accounting marked the payment released. No third-party victim was established, so this was treated as accounting hardening, not a demonstrated theft exploit. Added recipient != address(this). The regression failed before remediation and passed afterward, checking no payer debit and no stored escrow. A second reviewer inspected and accepted the narrow fix.

The read-only mainnet simulator now checks eth_chainId from the actual RPC response, rather than relying on the provider's configured static network.

## Validation
All 39 Agreement lifecycle, principal-conservation, deployment configuration, simulation, verifier and review-bundle tests passed under Node 22 after remediation. Regenerate the manifest, unsigned request and review bundle from the committed remediated source; the earlier unsigned payload is superseded because bytecode changed.

## Environment decision
Preserve Arc Testnet for isolated sandbox use. Live configuration must use Arc 5042, production keys and mainnet stores. The sandbox template is a configuration reference, not a claim that unsupported sandbox execution is enabled. No testnet financial history or credentials were deleted or copied to mainnet.

## Approval status
Technical review and regression evidence are complete for the scope above. The manifest remains a candidate. Independent external approval is not recorded. Deployment acceptance must be explicit and bound to the final manifest and constructor; Rabby signing remains the user's action. Activation remains separately blocked until deployed bytecode, explorer verification, API/session migration, webhook/reconciliation and bounded real-payment checks pass.

Dependency risks retained: official USDC issuer restrictions and upgrades, immutable operator availability, and real mainnet transfer behavior. Arc documentation confirms the ERC-20 and native interfaces share a balance and use six and eighteen decimals respectively: https://docs.arc.io/arc/references/contract-addresses . Mock tests and constructor simulation do not replace a bounded live settlement canary.
