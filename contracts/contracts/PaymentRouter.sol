// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title  PaymentRouter
 * @notice Stateless payment splitter deployed per-recipient by PaymentRouterFactory.
 *         Forwards all incoming funds immediately — never holds a balance.
 *
 * Flows supported:
 *  A) Native token (ETH / HSK): send directly → receive() fires → instant split.
 *  B) ERC-20 (USDC): send to this address → call sweep(token) to trigger split.
 *     Anyone may call sweep(); funds still go to recipient + treasury.
 *
 * Security:
 *  - ReentrancyGuard on all state-changing paths.
 *  - Solidity ^0.8.x arithmetic (built-in overflow protection).
 *  - Stateless: recipient + treasury are immutable; no stored user funds.
 *  - Every split emits PaymentRouted for on-chain traceability.
 */
contract PaymentRouter is ReentrancyGuard {

    // ─── Immutable config ────────────────────────────────────────────────────
    address public immutable recipient;
    address public immutable treasury;

    uint256 public constant FEE_BPS        = 20;      // 0.2 %
    uint256 public constant BPS_DENOMINATOR = 10_000;

    // ─── Events ──────────────────────────────────────────────────────────────
    /**
     * @dev Emitted on every successful split so every payment is publicly
     *      traceable on the chain explorer.
     * @param token           ERC-20 token address, or address(0) for native.
     * @param sender          msg.sender who triggered the route.
     * @param recipientAmount Amount forwarded to the payee.
     * @param treasuryAmount  Platform fee forwarded to treasury.
     */
    event PaymentRouted(
        address indexed token,
        address indexed sender,
        uint256 recipientAmount,
        uint256 treasuryAmount
    );

    // ─── Constructor ─────────────────────────────────────────────────────────
    constructor(address _recipient, address _treasury) {
        require(_recipient != address(0), "PaymentRouter: zero recipient");
        require(_treasury  != address(0), "PaymentRouter: zero treasury");
        recipient = _recipient;
        treasury  = _treasury;
    }

    // ─── Native token ─────────────────────────────────────────────────────────
    /**
     * @notice Accepts and routes native token (ETH / HSK) sent directly.
     *         Triggered automatically on plain sends (e.g. MetaMask, Binance).
     */
    receive() external payable nonReentrant {
        _routeNative(msg.value);
    }

    // ─── ERC-20 sweep ─────────────────────────────────────────────────────────
    /**
     * @notice Routes any ERC-20 balance held by this contract.
     *         Call this after sending tokens here (transfer from exchange, wallet, etc.).
     *         Anyone may call — funds always route to recipient + treasury.
     * @param token The ERC-20 contract address to sweep (e.g. USDC).
     */
    function sweep(address token) external nonReentrant {
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > 0, "PaymentRouter: nothing to sweep");
        _routeERC20(token, balance);
    }

    // ─── Internal routing ─────────────────────────────────────────────────────
    function _routeNative(uint256 total) internal {
        uint256 fee    = (total * FEE_BPS) / BPS_DENOMINATOR;
        uint256 payout = total - fee;

        // solhint-disable-next-line avoid-low-level-calls
        (bool ok1,) = recipient.call{value: payout}("");
        require(ok1, "PaymentRouter: recipient transfer failed");

        // solhint-disable-next-line avoid-low-level-calls
        (bool ok2,) = treasury.call{value: fee}("");
        require(ok2, "PaymentRouter: treasury transfer failed");

        emit PaymentRouted(address(0), msg.sender, payout, fee);
    }

    function _routeERC20(address token, uint256 total) internal {
        uint256 fee    = (total * FEE_BPS) / BPS_DENOMINATOR;
        uint256 payout = total - fee;

        require(
            IERC20(token).transfer(recipient, payout),
            "PaymentRouter: recipient transfer failed"
        );
        require(
            IERC20(token).transfer(treasury, fee),
            "PaymentRouter: treasury transfer failed"
        );

        emit PaymentRouted(token, msg.sender, payout, fee);
    }
}
