export type BusinessSummaryPreferences={enabled:boolean;frequency:'daily'|'weekly';timeZone:string;startedAt?:string;subscriberId?:string}
export const defaultBusinessSummaryPreferences:BusinessSummaryPreferences={enabled:false,frequency:'daily',timeZone:'UTC'}
export function normalizeBusinessSummaryPreferences(value:unknown,previous:BusinessSummaryPreferences|undefined,now:string,ownerId?:string):BusinessSummaryPreferences{
 if(value===undefined)return {...defaultBusinessSummaryPreferences,...previous}
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Provide valid business summary settings.')
 const v=value as Record<string,unknown>
 if(typeof v.enabled!=='boolean'||!['daily','weekly'].includes(String(v.frequency)))throw Error('Choose daily or weekly business summaries.')
 const timeZone=typeof v.timeZone==='string'?v.timeZone:'UTC'
 if(timeZone.length>80)throw Error('Choose a valid summary timezone.')
 try{new Intl.DateTimeFormat('en',{timeZone}).format()}catch{throw Error('Choose a valid summary timezone.')}
 if(!Number.isFinite(Date.parse(now)))throw Error('Invalid summary activation time.')
 const changed=!previous?.enabled||previous.frequency!==v.frequency||previous.timeZone!==timeZone||!!ownerId&&previous.subscriberId!==ownerId
 return {enabled:v.enabled,frequency:v.frequency as 'daily'|'weekly',timeZone,
  ...(v.enabled?{startedAt:changed||!previous?.startedAt?now:previous.startedAt,...(ownerId||previous?.subscriberId?{subscriberId:ownerId||previous?.subscriberId}:{})}:{})}
}
