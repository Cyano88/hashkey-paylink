import {
  POCKET_API,
  isPocketBankInstitutionsData,
  isPocketBankVerifyData,
  type PocketBankInstitutionsData,
  type PocketBankVerifyData,
  type PocketBankVerifyRequest,
} from '../lib/pocketSchemas'

function bankErrorMessage(value: unknown, fallback: string) {
  if (!value || typeof value !== 'object') return fallback
  const error = (value as { error?: unknown }).error
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message
  }
  return fallback
}

export function parsePocketBankInstitutions(value: unknown): PocketBankInstitutionsData {
  if (!value || typeof value !== 'object' || (value as { ok?: unknown }).ok !== true) {
    throw new Error(bankErrorMessage(value, 'Could not load banks.'))
  }
  if (!isPocketBankInstitutionsData(value)) throw new Error('Bank institution response was invalid.')
  return { institutions: value.institutions }
}

export function parsePocketBankVerification(value: unknown): PocketBankVerifyData {
  if (!value || typeof value !== 'object' || (value as { ok?: unknown }).ok !== true) {
    throw new Error(bankErrorMessage(value, 'Account verification failed.'))
  }
  if (!isPocketBankVerifyData(value)) throw new Error('Bank verification response was invalid.')
  return { account_name: value.account_name, bank_code: value.bank_code }
}

export async function readPocketBankInstitutions(fetcher: typeof fetch = fetch): Promise<PocketBankInstitutionsData> {
  const response = await fetcher(POCKET_API.bankInstitutions, { method: 'GET' })
  const data = await response.json().catch(() => undefined)
  if (!response.ok) throw new Error(bankErrorMessage(data, 'Could not load banks.'))
  return parsePocketBankInstitutions(data)
}

export async function verifyPocketBankAccount({
  accessToken,
  request,
  fetcher = fetch,
}: {
  accessToken: string
  request: PocketBankVerifyRequest
  fetcher?: typeof fetch
}): Promise<PocketBankVerifyData> {
  const response = await fetcher(POCKET_API.bankVerify, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(request),
  })
  const data = await response.json().catch(() => undefined)
  if (!response.ok) throw new Error(bankErrorMessage(data, 'Account verification failed.'))
  return parsePocketBankVerification(data)
}
