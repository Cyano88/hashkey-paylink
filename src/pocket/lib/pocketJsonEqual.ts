/** Object key order is not semantic: PostgreSQL jsonb reorders keys.
 * Arrays, keys, types and every value must still match exactly. */
export function pocketJsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => pocketJsonEqual(v, b[i]))
  }
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>
  const keys = Object.keys(left)
  return keys.length === Object.keys(right).length && keys.every(k => Object.prototype.hasOwnProperty.call(right, k) && pocketJsonEqual(left[k], right[k]))
}
