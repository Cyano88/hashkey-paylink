// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ECDSA}  from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

interface IERC1271 {
    function isValidSignature(bytes32 hash, bytes memory signature) external view returns (bytes4 magicValue);
}

bytes4 constant ERC1271_MAGICVALUE = 0x1626ba7e;

/**
 * @title  StreamVault
 * @notice One vault per payment stream. Deployed deterministically via CREATE2
 *         from StreamVaultFactory. Both Claim and Cancel are fully gasless —
 *         the recipient/sender signs an EIP-712 message; the Render relayer
 *         submits the transaction and pays all Arc USDC gas on their behalf.
 *
 * ── Stream lifecycle ─────────────────────────────────────────────────────────
 *  1. Factory deploys this vault with all stream params embedded as immutables.
 *  2. Sender transfers `totalAmount` of USDC to the pre-computed vault address.
 *  3. Recipient signs Claim structs off-chain; relayer calls claim().
 *  4. Sender can Cancel: vested-but-unclaimed → recipient,
 *                        unvested-and-locked  → sender refund.
 *
 * ── EIP-712 replay protection (five layers) ──────────────────────────────────
 *  1. DOMAIN_SEPARATOR includes chainId (Arc = 5042002) + address(this)
 *       → blocks cross-chain replay AND cross-vault replay simultaneously
 *  2. Per-address nonce incremented on every successful Claim / Cancel
 *       → each signature is single-use; replaying the same bytes reverts
 *  3. `deadline` field in every signed struct
 *       → stale signatures expire; front-running window is bounded
 *  4. Separate CLAIM_TYPEHASH vs CANCEL_TYPEHASH
 *       → a Claim signature cannot be submitted as a Cancel (type confusion)
 *  5. `onlyRelayer` execution gate — only the registered relayer address
 *       can call claim() / cancel(); no open-access attack surface
 */
