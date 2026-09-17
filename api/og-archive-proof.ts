/** Preserve the 32-byte 0G Merkle root exactly; it is hex data, not UTF-8 text. */
export function archiveRootHash(value: unknown): `0x${string}` {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error('Invalid 0G storage root hash.')
  }
  return value as `0x${string}`
}
