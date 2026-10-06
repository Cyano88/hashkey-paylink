import { decodeEventLog, isAddress, parseAbiItem } from 'viem'

const transfer = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')

/** Shared proof boundary for merchant token payments; metadata and symbols are not proof. */
export function exactTokenTransfer(input: { token: string; payer: string; recipient: string; units: string }, receipt: { status: string; logs: readonly any[] }) {
  if (receipt.status !== 'success' || ![input.token, input.payer, input.recipient].every(address => isAddress(address))
    || !/^[1-9]\d*$/.test(input.units)) return false
  const expected = BigInt(input.units)
  if (expected >= 2n ** 256n) return false
  let total = 0n
  let matched = false
  for (const log of receipt.logs) {
    if (String(log.address).toLowerCase() !== input.token.toLowerCase()) continue
    try {
      const decoded = decodeEventLog({ abi: [transfer], data: log.data, topics: log.topics })
      if (decoded.args.from.toLowerCase() !== input.payer.toLowerCase() || decoded.args.to.toLowerCase() !== input.recipient.toLowerCase()) continue
      if (log.removed) return false
      matched = true
      total += decoded.args.value
    } catch { /* A different event is not a transfer proof. */ }
  }
  return matched && total === expected
}
