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
 * @notice Minimal factory interface so GhostVaultV2 can read the token at runtime.
 */
interface IPayLinkFactory {
    function USDC() external view returns (address);
}

/**
 * @title  GhostVaultV2
 * @notice Ephemeral contract deployed via CREATE2. Its constructor immediately
 *         sweeps its entire token balance to the factory. Because the address is
 *         deterministically pre-computable, a payer can send tokens from any
 *         source (CEX, cold wallet, browser wallet) *before* this contract
 *         is ever deployed — funds sit safely until `relay()` is called.
 *
 * @dev    Only the factory address is ABI-encoded into the init code. The token
 *         (USDC) is read from the factory at construction time, so the init code
 *         hash is IDENTICAL on every EVM chain where the factory sits at the same
 *         address — enabling universal vault addresses across Base, Arc, HashKey,
 *         Arbitrum, and any future chain.
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
 * @notice Stateless token payment router using CREATE2 ghost addresses.
 *
 * ── Flow ──────────────────────────────────────────────────────────────────────
 *  1. Off-chain: `getVaultAddress(linkId, recipient)` → share as "Direct Send".
 *  2. Payer sends tokens to that address (any amount, any time, any source).
 *  3. Trusted relayer calls `relay(linkId, recipient, gasReimbUsdc)`:
 *       a. Deploys GhostVaultV2 → constructor sweeps token balance to factory.
 *       b. Atomic 3-way split:
 *            platform fee (0.5 %) → TREASURY
 *            gas reimbursement    → TREASURY
 *            remainder            → recipient
 *
 * ── Cross-chain determinism ───────────────────────────────────────────────────
 *  The constructor takes only (treasury, relayer) — no token address. The token
 *  is set AFTER deployment via setUSDC() (callable once, by owner).
 *
 *  Because the constructor args are chain-agnostic (treasury and relayer are the
 *  same wallet addresses on every chain), Nick's Method produces the IDENTICAL
 *  factory address on Base, Arc, HashKey, Arbitrum, and any future EVM chain.
 *
 *  Vault addresses are therefore also identical across all chains for the same
 *  (linkId, recipient) pair — enabling reliable wrong-chain recovery.
 *
 *  Deployment sequence per chain:
 *    1. Deploy via Nick's Method → same factory address everywhere.
 *    2. Call setUSDC(chain_token_address) — locked after first call.
 *    3. Optionally call setRelayer(chain_relayer) if relayer differs per chain.
 *
 * ── Security ──────────────────────────────────────────────────────────────────
 *  • recipient is baked into the CREATE2 salt.
 *  • relay() is restricted to the trusted relayer.
 *  • relay() reverts until setUSDC() has been called.
 *  • gasReimbUsdc capped at MAX_GAS_REIMB.
 *  • Double-relay blocked by CREATE2 collision.
 *  • No upgradeable proxy — immutable after deployment.
 */
contract PayLinkFactoryV2 {

    // ─── State ────────────────────────────────────────────────────────────────
    address public immutable TREASURY;

    address public USDC;      // set once via setUSDC(); zero until then
    address public relayer;
    address public owner;

    // ─── Constants ───────────────────────────────────────────────────────────
    uint16  public constant FEE_BPS       = 50;          // 0.5 %
    uint256 public constant MAX_GAS_REIMB = 1_000_000;   // 1.00 USDC (6 dec)

    // ─── Events ───────────────────────────────────────────────────────────────
    event PaymentRelayed(
        bytes32 indexed linkId,
        address indexed recipient,
        uint256 payout,
        uint256 platformFee,
        uint256 gasReimb
    );
    event USDCConfigured(address indexed token);
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

    // ─── Constructor ─────────────────────────────────────────────────────────
    /**
     * @param _treasury Cold wallet receiving platform fees.
     * @param _relayer  Trusted backend wallet calling relay().
     *
     * No token address here — set post-deployment via setUSDC() so this
     * constructor produces identical bytecode on every EVM chain.
     */
    constructor(address _treasury, address _relayer) {
        require(_treasury != address(0), "V2: zero treasury");
        require(_relayer  != address(0), "V2: zero relayer");
        TREASURY = _treasury;
        relayer  = _relayer;
        owner    = msg.sender;
    }

    // ─── One-time token configuration ────────────────────────────────────────

    /**
     * @notice Set the payment token for this chain. Can only be called once.
     *         Called immediately after deployment on each chain with the
     *         chain-specific USDC (or equivalent ERC-20) address.
     */
    function setUSDC(address _usdc) external onlyOwner {
        require(USDC    == address(0), "V2: token already set");
        require(_usdc   != address(0), "V2: zero token");
        USDC = _usdc;
        emit USDCConfigured(_usdc);
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function setRelayer(address _relayer) external onlyOwner {
        emit RelayerUpdated(relayer, _relayer);
        relayer = _relayer;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function rescueTokens(address token, uint256 amount) external onlyOwner {
        IERC20Min(token).transfer(owner, amount);
    }

    // ─── View ─────────────────────────────────────────────────────────────────

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

    function relay(
        bytes32 linkId,
        address recipient,
        uint256 gasReimbUsdc
    ) external onlyRelayer returns (uint256 payout) {
        require(USDC != address(0), "V2: token not configured");

        uint256 gasReimb  = gasReimbUsdc > MAX_GAS_REIMB ? MAX_GAS_REIMB : gasReimbUsdc;
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

    function _initCode() internal view returns (bytes memory) {
        return abi.encodePacked(
            type(GhostVaultV2).creationCode,
            abi.encode(address(this))
        );
    }
}
