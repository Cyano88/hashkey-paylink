/** A conversion is tied to one verified delivery, never a quoted amount. */
export function cashFundingReference(value: unknown) {
  if (typeof value !== 'string') return null
  const match = /^(evm|solana|bsc|xlayer):([a-zA-Z0-9-]{1,80})$/.exec(value)
  if (!match) return null
  const [, rail, id] = match
  return {
    rail,
    action: rail === 'bsc' ? 'wallet.bsc-bridge' : rail === 'xlayer' ? 'wallet.xlayer-bridge' : 'wallet.usdt-bridge',
    key: (rail === 'bsc' ? 'pocket:bsc-outbound-bridge:' : rail === 'xlayer' ? 'pocket:xlayer-bridge:' : rail === 'solana' ? 'pocket:solana-usdt-bridge:' : 'pocket:usdt-bridge:') + id,
  }
}

export function cashDeliveredUnits(value: unknown): bigint | null {
  if (typeof value !== 'string' || !/^\d{1,70}(\.\d{1,6})?$/.test(value)) return null
  const [whole, fraction = ''] = value.split('.')
  const units = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'))
  return units > 0n && units < 2n ** 256n ? units : null
}
