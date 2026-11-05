/** Existing Pocket native send/swap allowance, reserved in the reviewed fee.
 * Execution checks the actual estimate against this reserve, without adding
 * the allowance again or increasing the approved debit. */
export const POCKET_NATIVE_FEE_ALLOWANCE_BPS = 5_000

/** Circle Gas Station service charge; separate from Pocket platform revenue. */
export const POCKET_CIRCLE_GAS_STATION_FEE_BPS = 500
