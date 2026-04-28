// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ── PoA Settlement Contract ───────────────────────────────────────────────────
//
// Settles Proof-of-Attention ghost-vault signatures.
// The creator submits a viewer's EIP-712 SessionIntent signature;
// this contract verifies it and pulls USDC from the viewer to the creator.
//
// Prerequisites for settlement:
//   1. Viewer must have called USDC.approve(address(this), amount) — done
//      by the StreamGate UI at session start (the "Session Spending Limit").
//   2. The relayer must call settle() on behalf of the creator.
//
// Deploy on Arc Testnet (chainId 5042002), then set ARC_POA_CONTRACT in Render.
// ─────────────────────────────────────────────────────────────────────────────

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
}

contract PoASettlement {

    // ── Constants ─────────────────────────────────────────────────────────────

    address public constant USDC = 0x3600000000000000000000000000000000000000;

    bytes32 private constant DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );

    bytes32 private constant SESSION_INTENT_TYPEHASH = keccak256(
        "SessionIntent(address viewer,address creator,bytes32 contentId,uint256 amount,uint256 nonce,uint256 deadline)"
    );

    // ── State ─────────────────────────────────────────────────────────────────

    bytes32 public immutable DOMAIN_SEPARATOR;

    // settled[viewer][contentId] = highest USDC amount (raw) settled so far.
    // Incremental settlement: each new settle() call pays only the delta.
    mapping(address => mapping(bytes32 => uint256)) public settled;

    // ── Events ────────────────────────────────────────────────────────────────

    event Settled(
        address indexed viewer,
        address indexed creator,
        bytes32 indexed contentId,
        uint256 netAmount,    // USDC transferred this call
        uint256 totalSettled  // cumulative USDC for this viewer×content pair
    );

    // ── Constructor ───────────────────────────────────────────────────────────

    constructor() {
        DOMAIN_SEPARATOR = keccak256(abi.encode(
            DOMAIN_TYPEHASH,
            keccak256(bytes("ArcPoA")),
            keccak256(bytes("1")),
            block.chainid,
            address(this)
        ));
    }

    // ── Settlement ────────────────────────────────────────────────────────────

    /**
     * @notice Settle a viewer's cumulative PoA intent.
     * @dev    Verifies the EIP-712 signature, then pulls the incremental USDC
     *         delta (amount - already settled) from viewer to creator.
     *
     * @param viewer     Viewer's Arc wallet address (signed the intent)
     * @param creator    Creator's Arc wallet address (receives USDC)
     * @param contentId  Content identifier (bytes32)
     * @param amount     Cumulative USDC amount viewer authorised (6 decimals)
     * @param nonce      Replay nonce from the viewer's ghost vault
     * @param deadline   Unix timestamp after which the sig is invalid
     * @param sig        65-byte EIP-712 signature from the viewer's wallet
     */
    function settle(
        address  viewer,
        address  creator,
        bytes32  contentId,
        uint256  amount,
        uint256  nonce,
        uint256  deadline,
        bytes calldata sig
    ) external {
        require(block.timestamp <= deadline,          "PoA: intent expired");
        require(amount > settled[viewer][contentId],  "PoA: not incremental");
        require(sig.length == 65,                     "PoA: bad sig length");

        // ── Recover signer ───────────────────────────────────────────────────
        bytes32 structHash = keccak256(abi.encode(
            SESSION_INTENT_TYPEHASH,
            viewer,
            creator,
            contentId,
            amount,
            nonce,
            deadline
        ));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));

        bytes32 r;
        bytes32 s;
        uint8   v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (v < 27) v += 27;

        address signer = ecrecover(digest, v, r, s);
        require(signer != address(0) && signer == viewer, "PoA: invalid signature");

        // ── Incremental pull ─────────────────────────────────────────────────
        uint256 netAmount = amount - settled[viewer][contentId];
        settled[viewer][contentId] = amount;

        require(
            IERC20(USDC).transferFrom(viewer, creator, netAmount),
            "PoA: USDC transfer failed — viewer must approve this contract first"
        );

        emit Settled(viewer, creator, contentId, netAmount, amount);
    }

    // ── View helpers ──────────────────────────────────────────────────────────

    /**
     * @notice How much USDC has been settled for a viewer × content pair.
     */
    function settledAmount(address viewer, bytes32 contentId)
        external view returns (uint256)
    {
        return settled[viewer][contentId];
    }

    /**
     * @notice How much USDC the viewer has approved this contract to spend.
     *         Useful for the frontend to check allowance before calling settle().
     */
    function viewerAllowance(address viewer) external view returns (uint256) {
        return IERC20(USDC).allowance(viewer, address(this));
    }
}
