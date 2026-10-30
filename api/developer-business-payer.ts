import {normalizeBusinessApplication,openVerification,validateBusinessSubmission,type VerificationRecord} from './developer-verification.js'

type BusinessPayerProject = {id:string;ownerId:string;operationalStatus?:string;businessVerification?:VerificationRecord}
const fail=(message:string):never=>{throw Object.assign(new Error(message),{status:409,code:'BUSINESS_PAYER_NOT_READY'})}

// Server-only mapper for a business funding its OWN account. Never use merchant
// KYB for an unrelated checkout customer. This helper sends no provider request.
export function mapPaycrestBusinessPayer(project:BusinessPayerProject, input:{
 actorId:string;projectId:string;verificationRevision:number;purpose:'business-own-funding';currency:'NGN'
}, secret:string, now=new Date()) {
 if(!input.actorId||project.ownerId!==input.actorId||project.id!==input.projectId)fail('Business payer ownership could not be verified.')
 if(input.purpose!=='business-own-funding'||input.currency!=='NGN')fail('This business payer route is not supported.')
 if(project.operationalStatus==='suspended')fail('This business is suspended.')
 const record=project.businessVerification
 if(!record||record.status!=='approved'||!record.cipher||!record.reviewedAt||!Number.isSafeInteger(input.verificationRevision)||record.revision!==input.verificationRevision)fail('Use the current approved business verification.')
 if(!record.history.some(h=>h.action==='approved'&&h.revision===record.revision&&h.smileReference?.trim()))fail('Business review evidence is missing.')
 const application=normalizeBusinessApplication(JSON.parse(openVerification(record.cipher,secret)))
 validateBusinessSubmission(application,record.documents,now)
 const directors=application.owners.filter(o=>o.director===true)
 if(!directors.length)fail('Add and verify at least one director before using business bank funding.')
 const mapped=directors.map(d=>{
  // NGN accepts the director BVN or NIN, not a passport-only substitute.
  const bvn=/^\d{11}$/.test(d.bvn)?d.bvn:''
  const nin=/^\d{11}$/.test(d.nin)?d.nin:d.idType==='National ID'&&d.issuingCountry==='NG'&&/^\d{11}$/.test(d.idNumber)?d.idNumber:''
  if(!bvn&&!nin)fail('Each business funding director needs a verified BVN or NIN.')
  return {personDetails:{fullName:d.fullName,birthDate:d.birthDate,idDocument:{type:bvn?'BVN' as const:'nationalID' as const,number:bvn||nin,issuerCountry:'NG'}},role:'Director'}
 })
 return {projectId:project.id,verificationRevision:record.revision,sourceKyc:{entityType:'organization' as const,organizationDetails:{legalName:application.companyName,...(application.tradingName?{tradingName:application.tradingName}:{}),registrationNumber:application.registrationNumber,registrationCountry:application.country,directors:mapped}}}
}
