export const GIFT_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
export function normalizeGiftCode(value: string): string | null {
  if (typeof value !== 'string' || value.length > 32) return null
  const code = value.trim().toUpperCase().replace(/[\s-]/g, '')
  return code.length === 8 && [...code].every(c => GIFT_CODE_ALPHABET.includes(c)) ? code : null
}
export function formatGiftCode(code: string) { return code.slice(0, 4) + '-' + code.slice(4) }

// Format only code-like input; pasted gift URLs must remain byte-for-byte intact.
export function formatGiftCodeInput(value: string, deleting = false): string {
  if (!/^[a-z0-9\s-]*$/i.test(value)) return value
  const code = value.toUpperCase().replace(/[\s-]/g, '')
  if (code.length < 4 || code.length === 4 && deleting) return code
  return code.slice(0, 4) + '-' + code.slice(4)
}
