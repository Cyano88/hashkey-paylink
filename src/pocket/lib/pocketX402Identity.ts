export function pocketX402WalletSlug(email: string) {
  const clean = email.trim().toLowerCase()
  if (!clean) return ''
  let hash = 5381
  for (let index = 0; index < clean.length; index += 1) {
    hash = ((hash << 5) + hash + clean.charCodeAt(index)) >>> 0
  }
  return `wallet-${hash.toString(36)}`
}
