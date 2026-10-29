export function positiveBillLimit(value: unknown): number | null {
 if (value === null || value === undefined || value === '') return null
 const number = Number(value)
 return Number.isFinite(number) && number > 0 ? number : null
}
export function pocketBillLimits(...sources: Array<{minimumAmount?:number|null;maximumAmount?:number|null}|null|undefined>) {
 const minimums=sources.map(s=>positiveBillLimit(s?.minimumAmount)).filter((v):v is number=>v!==null)
 const maximums=sources.map(s=>positiveBillLimit(s?.maximumAmount)).filter((v):v is number=>v!==null)
 return {minimumAmount:minimums.length?Math.max(...minimums):null,maximumAmount:maximums.length?Math.min(...maximums):null}
}
export function withinPocketBillLimits(amount: number, limits: ReturnType<typeof pocketBillLimits>) {
 return Number.isFinite(amount) && amount > 0 && (limits.minimumAmount===null||amount>=limits.minimumAmount) && (limits.maximumAmount===null||amount<=limits.maximumAmount)
}
