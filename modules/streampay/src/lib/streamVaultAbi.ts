import { parseAbi } from 'viem'

// ── StreamVault — per-stream vault deployed via CREATE2 ───────────────────────
export const STREAM_VAULT_ABI = parseAbi([
  // Immutable parameters
  'function sender()        view returns (address)',
  'function recipient()     view returns (address)',
  'function token()         view returns (address)',
  'function totalAmount()   view returns (uint256)',
  'function startTime()     view returns (uint64)',
  'function endTime()       view returns (uint64)',
  'function relayer()       view returns (address)',
  // Mutable state
  'function alreadyWithdrawn() view returns (uint256)',
  'function cancelled()        view returns (bool)',
  'function nonces(address)    view returns (uint256)',
  // EIP-712
  'function DOMAIN_SEPARATOR() view returns (bytes32)',
  'function CLAIM_TYPEHASH()   view returns (bytes32)',
  'function CANCEL_TYPEHASH()  view returns (bytes32)',
  // Computed views
  'function calculateUnlocked() view returns (uint256)',
  'function claimable()         view returns (uint256)',
  'function isFunded()          view returns (bool)',
  // Tri-state progress bar
  'function progressBar() view returns (uint256 claimed, uint256 unlocked, uint256 locked)',
  // Single-call summary for page load
  'function streamInfo() view returns (address _sender, address _recipient, uint256 _totalAmount, uint64 _startTime, uint64 _endTime, uint256 _alreadyWithdrawn, bool _cancelled, uint256 _unlocked, uint256 _claimable)',
  // Gasless actions — callable only by the registered relayer
  'function claim(uint256 amount, uint256 nonce, uint256 deadline, bytes sig)',
  'function cancel(uint256 nonce, uint256 deadline, bytes sig)',
  // Events
  'event Claimed(address indexed recipient, uint256 amount, uint256 totalWithdrawn)',
  'event Cancelled(address indexed sender, uint256 recipientShare, uint256 senderRefund)',
])

// ── StreamVaultFactory — CREATE2 deployer ─────────────────────────────────────
export const STREAM_VAULT_FACTORY_ABI = parseAbi([
  'function usdc()     view returns (address)',
  'function relayer()  view returns (address)',
  'function getVaultAddress(address sender, address recipient, uint256 totalAmount, uint64 startTime, uint64 endTime, bytes32 salt) view returns (address)',
  'function createStream(address recipient, uint256 totalAmount, uint64 startTime, uint64 endTime, bytes32 salt) returns (address vault)',
  'event StreamCreated(bytes32 indexed streamId, address indexed vault, address indexed sender, address recipient, uint256 totalAmount, uint64 startTime, uint64 endTime)',
])
