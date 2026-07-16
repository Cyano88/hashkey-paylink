import { usePrivy } from '@privy-io/react-auth'

export function emailFromPocketPrivyUser(user: unknown) {
  const directEmail = (user as { email?: { address?: unknown } } | undefined)?.email?.address
  if (typeof directEmail === 'string') return directEmail.trim().toLowerCase()

  const linkedAccounts = (user as { linkedAccounts?: unknown } | undefined)?.linkedAccounts
  if (!Array.isArray(linkedAccounts)) return ''
  for (const account of linkedAccounts) {
    const record = account as { type?: unknown; address?: unknown; email?: unknown }
    if (record.type === 'email' && typeof record.address === 'string') return record.address.trim().toLowerCase()
    if (typeof record.email === 'string') return record.email.trim().toLowerCase()
  }
  return ''
}

export default function usePocketIdentity() {
  const { authenticated, user, logout, getAccessToken } = usePrivy()

  return {
    authenticated,
    email: emailFromPocketPrivyUser(user),
    user,
    logout,
    getAccessToken,
  }
}
