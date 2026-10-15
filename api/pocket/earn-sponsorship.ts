import { parseUnits, type Address } from 'viem'
import { preparePocketEarnCall, type EarnAction } from '../../src/pocket/lib/pocketEarnCalls.js'
import { readPocketEarnPosition } from '../../src/pocket/lib/pocketEarn.js'
import { stockClient } from '../../src/pocket/lib/pocketXStocksWallet.js'

export type EarnIntent = { action: EarnAction; symbol: string; amount: string }

/** Build from a narrow intent; never accept an arbitrary approval or pool call. */
export function validateEarnSponsorship(intent: EarnIntent, tx: { from: string; to: string; data: string }) {
  const expected = preparePocketEarnCall({ ...intent, owner: tx.from as Address })
  if (tx.to.toLowerCase() !== expected.to.toLowerCase() || tx.data.toLowerCase() !== expected.data.toLowerCase()) {
    throw Error('Earn authorization does not match the reviewed transaction.')
  }
  return expected
}

export async function preflightEarnSponsorship(intent: EarnIntent, owner: Address) {
  if (await stockClient.getChainId() !== 196) throw Error('X Layer could not be verified.')
  const call = preparePocketEarnCall({ ...intent, owner })
  const position = await readPocketEarnPosition(intent.symbol, owner)
  const units = parseUnits(intent.amount, 6)
  if (!position.active || position.paused || (intent.action !== 'withdraw' && position.frozen)) throw Error('This market is temporarily unavailable.')
  if (units > (intent.action === 'withdraw' ? position.earning : position.available)) throw Error('Insufficient balance.')
  if (intent.action === 'withdraw' && units > position.liquidity) throw Error('This amount is not available to withdraw yet.')
  // Simulation also checks allowances, supply caps and existing collateral/debt.
  await stockClient.call({ account: owner, to: call.to, data: call.data, value: 0n })
}
