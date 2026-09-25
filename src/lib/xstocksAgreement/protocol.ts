import { parseAbi } from 'viem';
export const TRADE_XLAYER_FACTORY = '0x9f41a14Af230AaaF7fEfdB69ad5962828ca68dd7' as const;
export const TRADE_XLAYER_ARBITER = '0xf80E88df7D4570FC8eb6eAaC7AED0b93a413bBbA' as const;
export const TRADE_FACTORY_ABI = parseAbi([
 'function arbiter() view returns(address)', 'function approvedTokens(address) view returns(bool)',
 'function escrows(bytes32) view returns(address)',
 'function create((bytes32 offerId,bytes32 termsHash,address buyer,address seller,address arbiter,address token,uint256 amount,uint64 fundBy,uint32 dispatchWindow,uint32 deliveryWindow,uint32 inspectionWindow) terms) returns(address)',
]);
export const TRADE_ESCROW_ABI = parseAbi([
 'function offerId() view returns(bytes32)', 'function termsHash() view returns(bytes32)',
 'function buyer() view returns(address)', 'function seller() view returns(address)', 'function arbiter() view returns(address)',
 'function token() view returns(address)', 'function amount() view returns(uint256)', 'function fundBy() view returns(uint64)',
 'function dispatchWindow() view returns(uint32)', 'function deliveryWindow() view returns(uint32)', 'function inspectionWindow() view returns(uint32)',
 'function state() view returns(uint8)', 'function dispatchBy() view returns(uint256)', 'function deliveryBy() view returns(uint256)', 'function inspectUntil() view returns(uint256)',
 'function acceptTerms(bytes32)', 'function fund(bytes32)', 'function cancelUnfunded()', 'function markDispatched(bytes32)',
 'function confirmReceipt()', 'function approveRelease()', 'function releaseAfterInspection()',
 'function refundUndispatched()', 'function refundBySeller(bytes32)', 'function openDispute(bytes32)',
]);
export const TRADE_TOKEN_ABI = parseAbi(['function allowance(address,address) view returns(uint256)', 'function balanceOf(address) view returns(uint256)', 'function approve(address,uint256) returns(bool)', 'function decimals() view returns(uint8)']);
export const TRADE_ACTION_LABELS = { create:'Prepare escrow', accept:'Confirm escrow terms', approve:'Approve payment', fund:'Pay into escrow', cancel:'Cancel unpaid escrow', dispatch:'Mark dispatched', receipt:'Confirm received', release:'Release payment', refund:'Refund buyer', missedDispatch:'Claim refund', dispute:'Open dispute', inspectionRelease:'Claim payment' } as const;
export type TradeXLayerAction = keyof typeof TRADE_ACTION_LABELS;
export type TradeXLayerTransaction = { to: `0x${string}`; data: `0x${string}`; chainId: 196; value: '0'; account: `0x${string}` };
export type TradeXLayerStatus = { fundingIssue?: string; observedBlock?: string; enabled: boolean; state?: number; escrow?: `0x${string}`; amount?: string; token?: `0x${string}`; decimals?: number; actions: TradeXLayerAction[]; pending?: boolean; transaction?: TradeXLayerTransaction };
