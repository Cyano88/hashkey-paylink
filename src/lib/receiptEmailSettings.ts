import {normalizeBusinessSummaryPreferences,type BusinessSummaryPreferences} from './businessSummaryPreferences'
export type ReceiptEmailSettings={businessSummary?:BusinessSummaryPreferences;enabled:boolean;supportEmail:string;timeZone:string;enabledAt?:string}
export const defaultReceiptEmailSettings:ReceiptEmailSettings={enabled:true,supportEmail:'',timeZone:'UTC'}
export function normalizeReceiptEmailSettings(value:unknown,previous:ReceiptEmailSettings|undefined,now:string,ownerId?:string):ReceiptEmailSettings{
 if(value===undefined)return {...defaultReceiptEmailSettings,...previous,enabled:true}
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Provide valid receipt email settings.')
 const v=value as Record<string,unknown>
 if(v.enabled!==undefined&&typeof v.enabled!=='boolean')throw Error('Provide valid receipt email settings.')
 const supportEmail=String(v.supportEmail??'').trim(),timeZone=String(v.timeZone??'UTC').trim()
 if(supportEmail&&(supportEmail.length>254||! /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(supportEmail)))throw Error('Enter a valid merchant support email.')
 if(timeZone.length>80)throw Error('Choose a valid receipt timezone.')
 try{new Intl.DateTimeFormat('en',{timeZone}).format()}catch{throw Error('Choose a valid receipt timezone.')}
 // Older clients may still submit enabled:false. Receipts are a platform
 // guarantee; only branding, support contact and timezone are configurable.
 const businessSummary=normalizeBusinessSummaryPreferences(v.businessSummary,previous?.businessSummary,now,ownerId)
 return{enabled:true,supportEmail,timeZone,businessSummary,...(previous?.enabledAt?{enabledAt:previous.enabledAt}:{})}
}
