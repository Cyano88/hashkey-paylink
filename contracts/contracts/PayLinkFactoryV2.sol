// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20Min {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

interface IPayLinkFactory {
    function USDC() external view returns (address);
}

/**
 * @title  GhostVaultV2
 * @notice Ephemeral CREATE2 vault. Constructor sweeps both ERC-20 token AND
 *         native token (HSK / ETH) to the factory in one atomic step.
 *
 *  - ERC-20 sweep: skipped when factory.USDC() == address(0) (e.g. HashKey
 *    before ERC-20 USDC is available).
 *  - Native sweep: always attempted; no-op if balance is zero.
 *  - receive() allows the vault to accept native token sent before deployment.
 *
 *  Only address(factory) is encoded in the init code → init code hash is
 *  identical on every chain where the factory sits at the same address.
 */
contract GhostVaultV2 {
    constructor(address factory) {
        // ── ERC-20 sweep (USDC on Base / Arc) ─────────────────────────────────
        address token = IPayLinkFactory(factory).USDC();
        if (token != address(0)) {
            uint256 bal = IERC20Min(token).balanceOf(address(this));
            if (bal > 0) IERC20Min(token).transfer(factory, bal);
        }

        // ── Native token sweep (HSK on HashKey, ETH on Ethereum) ──────────────
        uint256 nativeBal = address(this).balance;
        if (nativeBal > 0) {
            (bool ok,) = factory.call{value: nativeBal}("");
            require(ok, "GhostVault: native transfer failed");
        }
    }

    /// @dev Required so the vault can hold native token sent before deployment.
    receive() external payable {}
}

/**
 * @title  PayLinkFactoryV2
 * @notice Stateless payment router supporting both ERC-20 (USDC on Base/Arc)
 *         and native token (HSK on HashKey) via CREATE2 ghost addresses.
 *
 * ── ERC-20 flow (Base / Arc) ──────────────────────────────────────────────────
 *  1. getVaultAddress(linkId, recipient) → share address.
 *  2. Payer sends USDC to vault.
 *  3. Relayer calls relay(linkId, recipient, gasReimbUsdc).
 *
 * ── Native token flow (HashKey) ───────────────────────────────────────────────
 *  1. getVaultAddress(linkId, recipient) → same formula, same address.
 *  2. Payer sends HSK to vault.
 *  3. Relayer calls relayNative(linkId, recipient, gasReimbNative).
 *
 * ── Cross-chain determinism ───────────────────────────────────────────────────
 *  Constructor takes only (treasury, relayer) — no token address. USDC is set
 *  post-deployment via setUSDC() (once, by owner). Constructor bytecode is
 *  therefore identical on every EVM chain. Deployed via Nick's Method:
 *  0x4e59b44847b379578588920cA78FbF26c0B4956C → same address everywhere.
 *
 * ── Fee model ─────────────────────────────────────────────────────────────────
 *  Both relay() and relayNative() apply the same 0.2% platform fee.
 *  Gas reimbursement is capped: 1 USDC for ERC-20, 0.01 native for HSK/ETH.
 */
contract PayLinkFactoryV2 {

    // ─── State ────────────────────────────────────────────────────────────────
    address public immutable TREASURY;

    address public USDC;       // set once via setUSDC(); zero on chains without ERC-20 USDC
    address public relayer;
    address public owner;

    // ─── Constants ────────────────────────────────────────────────────────────
    uint16  public constant FEE_BPS              = 20;            // 0.2 %
    uint256 public constant MAX_GAS_REIMB        = 1_000_000;     // 1.00 USDC  (6 decimals)
    uint256 public constant MAX_NATIVE_GAS_REIMB = 0.01 ether;    // 0.01 HSK / ETH (18 decimals)

    // ─── Events ───────────────────────────────────────────────────────────────
    event PaymentRelayed(
        bytes32 indexed linkId,
        address indexed recipient,
        uint256 payout,
        uint256 platformFee,
        uint256 gasReimb
    );
    event NativePaymentRelayed(
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

    // ─── Constructor ──────────────────────────────────────────────────────────
    constructor(address _treasury, address _relayer, address _owner) {
        require(_treasury != address(0), "V2: zero treasury");
        require(_relayer  != address(0), "V2: zero relayer");
        require(_owner    != address(0), "V2: zero owner");
        TREASURY = _treasury;
        relayer  = _relayer;
        owner    = _owner;
    }

    /// @dev Accept native token swept from GhostVaultV2 during relayNative().
    receive() external payable {}

    // ─── One-time token config ────────────────────────────────────────────────

    function setUSDC(address _usdc) external onlyOwner {
        require(USDC  == address(0), "V2: token already set");
        require(_usdc != address(0), "V2: zero token");
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

    function rescueNative(uint256 amount) external onlyOwner {
        (bool ok,) = owner.call{value: amount}("");
        require(ok, "V2: native rescue failed");
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

    // ─── ERC-20 relay (Base / Arc) ────────────────────────────────────────────

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

    // ─── Native token relay (HashKey / ETH chains) ───────────────────────────

    /**
     * @notice Deploy the ghost vault and split the HSK (or ETH) it holds.
     * @param linkId           Same linkId used for getVaultAddress().
     * @param recipient        Payment destination — must be payable.
     * @param gasReimbNative   Relayer gas cost in native token (wei). Capped at
     *                         MAX_NATIVE_GAS_REIMB. Passed as 0 if not reimbursed.
     */
    function relayNative(
        bytes32        linkId,
        address payable recipient,
        uint256        gasReimbNative
    ) external onlyRelayer returns (uint256 payout) {
        uint256 gasReimb  = gasReimbNative > MAX_NATIVE_GAS_REIMB
                                ? MAX_NATIVE_GAS_REIMB
                                : gasReimbNative;
        uint256 balBefore = address(this).balance;

        new GhostVaultV2{salt: _salt(linkId, recipient)}(address(this));

        uint256 total = address(this).balance - balBefore;
        require(total > 0, "V2: vault was empty");

        uint256 platformFee = (total * FEE_BPS) / 10_000;
        if (platformFee + gasReimb >= total) gasReimb = 0;

        payout = total - platformFee - gasReimb;
        require(payout > 0, "V2: payout is zero");

        (bool ok1,) = TREASURY.call{value: platformFee + gasReimb}("");
        require(ok1, "V2: treasury transfer failed");

        (bool ok2,) = recipient.call{value: payout}("");
        require(ok2, "V2: recipient transfer failed");

        emit NativePaymentRelayed(linkId, recipient, payout, platformFee, gasReimb);
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
