/** Product policy shared by online and physical merchant purchases. */
export const PURCHASE_DAILY_USD = 7_000

/** Personal transfers use a separate daily ledger from purchases. */
export const PERSONAL_BANK_DAILY_USD = {basic:50,advanced:7_000} as const
