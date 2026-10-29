export type ReceiptEmailSettings={enabled:boolean;supportEmail:string;timeZone:string;enabledAt?:string}
export const defaultReceiptEmailSettings:ReceiptEmailSettings={enabled:false,supportEmail:'',timeZone:'UTC'}
export function normalizeReceiptEmailSettings(value:unknown,previous:ReceiptEmailSettings|undefined,now:string):ReceiptEmailSettings{
 if(value===undefined)return previous||{...defaultReceiptEmailSettings}
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Provide valid receipt email settings.')
 const v=value as Record<string,unknown>
 if(typeof v.enabled!=='boolean')throw Error('Choose whether customer receipts are enabled.')
 const supportEmail=String(v.supportEmail??'').trim(),timeZone=String(v.timeZone??'UTC').trim()
 if(supportEmail&&(supportEmail.length>254||! /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(supportEmail)))throw Error('Enter a valid merchant support email.')
 if(v.enabled&&!supportEmail)throw Error('Add your merchant support email before enabling receipts.')
 if(timeZone.length>80)throw Error('Choose a valid receipt timezone.')
 try{new Intl.DateTimeFormat('en',{timeZone}).format()}catch{throw Error('Choose a valid receipt timezone.')}
 return{enabled:v.enabled,supportEmail,timeZone,...(v.enabled?{enabledAt:previous?.enabled&&previous.enabledAt?previous.enabledAt:now}:{})}
}
