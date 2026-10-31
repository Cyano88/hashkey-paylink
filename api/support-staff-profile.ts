import {readSupportJson} from './hash-support/pocket-storage.js'

export type SupportStaffProfiles={staffNames?:Record<string,string>;staffImages?:Record<string,string>}
export const readSupportStaffProfiles=()=>readSupportJson<SupportStaffProfiles>((process.env.POCKET_SUPPORT_STORE_KEY||'hashpaylink:pocket-support:v1').trim())
export function supportStaffProfile(profiles:SupportStaffProfiles|undefined,id:string){
 const name=profiles?.staffNames?.[id],image=profiles?.staffImages?.[id]
 return {displayName:typeof name==='string'?name.trim().slice(0,60):'',avatarDataUrl:typeof image==='string'&&image.length<=16000&&/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(image)?image:undefined}
}
type Message={author:string;kind?:string;text:string;staffUserId?:string;displayName?:string;avatarDataUrl?:string}
// Enrich a response only; never rewrite the historical message or expose the directory.
export function withSupportStaffAvatars<T extends {messages?:Message[]}>(row:T,profiles:SupportStaffProfiles|undefined):T{
 if(!profiles)return row
 return {...row,messages:row.messages?.map(message=>{
  if(message.author!=='staff'&&message.kind!=='staff_joined')return message
  let id=message.staffUserId
  if(!id&&!message.avatarDataUrl){
   const name=message.displayName||(message.kind==='staff_joined'&&message.text.endsWith(' joined the conversation.')?message.text.slice(0,-' joined the conversation.'.length):'')
   if(!name||['Hash Support','Pocket Support','A support agent'].includes(name))return message
   const matches=Object.entries(profiles.staffNames||{}).filter(([,value])=>value.trim()===name)
   if(matches.length===1)id=matches[0][0]
  }
  if(!id||!Object.prototype.hasOwnProperty.call(profiles.staffNames||{},id))return message
  return {...message,avatarDataUrl:supportStaffProfile(profiles,id).avatarDataUrl}
 })} as T
}
