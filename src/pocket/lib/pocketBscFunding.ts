import {pocketBscAsset, type PocketBscAsset} from './pocketBsc.js'

const UINT256_LIMIT = 2n ** 256n
function units(value: string): bigint {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,77})$/.test(value)) throw Error('Invalid BSC amount.')
  const result = BigInt(value)
  if (result >= UINT256_LIMIT) throw Error('Invalid BSC amount.')
  return result
}

/** Product policy only; this is not a sponsorship approval or an executable quote. */
export function bscSwapGasPolicy(input: PocketBscAsset, output: PocketBscAsset) {
  pocketBscAsset(input)
  pocketBscAsset(output)
  if (input === output || (input !== 'BNB' && output !== 'BNB')) throw Error('Choose BNB and USDC or USDT.')
  return input === 'BNB'
    ? {mode: 'native' as const, gasAsset: 'BNB' as const, reimbursementAsset: null}
    : {mode: 'stablecoin-reimbursement' as const, gasAsset: 'BNB' as const, reimbursementAsset: input}
}

/** Exact funding allocation. Callers must obtain a verified fee before using this.
 * Stablecoin fee is included in the entered amount. Native gas is reserved in
 * addition to a BNB input. No six-decimal or floating-point conversions here.
 */
export function planBscSwapFunding(input: {
  tokenIn: PocketBscAsset
  tokenOut: PocketBscAsset
  amountUnits: string
  inputBalanceUnits: string
  reimbursementUnits: string
  nativeGasReserveUnits: string
}) {
  const policy = bscSwapGasPolicy(input.tokenIn, input.tokenOut)
  const amount = units(input.amountUnits)
  const balance = units(input.inputBalanceUnits)
  const reimbursement = units(input.reimbursementUnits)
  const gas = units(input.nativeGasReserveUnits)
  if (amount === 0n) throw Error('Enter an amount.')
  if (policy.mode === 'native') {
    if (reimbursement !== 0n || gas === 0n) throw Error('BNB swaps must use native gas.')
    const debit = amount + gas
    if (debit >= UINT256_LIMIT) throw Error('Invalid BSC amount.')
    return {...policy, totalInputUnits: amount.toString(), tradeInputUnits: amount.toString(), reimbursementUnits: '0', requiredInputBalanceUnits: debit.toString(), sufficient: balance >= debit}
  }
  if (gas !== 0n) throw Error('Stablecoin swaps require sponsored gas.')
  if (reimbursement === 0n || reimbursement >= amount) throw Error('The reimbursement must fit within the swap amount.')
  return {...policy, totalInputUnits: amount.toString(), tradeInputUnits: (amount - reimbursement).toString(), reimbursementUnits: reimbursement.toString(), requiredInputBalanceUnits: amount.toString(), sufficient: balance >= amount}
}
