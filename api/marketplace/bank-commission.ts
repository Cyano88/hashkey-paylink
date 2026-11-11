/** Owner-approved Marketplace bank withdrawal commission, in basis points.
 * USDC fees are rounded half up to one micro-USDC; never use floating point.
 */
export const MARKETPLACE_BANK_COMMISSION_BPS = 30
export function marketplaceBankCommission(principal: bigint): bigint {
 if(principal < 0n)throw Error('Invalid bank commission principal.')
 return (principal * BigInt(MARKETPLACE_BANK_COMMISSION_BPS) + 5000n) / 10000n
}
export function assertMarketplaceBankCommission(principal:bigint,fee:bigint,percent:unknown,mode?:'fixed_units'){
 // Fixed-fee orders use our exact integer calculation. Paycrest's percentage
 // metadata is derived (and differs between create and read responses).
 // Historical percentage orders must still satisfy their original rate check.
 if((mode!=='fixed_units'&&(typeof percent!=='string'||!/^0\.30*$/.test(percent)))||fee!==marketplaceBankCommission(principal))throw Error('Bank withdrawal commission does not match the approved 0.3% policy.')
}
