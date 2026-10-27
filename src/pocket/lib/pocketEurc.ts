// Circle-issued EURC. Euro amounts must never use a fixed USD exchange rate.
export const POCKET_EURC = {
 base: {symbol:'EURC',address:'0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42',decimals:6,native:false},
 arc: {symbol:'EURC',address:'0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1',decimals:6,native:false},
} as const
export type PocketEurcNetwork=keyof typeof POCKET_EURC
export type PocketEurcBalance={network:PocketEurcNetwork;symbol:'EURC';address:string|null;quantity:number|null;valueUsd:number|null;status:'ok'|'error';observedAt:number}
