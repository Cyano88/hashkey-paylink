/** Stable numeric aliases remain valid; named IDs use ASCII to avoid lookalikes. */
export const normalizePocketId = (value: unknown) => String(value ?? '').trim().toLowerCase()
export const isPocketId = (value: unknown) => /^(?:[0-9]{6,12}|(?=[a-z0-9]*[a-z])[a-z0-9]{3,20})$/.test(normalizePocketId(value))
export const pocketIdInput = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20)
export const POCKET_ID_HELP = '3-20 letters or numbers. Numeric IDs use 6-12 digits. Your original Pocket number stays yours.'
