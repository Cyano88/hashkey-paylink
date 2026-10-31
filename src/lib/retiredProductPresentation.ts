// Presentation only: preserve stored project IDs, records and audit history.
export const RETAINED_TRADE_PROJECT_ID = 'dev_25f636321f644b4284'
export function productDisplayName(id: string, name: string) { return id === RETAINED_TRADE_PROJECT_ID ? 'Trade' : name }
