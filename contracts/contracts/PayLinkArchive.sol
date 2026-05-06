// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title  PayLinkArchive
 * @notice On-chain registry of payment record root hashes stored on 0G Storage.
 *
 *  Every time a payer completes a payment in Hash PayLink multi-payer collection
 *  mode, the payment record (JSON) is uploaded to 0G decentralized storage and
 *  its content-addressed root hash is anchored here permanently.
 *
 *  Anyone can verify a payment by:
 *    1. Reading the PaymentArchived event for the eventId.
 *    2. Fetching the JSON blob from 0G Storage using the root hash.
 *    3. Confirming the txHash inside the blob exists on the payment chain.
 *
 *  Deployed on 0G Mainnet (Chain ID 16661).
 */
contract PayLinkArchive {

    address public owner;

    event PaymentArchived(
        string  indexed eventId,
        bytes32 indexed rootHash,
        string          chain,
        string          payer,
        string          amount,
        uint256         ts
    );

    event OwnershipTransferred(address indexed previous, address indexed next);

    modifier onlyOwner() {
        require(msg.sender == owner, "Archive: not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /**
     * @notice Anchor a 0G Storage root hash on-chain for a completed payment.
     * @param eventId   Hash PayLink event identifier
     * @param rootHash  0G Storage content root hash of the payment JSON record
     * @param chain     Chain the payment was made on (base, arbitrum, solana, etc.)
     * @param payer     Payer name / handle as entered in the collection form
     * @param amount    Payment amount as a string (e.g. "10.5")
     * @param ts        Unix timestamp (ms) of the payment
     */
    function archive(
        string  calldata eventId,
        bytes32          rootHash,
        string  calldata chain,
        string  calldata payer,
        string  calldata amount,
        uint256          ts
    ) external onlyOwner {
        emit PaymentArchived(eventId, rootHash, chain, payer, amount, ts);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Archive: zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
