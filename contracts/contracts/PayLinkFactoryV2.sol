// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @notice Minimal ERC-20 interface — only the surface we use.
 */
interface IERC20Min {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

/**
 * @title  GhostVaultV2
 * @notice Ephemeral contract deployed via CREATE2. Its constructor immediately
 *         sweeps its entire USDC balance to the factory. Because the address is
 *         deterministically pre-computable, a payer can send USDC from any
 *         source (CEX, cold wallet, browser wallet) *before* this contract
 *         is ever deployed — funds sit safely until `relay()` is called.
 *
 * @dev    Constructor args (usdc, factory) are ABI-encoded into the init code
 *         so every (linkId, recipient) pair produces a unique salt and therefore
 *         a unique pre-computed address.
 */
contract GhostVaultV2 {
    constructor(address usdc, address factory) {
        uint256 bal = IERC20Min(usdc).balanceOf(address(this));
        if (bal > 0) IERC20Min(usdc).transfer(factory, bal);
    }
}

/**
 * @title  PayLinkFactoryV2
 * @notice Stateless USDC payment router that uses CREATE2 ghost addresses.
 *
 * ── Flow ──────────────────────────────────────────────────────────────────────
 *  1. Off-chain: `getVaultAddress(linkId, recipient)` → share this as the
 *     "Direct Send" address in the PayLink UI.
 *  2. Payer sends USDC to that address (any amount, any time, any source).
 *  3. Trusted relayer calls `relay(linkId, recipient, gasReimbUsdc)`:
 *       a. Deploys GhostVaultV2 via CREATE2 → constructor sweeps USDC to factory.
 *       b. Factory performs an atomic 3-way split:
 *            ┌─────────────────────────────┬──────────────────────────────────┐
 *            │  Platform fee (0.5 %)       │ → TREASURY (cold wallet)         │
 *            │  Gas reimbursement (capped) │ → TREASURY (keeps relayer fueled)│
 *            │  Remainder                  │ → recipient                      │
 *            └─────────────────────────────┴──────────────────────────────────┘
 *
 * ── Security ──────────────────────────────────────────────────────────────────
 *  • recipient is baked into the CREATE2 salt — a wrong recipient argument
 *    produces a different (empty) vault address and the tx reverts.
 *  • relay() is restricted to the trusted relayer address.
 *  • gasReimbUsdc is hard-capped at MAX_GAS_REIMB; excess is waived rather
 *    than ever over-charging the recipient.
 *  • Salt consumption: once relay() succeeds, a second call for the same
 *    (linkId, recipient) reverts on CREATE2 collision — double-relay is blocked.
 *  • No upgradeable proxy — the contract is fully immutable after deployment.
 */
contract PayLinkFactoryV2 {

    // ─── Immutable ────────────────────────────────────────────────────────────
    address public immutable USDC;
    address public immutable TREASURY;

    // ─── Mutable (owner-controlled) ───────────────────────────────────────────
    address public relayer;
    address public owner;

    // ─── Constants ───────────────────────────────────────────────────────────
    /// @notice 0.5 % platform fee in basis points.
    uint16  public constant FEE_BPS       = 50;
    /// @notice Absolute USDC cap on gas reimbursement (1.00 USDC, 6 decimals).
    ///         The backend sends a calculated value; the contract enforces the cap.
    uint256 public constant MAX_GAS_REIMB = 1_000_000;

    // ─── Events ───────────────────────────────────────────────────────────────
    event PaymentRelayed(
        bytes32 indexed linkId,
        address indexed recipient,
        uint256 payout,
        uint256 platformFee,
        uint256 gasReimb
    );
    event RelayerUpdated(address indexed previous, address indexed next);
    event OwnershipTransferred(address indexed previous, address indexed next);

    // ─── Modifiers ────────────────────────────────────────────────────────────
    modifier onlyRelayer() {
        require(msg.sender == relayer, "V2: caller is not relayer");
        _;
    }
    modifier onlyOwner() {
        require(msg.sender == owner, "V2: caller is not owner");
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────
    constructor(address _usdc, address _treasury, address _relayer) {
        require(_usdc     != address(0), "V2: zero usdc");
        require(_treasury != address(0), "V2: zero treasury");
        require(_relayer  != address(0), "V2: zero relayer");
        USDC     = _usdc;
        TREASURY = _treasury;
        relayer  = _relayer;
        owner    = msg.sender;
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    /// @notice Rotate the relayer wallet (e.g. after a key rotation).
    function setRelayer(address _relayer) external onlyOwner {
        emit RelayerUpdated(relayer, _relayer);
        relayer = _relayer;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// @notice Recover any tokens accidentally sent directly to this contract.
    function rescueTokens(address token, uint256 amount) external onlyOwner {
        IERC20Min(token).transfer(owner, amount);
    }

    // ─── View ─────────────────────────────────────────────────────────────────

    /**
     * @notice Pre-compute the ghost vault address for a (linkId, recipient) pair.
     *         Call this off-chain; share the result as the payment address.
     *         No gas cost, no on-chain state required.
     * @param linkId    Random 32-byte identifier for this PayLink.
     * @param recipient The wallet that will receive the net payment.
     * @return vault    The deterministic address that will hold the USDC deposit.
     */
    function getVaultAddress(
        bytes32 linkId,
        address recipient
    ) public view returns (address vault) {
        bytes32 salt         = _salt(linkId, recipient);
        bytes32 initCodeHash = keccak256(_initCode());
        vault = address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff),
            address(this),
            salt,
            initCodeHash
        )))));
    }

    // ─── Core ─────────────────────────────────────────────────────────────────

    /**
     * @notice Deploy the ghost vault for (linkId, recipient) and atomically
     *         perform the 3-way USDC split.
     *
     * @param linkId        The same linkId used when generating the vault address.
     * @param recipient     The same recipient used when generating the vault address.
     * @param gasReimbUsdc  Estimated gas cost in USDC (6 decimals).
     *                      Capped internally at MAX_GAS_REIMB.
     *                      If the payment is too small to cover fees, the gas
     *                      reimbursement is waived to protect the recipient.
     * @return payout       Net USDC (6 decimals) transferred to recipient.
     */
    function relay(
        bytes32 linkId,
        address recipient,
        uint256 gasReimbUsdc
    ) external onlyRelayer returns (uint256 payout) {
        // Apply hard cap on gas reimbursement.
        uint256 gasReimb = gasReimbUsdc > MAX_GAS_REIMB ? MAX_GAS_REIMB : gasReimbUsdc;

        // Deploy GhostVaultV2 — constructor sweeps its USDC balance to address(this).
        uint256 balBefore = IERC20Min(USDC).balanceOf(address(this));
        new GhostVaultV2{salt: _salt(linkId, recipient)}(USDC, address(this));
        uint256 total = IERC20Min(USDC).balanceOf(address(this)) - balBefore;

        require(total > 0, "V2: vault was empty");

        uint256 platformFee = (total * FEE_BPS) / 10_000;

        // Safety: if fees would exceed the payment, waive gas reimb.
        if (platformFee + gasReimb >= total) gasReimb = 0;

        payout = total - platformFee - gasReimb;
        require(payout > 0, "V2: payout is zero");

        // Treasury receives platform fee + gas reimbursement.
        IERC20Min(USDC).transfer(TREASURY, platformFee + gasReimb);
        // Recipient receives the net payout.
        IERC20Min(USDC).transfer(recipient, payout);

        emit PaymentRelayed(linkId, recipient, payout, platformFee, gasReimb);
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _salt(bytes32 linkId, address recipient) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(linkId, recipient));
    }

    function _initCode() internal view returns (bytes memory) {
        return abi.encodePacked(
            type(GhostVaultV2).creationCode,
            abi.encode(USDC, address(this))
        );
    }
}