contract StreamVault {
    // ── Immutable stream parameters ───────────────────────────────────────────
    address public immutable sender;
    address public immutable recipient;
    address public immutable token;       // Arc native USDC: 0x3600...0000
    uint256 public immutable totalAmount;
    uint64  public immutable startTime;   // Unix timestamp
    uint64  public immutable endTime;     // Unix timestamp
    address public immutable relayer;     // Render relayer wallet

    // ── Mutable state ─────────────────────────────────────────────────────────
    uint256 public alreadyWithdrawn;      // Cumulative amount claimed by recipient
    bool    public cancelled;

    // ── EIP-712 domain + type hashes ──────────────────────────────────────────
    bytes32 public immutable DOMAIN_SEPARATOR;

    bytes32 public constant CLAIM_TYPEHASH = keccak256(
        "Claim(address recipient,uint256 amount,uint256 nonce,uint256 deadline)"
    );
    bytes32 public constant CANCEL_TYPEHASH = keccak256(
        "Cancel(address sender,uint256 nonce,uint256 deadline)"
    );

    // Per-address nonces — recipient uses their own, sender uses their own
    mapping(address => uint256) public nonces;

    // ── Events ────────────────────────────────────────────────────────────────
    event Claimed(
        address indexed recipient,
        uint256         amount,
        uint256         totalWithdrawn
    );
    event Cancelled(
        address indexed sender,
        uint256         recipientShare,
        uint256         senderRefund
    );

    // ── Custom errors (cheaper than string reverts) ───────────────────────────
    error OnlyRelayer();
    error StreamCancelled();
    error AlreadyCancelled();
    error NothingToClaim();
    error SignatureExpired();
    error BadNonce();
    error InvalidSignature();
    error InvalidParams();

    // ── Constructor ───────────────────────────────────────────────────────────

    constructor(
        address _sender,
        address _recipient,
        address _token,
        uint256 _totalAmount,
        uint64  _startTime,
        uint64  _endTime,
        address _relayer
    ) {
        if (_endTime <= _startTime)        revert InvalidParams();
        if (_totalAmount == 0)             revert InvalidParams();
        if (_recipient == address(0))      revert InvalidParams();
        if (_relayer   == address(0))      revert InvalidParams();

        sender      = _sender;
        recipient   = _recipient;
        token       = _token;
        totalAmount = _totalAmount;
        startTime   = _startTime;
        endTime     = _endTime;
        relayer     = _relayer;

        // Domain separator is immutable — locked to this chain + this vault address.
        // Any signature crafted for a different vault or a different chain will fail.
        DOMAIN_SEPARATOR = keccak256(abi.encode(
            keccak256(
                "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
            ),
            keccak256(bytes("StreamVault")),
            keccak256(bytes("1")),
            block.chainid,   // 5042002 for Arc Testnet → mainnet value when Arc launches
            address(this)    // unique per vault
        ));
    }

    // ── Core stream math ──────────────────────────────────────────────────────

    /**
     * @notice Linear interpolation of how much USDC has vested so far.
     *
     *                 (block.timestamp - startTime)
     *   unlocked  =  ─────────────────────────────  ×  totalAmount
     *                     (endTime - startTime)
     *
     *   Clamped: returns 0 before startTime, totalAmount after endTime.
     */
    function calculateUnlocked() public view returns (uint256) {
        if (block.timestamp <  startTime) return 0;
        if (block.timestamp >= endTime)   return totalAmount;
        // Safe: elapsed ≤ duration, so multiplication fits in uint256 for any
        // realistic USDC amount (max 10^15 raw units × max ~3yr in seconds ≪ 2^256)
        return (block.timestamp - startTime) * totalAmount / (endTime - startTime);
    }

    /**
     * @notice How much the recipient can claim right now.
     *         = unlocked − already withdrawn, floored at 0.
     */
    function claimable() public view returns (uint256) {
        if (cancelled) return 0;
        uint256 unlocked = calculateUnlocked();
        return unlocked > alreadyWithdrawn ? unlocked - alreadyWithdrawn : 0;
    }

    // ── Gasless claim (EIP-712) ───────────────────────────────────────────────

    /**
     * @notice Relayer calls this to release vested USDC to the recipient.
     *
     * @param amount   Amount recipient signed for. Capped at claimable() if
     *                 the stream advanced less than expected between sign and submit.
     * @param nonce    Must equal nonces[recipient] — enforces single-use signature.
     * @param deadline Unix timestamp — signature reverts if submitted after this.
     * @param sig      65-byte EIP-712 signature produced by the recipient's wallet.
     */
    function claim(
        uint256        amount,
        uint256        nonce,
        uint256        deadline,
        bytes calldata sig
    ) external {
        if (msg.sender != relayer)       revert OnlyRelayer();
        if (cancelled)                   revert StreamCancelled();
        if (block.timestamp > deadline)  revert SignatureExpired();
        if (nonces[recipient] != nonce)  revert BadNonce();

        uint256 available = claimable();
        if (available == 0)              revert NothingToClaim();

        // If stream progressed less than expected since signing, cap at actual available.
        uint256 payout = amount > available ? available : amount;

        _requireSignature(
            keccak256(abi.encode(CLAIM_TYPEHASH, recipient, payout, nonce, deadline)),
            recipient,
            sig
        );

        // Checks-Effects-Interactions: state first, transfer last
        unchecked { nonces[recipient]++; }
        alreadyWithdrawn += payout;

        IERC20(token).transfer(recipient, payout);
        emit Claimed(recipient, payout, alreadyWithdrawn);
    }

    // ── Gasless cancel (EIP-712) ──────────────────────────────────────────────

    /**
     * @notice Relayer calls this to cancel the stream on the sender's behalf.
     *
     *   On cancel the contract balance is split fairly:
     *   • recipient  ← vested-but-unclaimed (they earned it; lock-in doesn't apply)
     *   • sender     ← unvested locked remainder (refund)
     *
     * @param nonce    Must equal nonces[sender].
     * @param deadline Unix timestamp — signature reverts if submitted after this.
     * @param sig      65-byte EIP-712 signature produced by the sender's wallet.
     */
    function cancel(
        uint256        nonce,
        uint256        deadline,
        bytes calldata sig
    ) external {
        if (msg.sender != relayer)       revert OnlyRelayer();
        if (cancelled)                   revert AlreadyCancelled();
        if (block.timestamp > deadline)  revert SignatureExpired();
        if (nonces[sender] != nonce)     revert BadNonce();

        _requireSignature(
            keccak256(abi.encode(CANCEL_TYPEHASH, sender, nonce, deadline)),
            sender,
            sig
        );

        unchecked { nonces[sender]++; }
        cancelled = true;

        // Calculate fair split at the exact cancel timestamp
        uint256 unlockedNow    = calculateUnlocked();
        uint256 recipientShare = unlockedNow > alreadyWithdrawn
                                     ? unlockedNow - alreadyWithdrawn
                                     : 0;
        uint256 senderRefund   = totalAmount - alreadyWithdrawn - recipientShare;

        if (recipientShare > 0) {
            alreadyWithdrawn += recipientShare;
            IERC20(token).transfer(recipient, recipientShare);
        }
        if (senderRefund > 0) {
            IERC20(token).transfer(sender, senderRefund);
        }

        emit Cancelled(sender, recipientShare, senderRefund);
    }

    // ── View helpers ──────────────────────────────────────────────────────────

    /**
     * @notice Returns the three segments that power the Tri-State Progress Bar.
     * @return claimed   Segment 1 — already withdrawn by recipient (dark fill).
     * @return unlocked  Segment 2 — vested but unclaimed, available now (mid fill).
     * @return locked    Segment 3 — not yet vested, still streaming (empty/grey).
     */
    function progressBar() external view returns (
        uint256 claimed,
        uint256 unlocked,
        uint256 locked
    ) {
        claimed = alreadyWithdrawn;
        uint256 unlockedTotal = calculateUnlocked();
        unlocked = unlockedTotal > alreadyWithdrawn ? unlockedTotal - alreadyWithdrawn : 0;
        locked   = totalAmount - alreadyWithdrawn - unlocked;
    }

    /**
     * @notice Single-call summary for the frontend — avoids multiple RPC calls.
     */
    function streamInfo() external view returns (
        address _sender,
        address _recipient,
        uint256 _totalAmount,
        uint64  _startTime,
        uint64  _endTime,
        uint256 _alreadyWithdrawn,
        bool    _cancelled,
        uint256 _unlocked,
        uint256 _claimable
    ) {
        return (
            sender,
            recipient,
            totalAmount,
            startTime,
            endTime,
            alreadyWithdrawn,
            cancelled,
            calculateUnlocked(),
            claimable()
        );
    }

    /**
     * @notice Returns true once the vault holds at least totalAmount of token.
     *         Used by the UI to detect when a sender has funded the stream.
     */
    function isFunded() external view returns (bool) {
        return IERC20(token).balanceOf(address(this)) + alreadyWithdrawn >= totalAmount;
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    /**
     * @dev Revert if the EIP-712 digest is not signed by `expectedSigner`.
     *      "\x19\x01" prefix is the EIP-712 magic bytes.
     */
    function _requireSignature(
        bytes32        structHash,
        address        expectedSigner,
        bytes calldata sig
    ) internal view {
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash)
        );
        bool valid = expectedSigner.code.length == 0
            ? ECDSA.recover(digest, sig) == expectedSigner
            : _isValidContractSignature(expectedSigner, digest, sig);
        if (!valid) revert InvalidSignature();
    }

    function _isValidContractSignature(
        address signer,
        bytes32 digest,
        bytes calldata sig
    ) internal view returns (bool) {
        (bool ok, bytes memory result) = signer.staticcall(
            abi.encodeWithSelector(ERC1271_MAGICVALUE, digest, sig)
        );
        return ok && result.length >= 32 && bytes4(result) == ERC1271_MAGICVALUE;
    }
}
