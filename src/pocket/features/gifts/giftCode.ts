export const GIFT_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
export function normalizeGiftCode(value: string): string | null {
  if (typeof value !== 'string' || value.length > 32) return null
  const code = value.trim().toUpperCase().replace(/[\s-]/g, '')
  return code.length === 8 && [...code].every(c => GIFT_CODE_ALPHABET.includes(c)) ? code : null
}
export function formatGiftCode(code: string) { return code.slice(0, 4) + '-' + code.slice(4) }
