import { parseAbi } from 'viem'

export const CHECKPOINT_VAULT_ABI = parseAbi([
  'function sender() view returns (address)',
  'function recipient() view returns (address)',
  'function contentId() view returns (bytes32)',
  'function totalAmount() view returns (uint256)',
  'function releasedAmount() view returns (uint256)',
  'function refunded() view returns (bool)',
  'function isFunded() view returns (bool)',
  'function release(uint256 cumulativeAmount)',
  'function refund()',
  'function vaultInfo() view returns (address _sender,address _recipient,address _token,address _relayer,bytes32 _contentId,uint256 _totalAmount,uint256 _releasedAmount,uint256 _refundableAmount,bool _refunded,bool _funded)',
])

export const CHECKPOINT_VAULT_FACTORY_ABI = parseAbi([
  'function getVaultAddress(address sender,address recipient,bytes32 contentId,uint256 totalAmount,bytes32 salt) view returns (address)',
  'function createCheckpointVault(address recipient,bytes32 contentId,uint256 totalAmount,bytes32 salt) returns (address vault)',
  'event CheckpointVaultCreated(address indexed vault,address indexed sender,address indexed recipient,bytes32 contentId,uint256 totalAmount,bytes32 salt)',
])
