// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
}

contract PoASettlement {

    address public constant USDC = 0x3600000000000000000000000000000000000000;

    bytes32 private constant DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );

    bytes32 private constant SESSION_INTENT_TYPEHASH = keccak256(
        "SessionIntent(address viewer,address creator,bytes32 contentId,uint256 amount,uint256 nonce,uint256 deadline)"
    );

    bytes32 public immutable DOMAIN_SEPARATOR;

    // settled[viewer][contentId] = highest cumulative USDC (6-dec raw) settled
    mapping(address => mapping(bytes32 => uint256)) public settled;

    event Settled(
        address indexed viewer,
        address indexed creator,
        bytes32 indexed contentId,
        uint256 netAmount,
        uint256 totalSettled
    );

    constructor() {
        DOMAIN_SEPARATOR = keccak256(abi.encode(
            DOMAIN_TYPEHASH,
            keccak256(bytes("ArcPoA")),
            keccak256(bytes("1")),
            block.chainid,
            address(this)
        ));
    }

    // ── Internal: recover EIP-712 signer ─────────────────────────────────────
    // Extracted to reduce stack depth in settle().

    function _recover(bytes32 structHash, bytes calldata sig)
        internal view returns (address)
    {
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash)
        );
        bytes32 r;
        bytes32 s;
        uint8   v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (v < 27) v += 27;
        return ecrecover(digest, v, r, s);
    }

    // ── External: settle a ghost-vault intent ─────────────────────────────────

    function settle(
        address  viewer,
        address  creator,
        bytes32  contentId,
        uint256  amount,
        uint256  nonce,
        uint256  deadline,
        bytes calldata sig
    ) external {
        require(block.timestamp <= deadline,         "PoA: intent expired");
        require(amount > settled[viewer][contentId], "PoA: not incremental");
        require(sig.length == 65,                    "PoA: bad sig length");

        bytes32 structHash = keccak256(abi.encode(
            SESSION_INTENT_TYPEHASH,
            viewer, creator, contentId, amount, nonce, deadline
        ));
        address signer = _recover(structHash, sig);
        require(signer != address(0) && signer == viewer, "PoA: invalid sig");

        uint256 net = amount - settled[viewer][contentId];
        settled[viewer][contentId] = amount;

        require(
            IERC20(USDC).transferFrom(viewer, creator, net),
            "PoA: transferFrom failed"
        );

        emit Settled(viewer, creator, contentId, net, amount);
    }

    // ── View helpers ──────────────────────────────────────────────────────────

    function settledAmount(address viewer, bytes32 contentId)
        external view returns (uint256)
    {
        return settled[viewer][contentId];
    }

    function viewerAllowance(address viewer) external view returns (uint256) {
        return IERC20(USDC).allowance(viewer, address(this));
    }
}
