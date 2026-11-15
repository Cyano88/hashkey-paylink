// All user-facing daily allowances reset at 00:00 UTC. Untagged records used
// Lagos dates: count both overlapping legacy buckets during the transition,
// never shorten their reservation window or grant extra allowance at 23:00.
export const ALLOWANCE_DAY_POLICY='utc-v1' as const
export const allowanceDay=(now:number)=>new Date(now).toISOString().slice(0,10)
export const legacyAllowanceDay=(now:number)=>new Date(now+3600000).toISOString().slice(0,10)
export const nextAllowanceReset=(now:number)=>Date.parse(allowanceDay(now)+'T00:00:00Z')+86400000
export function currentAllowanceCharge(charge:{day:string;dayPolicy?:string},now:number){
 return charge.day===allowanceDay(now)||charge.dayPolicy!==ALLOWANCE_DAY_POLICY&&charge.day===legacyAllowanceDay(now)
}
export function currentAllowanceTimestamp(record:{createdAt:number;allowanceDayPolicy?:string},now:number){
 return currentAllowanceCharge({day:record.allowanceDayPolicy===ALLOWANCE_DAY_POLICY?allowanceDay(record.createdAt):legacyAllowanceDay(record.createdAt),dayPolicy:record.allowanceDayPolicy},now)
}
