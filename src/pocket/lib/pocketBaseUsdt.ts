import {formatUnits, isAddress, parseAbi, type Address} from 'viem'
import {BASE_STABLECOINS} from '../../lib/baseStablecoins'
// Deposits and reads are independent of the separately gated payout rollout.
export const pocketUsdtEnabled = import.meta.env?.VITE_POCKET_USDT !== 'false'
const payoutConfig = typeof window === 'undefined' ? undefined : (window as unknown as {__HASH_PAYLINK_CONFIG__?:{payouts?:{usdtEnabled?:boolean}}}).__HASH_PAYLINK_CONFIG__?.payouts
export const pocketUsdtPayoutEnabled = pocketUsdtEnabled && (payoutConfig?.usdtEnabled ?? (import.meta.env?.VITE_POCKET_USDT_PAYOUT === 'true'))
export async function readBaseUsdtBalance(address: string) {
  if (!isAddress(address)) throw Error('Open your Base wallet to continue.')
  const {EVM_CLIENTS} = await import('../../lib/router')
  if (await EVM_CLIENTS.base.getChainId() !== 8453) throw Error('Base connection could not be verified.')
  const units = await EVM_CLIENTS.base.readContract({address:BASE_STABLECOINS.USDT.address,abi:parseAbi(['function balanceOf(address) view returns (uint256)']),functionName:'balanceOf',args:[address as Address]})
  return {units, amount:Number(formatUnits(units,6))}
}
