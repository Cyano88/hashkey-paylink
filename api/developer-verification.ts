import {requiredCompanyDocumentSlots} from '../src/developer/verificationTypes.js'
import {createCipheriv,createDecipheriv,createHash,randomBytes,randomUUID} from 'node:crypto'
import {readDurableJson,writeDurableJson,queryDurablePostgres} from './render-durable-store.js'
import type {BusinessApplication,BusinessVerification,VerificationDocument} from '../src/developer/verificationTypes.js'
export type VerificationRecord=BusinessVerification & {cipher?:string;history:Array<{action:string;actor:string;at:string;revision:number;note?:string;smileReference?:string}>}
export const verificationEmpty=(required=false):VerificationRecord=>({status:'not_started',revision:0,required,documents:[],history:[]})
const fail=(message:string,status=400):never=>{throw Object.assign(Error(message),{status})}
const key=(secret:string)=>{if(secret.length<32)fail('Verification storage is not configured.',503);return createHash('sha256').update('business-verification:'+secret).digest()}
export function sealVerification(value:string,secret:string){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(secret),iv);const data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return [iv,cipher.getAuthTag(),data].map(b=>b.toString('base64url')).join('.')}
export function openVerification(value:string,secret:string){const [iv,tag,data]=value.split('.').map(v=>Buffer.from(v,'base64url'));const cipher=createDecipheriv('aes-256-gcm',key(secret),iv);cipher.setAuthTag(tag);return Buffer.concat([cipher.update(data),cipher.final()]).toString('utf8')}
export function publicVerification(record?:VerificationRecord):BusinessVerification{const {status,revision,required,documents,submittedAt,reviewedAt,feedback}=record??verificationEmpty();return {status,revision,required,documents,submittedAt,reviewedAt,feedback}}
export function verificationAllowsLive(record?:VerificationRecord){return !record?.required||record.status==='approved'}
export function assertVerificationEditable(record:VerificationRecord,revision:unknown){if(!Number.isInteger(revision)||record.revision!==revision)fail('This application changed. Reload it before continuing.',409);if(['submitted','approved'].includes(record.status))fail('This application is locked for review. Contact support to request a change.',409)}
export function normalizeBusinessApplication(value:unknown):BusinessApplication{
 const a=value as BusinessApplication
 if(!a||typeof a!=='object'||!Array.isArray(a.owners)||a.owners.length>10)fail('Add up to 10 owners or control persons.')
 const text=(v:unknown,max=300)=>{if(typeof v!=='string'||v.length>max)fail('A field is invalid or too long.');return (v as string).trim()}
 const ids=new Set<string>()
 return {companyName:text(a.companyName),tradingName:text(a.tradingName),phone:text(a.phone,40),website:text(a.website,500),address:text(a.address,1500),registrationNumber:text(a.registrationNumber,100),country:text(a.country,2).toUpperCase(),description:text(a.description,2000),attested:a.attested===true,
 owners:a.owners.map(o=>{if(!o||!/^[a-zA-Z0-9-]{8,64}$/.test(o.id)||ids.has(o.id))fail('Owner reference is invalid.');ids.add(o.id);return {id:o.id,fullName:text(o.fullName),birthDate:text(o.birthDate,10),address:text(o.address,1500),ownership:text(o.ownership,6),pep:o.pep===true?true:o.pep===false?false:null,idType:text(o.idType,60),idNumber:text(o.idNumber,100),issuingCountry:text(o.issuingCountry,2).toUpperCase(),bvn:text(o.bvn,11),nin:text(o.nin,11),controlPerson:o.controlPerson===true,director:o.director===true}})}
}
export function validateBusinessSubmission(a:BusinessApplication,documents:VerificationDocument[],now=new Date()){
 for(const [field,label] of [['companyName','company name'],['tradingName','trading name'],['phone','phone number'],['address','registered address'],['registrationNumber','registration number'],['description','business description']] as const)if(a[field].length<2)fail('Enter your '+label+'.')
 if(!/^[A-Z]{2}$/.test(a.country))fail('Choose your registration country.')
 try{const url=new URL(a.website);if(url.protocol!=='https:'||url.username||url.password)throw Error()}catch{fail('Enter a valid HTTPS website.')}
 if(!a.owners.length||!a.owners.some(o=>o.controlPerson))fail('Add at least one person authorized to act for the business.')
 let ownership=0
 for(const o of a.owners){if(!o.fullName||!o.address||!o.idType||!o.idNumber||!/^[A-Z]{2}$/.test(o.issuingCountry)||o.pep===null)fail('Complete identity and PEP details for each owner.')
  const birth=new Date(o.birthDate+'T00:00:00Z'),adult=new Date(now);adult.setUTCFullYear(adult.getUTCFullYear()-18)
  if(!/^\d{4}-\d{2}-\d{2}$/.test(o.birthDate)||!Number.isFinite(birth.getTime())||birth.toISOString().slice(0,10)!==o.birthDate||birth>adult||birth.getUTCFullYear()<1900)fail('Enter a valid date of birth. Representatives must be at least 18.')
  if(!/^\d+(\.\d{1,2})?$/.test(o.ownership)||Number(o.ownership)>100||(!o.controlPerson&&!o.director&&Number(o.ownership)===0))fail('Enter a valid ownership percentage.')
  ownership+=Number(o.ownership)
  if((o.bvn&&!/^\d{11}$/.test(o.bvn))||(o.nin&&!/^\d{11}$/.test(o.nin)))fail('BVN and NIN must contain 11 digits when provided.')
 }
 if(ownership>100.001)fail('Total ownership cannot exceed 100%.')
 for(const slot of [...requiredCompanyDocumentSlots,...a.owners.flatMap(o=>['owner-id:'+o.id,'owner-address:'+o.id])])if(!documents.some(d=>d.slot===slot))fail('Upload all required company and owner documents.')
 if(!a.attested)fail('Confirm that the information is accurate and you are authorized to submit it.')
}
const documentKey=(projectId:string,id:string)=>'hashpaylink:business-document:'+projectId+':'+id
export function inspectBusinessDocument(bytes:Buffer,nameValue:unknown,slot:unknown,now:string):VerificationDocument{
 if(typeof slot!=='string'||!(/^(incorporation|articles|business-address|aml|kyc|licence|other-[123])$/.test(slot)||/^owner-(id|address):[a-zA-Z0-9-]{8,64}$/.test(slot)))fail('Choose a valid document type.')
 if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>5*1024*1024)fail('Upload a PDF, JPEG or PNG up to 5 MB.')
 const mime=bytes.subarray(0,5).toString()==='%PDF-'?'application/pdf':bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':''
 if(!mime)fail('Only PDF, JPEG and PNG documents are supported.')
 const name=String(nameValue??'document').replace(/[^a-zA-Z0-9._ -]/g,'_').slice(0,120)||'document'
 return {id:randomUUID(),slot:slot as string,name,mime,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),uploadedAt:now}
}
export async function storeBusinessDocument(projectId:string,document:VerificationDocument,bytes:Buffer,secret:string){await writeDurableJson(documentKey(projectId,document.id),{cipher:sealVerification(bytes.toString('base64'),secret)})}
export async function readBusinessDocument(projectId:string,document:VerificationDocument,secret:string){const stored=await readDurableJson<{cipher:string}>(documentKey(projectId,document.id));if(!stored)fail('Document not found.',404);const bytes=Buffer.from(openVerification(stored!.cipher,secret),'base64');if(createHash('sha256').update(bytes).digest('hex')!==document.sha256)fail('Document integrity check failed.',503);return bytes}
export async function deleteBusinessDocument(projectId:string,id:string){await queryDurablePostgres('delete from render_durable_kv where store_key=$1',[documentKey(projectId,id)])}
