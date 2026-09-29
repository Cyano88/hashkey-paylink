import {storedKycPolicy} from './kyc-policy.js'
import {createHash} from 'node:crypto'
import {readDurableJson} from '../render-durable-store.js'
export const BASIC_DAILY_NGN = 50_000
export type PocketKycLevel = 'none' | 'basic' | 'advanced'
export function advancedDailyNgn() {
 const value=Number(process.env.POCKET_ADVANCED_DAILY_LIMIT_NGN)
 return Number.isSafeInteger(value*100)&&value>BASIC_DAILY_NGN?value:null
}
export function kycLevelFromJobs(jobs:any[],legacy=false):{level:PocketKycLevel;country?:'NG'|'UG';paymentLevel?:PocketKycLevel;legalName?:string;declaredName?:string;firstName?:string;lastName?:string;reference?:string} {
 const method=(j:any)=>{try{return legacy?storedKycPolicy(j).method:j.method}catch{return undefined}}
 const basic=jobs.find(j=>j.environment==='production'&&j.status==='passed'&&(method(j)==='bvn'&&(j.country===undefined||j.country==='NG')||!legacy&&j.country==='UG'&&method(j)==='government_id')&&j.identityMatch&&j.legalName || !legacy&&j.environment==='production'&&j.country==='UG'&&method(j)==='national_id'&&j.status==='passed'&&j.resultCode==='1020'&&j.identityMatch)
 if(!basic)return {level:'none'}
 const advanced=jobs.find(j=>j.environment==='production'&&j.status==='passed'&&j.country!=='UG'&&['nin','government_id'].includes(method(j))&&j.identityMatch&&jobs.some(b=>b.id===j.bvnJobId&&b.environment==='production'&&b.status==='passed'&&method(b)==='bvn'&&b.identityMatch===j.identityMatch))
 return {level:advanced?'advanced':'basic',country:basic.country==='UG'?'UG':'NG',paymentLevel:advanced||basic.country==='UG'?'advanced':'basic',legalName:basic.legalName,declaredName:basic.country==='UG'?basic.declaredName:undefined,firstName:basic.firstName,lastName:basic.lastName,reference:basic.providerJobId||basic.id}
}
export async function readPocketKycLevel(owner:string) {
 const hash=createHash('sha256').update(owner).digest('hex')
 const [current,legacy]=await Promise.all(['v3','v1'].map(v=>readDurableJson<{jobs:any[]}>('hashpaylink:pocket-kyc:'+v+':production:'+hash)))
 const a=kycLevelFromJobs(current?.jobs||[]),b=kycLevelFromJobs(legacy?.jobs||[],true)
 return a.level==='advanced'?a:b.level==='advanced'?b:a.level==='basic'?a:b
}
export async function requirePocketBasicKyc(owner:string) {
 const result=await readPocketKycLevel(owner)
 if(result.level==='none')throw Object.assign(Error('Complete Basic verification to use bank transfers.'),{status:403,code:'KYC_BASIC_REQUIRED'})
 return result
}
