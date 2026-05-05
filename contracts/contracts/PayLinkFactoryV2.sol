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
 * @notice Minimal factory interface so GhostVaultV2 can read USDC at runtime.
 */
interface IPayLinkFactory {
    function USDC() external view returns (address);
}

/**
 * @title  GhostVaultV2
 * @notice Ephemeral contract deployed via CREATE2. Its constructor immediately
 *         sweeps its entire USDC balance to the factory. Because the address is
 *         deterministically pre-computable, a payer can send USDC from any
 *         source (CEX, cold wallet, browser wallet) *before* this contract
 *         is ever deployed — funds sit safely until `relay()` is called.
 *
 * @dev    Only the factory address is ABI-encoded into the init code. USDC is
 *         read from the factory at construction time, so the same init code hash
 *         is produced on every EVM chain — enabling identical vault addresses
 *         across Base, Arc, HashKey, Arbitrum, and any future chain.
 */
contract GhostVaultV2 {
    constructor(address factory) {
        address usdc = IPayLinkFactory(factory).USDC();
        uint256 bal  = IERC20Min(usdc).balanceOf(address(this));
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
 *
 * ── Cross-chain determinism ───────────────────────────────────────────────────
 *  GhostVaultV2 init code encodes only `address(this)` (the factory). The USDC
 *  address is resolved at vault-construction time via IPayLinkFactory(factory).USDC().
 *  When this factory is deployed via Nick's Method (CREATE2 singleton factory
 *  0x4e59b44847b379578588920cA78FbF26c0B4956C) with the same salt, it lands at
 *  the identical address on every EVM chain → vault addresses are identical too.
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
     */
    function relay(
        bytes32 linkId,
        address recipient,
        uint256 gasReimbUsdc
    ) external onlyRelayer returns (uint256 payout) {
        uint256 gasReimb = gasReimbUsdc > MAX_GAS_REIMB ? MAX_GAS_REIMB : gasReimbUsdc;

        uint256 balBefore = IERC20Min(USDC).balanceOf(address(this));
        new GhostVaultV2{salt: _salt(linkId, recipient)}(address(this));
        uint256 total = IERC20Min(USDC).balanceOf(address(this)) - balBefore;

        require(total > 0, "V2: vault was empty");

        uint256 platformFee = (total * FEE_BPS) / 10_000;

        if (platformFee + gasReimb >= total) gasReimb = 0;

        payout = total - platformFee - gasReimb;
        require(payout > 0, "V2: payout is zero");

        IERC20Min(USDC).transfer(TREASURY, platformFee + gasReimb);
        IERC20Min(USDC).transfer(recipient, payout);

        emit PaymentRelayed(linkId, recipient, payout, platformFee, gasReimb);
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _salt(bytes32 linkId, address recipient) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(linkId, recipient));
    }

    /**
     * @dev Only `address(this)` is encoded — not USDC. This makes the init code
     *      hash identical on every chain where this factory sits at the same address,
     *      which in turn makes vault addresses identical cross-chain.
     */
    function _initCode() internal view returns (bytes memory) {
        return abi.encodePacked(
            type(GhostVaultV2).creationCode,
            abi.encode(address(this))
        );
    }
}
