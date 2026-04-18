// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./PaymentRouter.sol";

/**
 * @title  PaymentRouterFactory
 * @notice Deploys deterministic PaymentRouter contracts via CREATE2.
 *
 * Every recipient gets a unique, predictable router address derived solely from
 * their wallet address. The address can be computed off-chain before deployment
 * so PayLinks show the correct address immediately.
 *
 * Deployment workflow:
 *  1. Off-chain: call getRouterAddress(recipient) → show this in the PayLink.
 *  2. On first payment (or pre-emptively): call deployRouter(recipient).
 *  3. Payer sends USDC to that address.
 *  4. Anyone calls router.sweep(usdcAddress) to trigger the split.
 *     For native tokens, the split is automatic on send.
 *
 * Security:
 *  - deployRouter is idempotent: safe to call multiple times.
 *  - treasury is immutable after factory construction.
 *  - Solidity ^0.8.x (overflow protection).
 */
contract PaymentRouterFactory {

    address public immutable treasury;

    event RouterDeployed(address indexed recipient, address indexed router);

    constructor(address _treasury) {
        require(_treasury != address(0), "Factory: zero treasury");
        treasury = _treasury;
    }

    // ─── Deploy ───────────────────────────────────────────────────────────────
    /**
     * @notice Deploy a PaymentRouter for `recipient`. Idempotent — returns
     *         the existing router if already deployed.
     */
    function deployRouter(address recipient) external returns (address router) {
        require(recipient != address(0), "Factory: zero recipient");
        bytes32 salt     = _salt(recipient);
        bytes memory bc  = _bytecode(recipient);

        address predicted = _predict(salt, keccak256(bc));
        if (predicted.code.length > 0) return predicted; // already live

        assembly {
            router := create2(0, add(bc, 32), mload(bc), salt)
        }
        require(router != address(0), "Factory: deploy failed");
        emit RouterDeployed(recipient, router);
    }

    // ─── Predict ──────────────────────────────────────────────────────────────
    /**
     * @notice Compute the deterministic router address for `recipient`
     *         without deploying. Use this off-chain to pre-fill PayLinks.
     */
    function getRouterAddress(address recipient) external view returns (address) {
        return _predict(_salt(recipient), keccak256(_bytecode(recipient)));
    }

    // ─── Internals ────────────────────────────────────────────────────────────
    function _salt(address recipient) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(recipient));
    }

    function _bytecode(address recipient) internal view returns (bytes memory) {
        return abi.encodePacked(
            type(PaymentRouter).creationCode,
            abi.encode(recipient, treasury)
        );
    }

    function _predict(bytes32 salt, bytes32 bytecodeHash) internal view returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff),
            address(this),
            salt,
            bytecodeHash
        )))));
    }
}
