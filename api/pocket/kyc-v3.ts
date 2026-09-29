import {ugandaBasicInput,submitUgandaBasic,ugandaBasicResult} from './smile-uganda-basic.js'
import {BASIC_DAILY_NGN,advancedDailyNgn,kycLevelFromJobs} from './kyc-level.js'
import type {Request,Response} from 'express'
import {createHash,createHmac,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto'
import {verifiedPrivyUser} from '../local-currency-profile.js'
import {readDurableJson,mutateDurableJson} from '../render-durable-store.js'
import {smileConfig,type SmileConfig,type SmileEnvironment} from './smile-provider.js'
import {smileV3Token,smileV3Status,smileV3Replay,assertSmileV3Policy,smileIdentityMatchKey,validV3Signature,v3Failure as fail} from './smile-v3.js'
type Method='bvn'|'nin'|'government_id'|'national_id'
type Job={declaredName?:string;userId?:string;resultCode?:string;country?:'NG'|'UG';supersededBy?:string;replayBindingVersion?:number;consent?:{granted:true;grantedAt:string;noticeVersion:string;privacyPolicyUrl:string};submissionHint?:{jobId:string;userId:string};replayedAt?:number;replayAttempts?:number;idTypes?:string[];id:string;method:Method;environment:SmileEnvironment;status:'pending'|'passed'|'failed'|'review';createdAt:number;sessionAt?:number;checkedAt?:number;providerJobId?:string;providerUserId?:string;uploadReportedAt?:number;callbackProof:string;bvnJobId?:string;legalName?:string;firstName?:string;lastName?:string;identityMatch?:string;failureReason?:string;providerStatus?:string}
type Store={jobs:Job[]}
const key=(owner:string,environment:SmileEnvironment)=>'hashpaylink:pocket-kyc:v3:'+environment+':'+createHash('sha256').update(owner).digest('hex')
const indexKey=(id:string)=>'hashpaylink:pocket-kyc-job:v3:'+id
export function v3Policy(method:Method,country:'NG'|'UG'='NG'){
 if(country==='UG'&& !['government_id','national_id'].includes(method))throw fail('Choose a Ugandan government ID.',400)
 if(method==='national_id'){if(country!=='UG')throw fail('Choose a supported verification method.',400);return {country,countryName:'Uganda',provider:'smile',policyVersion:'ug-smile-basic-v2',method,product:'basic_kyc',apiProduct:'basic_kyc',idSelection:{[country]:['NATIONAL_ID_NO_PHOTO']} as Record<string,string[]>,consentRequired:{[country]:[]},previewBVNMFA:false}}
 const document=method==='government_id'
 const types=document?['PASSPORT','DRIVERS_LICENSE','IDENTITY_CARD']:[method==='bvn'?'BVN':'NIN_V2']
 return{country,countryName:country==='UG'?'Uganda':'Nigeria',provider:'smile',policyVersion:country.toLowerCase()+'-smile-'+method+'-api-v3',method,product:document?'doc_verification':'biometric_kyc',apiProduct:document?'document_verification':'biometric_kyc',idSelection:{[country]:types} as Record<string,string[]>,consentRequired:{[country]:[]},previewBVNMFA:false}
}
function jobPolicy(j?:Job){const policy=v3Policy(j?.method||'bvn',j?.country||'NG');if(j?.idTypes)policy.idSelection[policy.country]=j.idTypes;else if(j?.method==='government_id'&&!j.country)policy.idSelection.NG=['PASSPORT','DRIVERS_LICENSE','NATIONAL_ID'];return policy}
const isBasic=(j:Job)=>j.country==='UG'?['government_id','national_id'].includes(j.method):j.method==='bvn'
const bvn=(jobs:Job[])=>jobs.find(j=>isBasic(j)&&j.status==='passed'&&j.identityMatch)
const complete=(jobs:Job[])=>jobs.find(j=>j.country!=='UG'&&j.method!=='bvn'&&j.status==='passed'&&j.identityMatch&&jobs.some(b=>b.id===j.bvnJobId&&b.method==='bvn'&&b.status==='passed'&&b.identityMatch===j.identityMatch))
const correctable=(j?:Job)=>j?.method==='bvn'&&j.status==='review'&&j.failureReason==='submitted_name_mismatch'&&!j.supersededBy
const resumable=(j?:Job)=>!!j&&j.method!=='national_id'&&!j.providerJobId&&!j.uploadReportedAt&&['pending','review'].includes(j.status)
function publicFlow(jobs:Job[],environment:SmileEnvironment){const j=jobs.at(-1),first=bvn(jobs),done=complete(jobs);return{environment,apiVersion:3,paymentLevel:environment==='production'?(kycLevelFromJobs(jobs).paymentLevel||'none'):'none',basicDailyLimitNgn:BASIC_DAILY_NGN,advancedDailyLimitNgn:advancedDailyNgn(),level:environment==='production'?(done?'advanced':first?'basic':'none'):'none',status:j?.status||'not_started',jobId:j?.id||null,verification:jobPolicy(j),verified:environment==='production'&&!!done,canResume:resumable(j),canCorrectNames:correctable(j),uploadReported:!!j?.uploadReportedAt,failureReason:j?.failureReason||null,workflow:{basicPassed:!!first,bvnPassed:!!first&&first.method==='bvn',complete:!!done,needsAdditional:first?.country!=='UG'&&!!first&&!done&&(!j||j.method==='bvn'||j.status==='failed'),methods:first?.country==='UG'?[]:['nin','government_id']}}}
export async function requireV3ProductionKyc(owner:string){const r=await readDurableJson<Store>(key(owner,'production'));const j=complete(r?.jobs||[]);if(!j?.legalName)throw fail('Complete identity verification before setting up your POS.',403);return j.legalName}
function evidence(config:SmileConfig,fields:Record<string,unknown>){
 const legalName=String(fields.full_name||[fields.first_name,fields.other_names,fields.last_name].filter(x=>typeof x==='string').join(' ')).replace(/\s+/g,' ').trim().slice(0,160)
 const dob=typeof fields.date_of_birth==='string'?fields.date_of_birth:''
 const valid=/^\d{4}-\d{2}-\d{2}$/.test(dob)&&!Number.isNaN(Date.parse(dob))&&new Date(dob).toISOString().slice(0,10)===dob
 const name=legalName.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N} ]/gu,'').split(/\s+/).filter(Boolean).sort().join(' ')
 return{legalName,identityMatch:name&&valid?createHmac('sha256',smileIdentityMatchKey(config)).update('pocket-identity-v1|'+name+'|'+dob).digest('hex'):undefined}
}
async function refresh(config:SmileConfig,owner:string,j:Job){
 if(j.method==='national_id'){
  if(['passed','failed'].includes(j.status)||Date.now()-(j.checkedAt||0)<30000)return
  let claimed=false
  await mutateDurableJson<Store>(key(owner,config.environment),r=>{const v=r?.jobs.find(x=>x.id===j.id);if(v&&!['passed','failed'].includes(v.status)&&Date.now()-(v.checkedAt||0)>=30000){v.checkedAt=Date.now();claimed=true}return r||{jobs:[]}})
  if(!claimed||!j.userId)return
  const result=await ugandaBasicResult(config,j.id,j.userId)
  if(!result&&Date.now()-j.createdAt>24*60*60*1000)await mutateDurableJson<Store>(key(owner,config.environment),r=>{const v=r?.jobs.find(x=>x.id===j.id);if(v&&v.status==='pending'){v.status='review';v.failureReason='provider_review'}return r||{jobs:[]}})
  if(result)await mutateDurableJson<Store>(key(owner,config.environment),r=>{const v=r?.jobs.find(x=>x.id===j.id);if(v&&!['passed','failed'].includes(v.status))Object.assign(v,result);return r||{jobs:[]}})
  return
 }

 const providerJobId=j.providerJobId||j.submissionHint?.jobId,providerUserId=j.providerUserId||j.submissionHint?.userId
 if(!providerJobId||j.status==='review'&&!!j.failureReason&&!['provider_fraud_review','submitted_name_mismatch'].includes(j.failureReason)||['passed','failed'].includes(j.status)||Date.now()-(j.checkedAt||0)<30000)return
 let claimed=false
 await mutateDurableJson<Store>(key(owner,config.environment),r=>{const v=r?.jobs.find(x=>x.id===j.id);if(v&&!['passed','failed'].includes(v.status)&&Date.now()-(v.checkedAt||0)>=30000){v.checkedAt=Date.now();claimed=true}return r||{jobs:[]}})
 if(!claimed)return
 const result=await smileV3Status(config,providerJobId)
 if(result.job_id!==providerJobId||result.status!=='not_found'&&result.user_id!==providerUserId)throw fail('Verification reference did not match.')
 let replay=false
 await mutateDurableJson<Store>(key(owner,config.environment),r=>{
  const v=r?.jobs.find(x=>x.id===j.id)
  if(v&&!['passed','failed'].includes(v.status)){
   // An untrusted browser reference must never assign the identity or a verdict.
   if(v.providerJobId===providerJobId){v.providerStatus=result.status;if(result.status==='block'||result.status==='error'){v.status='failed';v.failureReason=result.status==='error'?'provider_error':'provider_rejected'}else if(['clear','attention','not_found'].includes(result.status))v.status='review'}
   if(v.replayBindingVersion!==2){v.replayAttempts=0;v.replayedAt=0;v.replayBindingVersion=2}
   if(['clear','block','attention','error'].includes(result.status)&&(v.replayAttempts||0)<3&&Date.now()-(v.replayedAt||0)>=300000){v.replayedAt=Date.now();v.replayAttempts=(v.replayAttempts||0)+1;replay=true}
  }
  return r||{jobs:[]}
 })
 if(replay)await smileV3Replay(config,providerJobId,{reference:j.id,proof:j.callbackProof})
}
export default async function pocketKycV3(req:Request,res:Response){
 res.setHeader('Cache-Control','no-store');if(req.method!=='POST')return res.status(405).json({ok:false,error:'Method not allowed.'})
 try{
  const identity=await verifiedPrivyUser(req),config=smileConfig(),action=req.body?.action,k=key(identity.userId,config.environment)
  if(!['status','eligibility','start','resume','uploaded','correct_names'].includes(action))throw fail('Invalid verification action.',400)
  let record=await readDurableJson<Store>(k),latest=record?.jobs.at(-1)
  if(action==='status'||action==='eligibility'){if(latest)await refresh(config,identity.userId,latest);record=await readDurableJson<Store>(k);return res.json({ok:true,...publicFlow(record?.jobs||[],config.environment)})}
  if(action==='uploaded'){
   if(!latest||req.body.jobId!==latest.id)throw fail('Verification reference did not match.',409)
   const hint=req.body.submission
   if(hint!==undefined&&(!hint||typeof hint.jobId!=='string'||!/^job_[0-9a-hjkmnp-tv-z]{26}$/.test(hint.jobId)||typeof hint.userId!=='string'||!hint.userId||hint.userId.length>160))throw fail('Invalid submission reference.',400)
   record=await mutateDurableJson<Store>(k,r=>{const j=r?.jobs.find(x=>x.id===latest!.id);if(j&&!['passed','failed'].includes(j.status)){j.uploadReportedAt||=Date.now();if(hint){if(j.submissionHint&&(j.submissionHint.jobId!==hint.jobId||j.submissionHint.userId!==hint.userId))throw fail('Submission reference changed.',409);j.submissionHint={jobId:hint.jobId,userId:hint.userId}}}return r||{jobs:[]}})
   return res.json({ok:true,...publicFlow(record.jobs,config.environment)})
  }
  if(req.body.consent!==true)throw fail('Please consent to identity verification first.',400)
  const country=req.body.country ?? latest?.country ?? 'NG'
  if(!['NG','UG'].includes(country))throw fail('Identity verification is not available for this country yet.',409)
  if(latest && (latest.country||'NG')!==country && (latest.status!=='failed'||latest.uploadReportedAt))throw fail('Finish your existing verification before changing country.',409)
  if(action==='start'&&latest?.status==='failed'&&!['session_failed','provider_error'].includes(latest.failureReason||''))throw fail('Contact support to review your verification before trying again.',409)
  if(action==='correct_names'&&(!correctable(latest)||req.body.jobId!==latest?.id))throw fail('This verification is not eligible for name correction.',409)
  const method=action==='correct_names'?'bvn':action==='resume'?latest?.method:req.body.method||(country==='UG'?'national_id':'bvn')
  if(!['bvn','nin','government_id','national_id'].includes(method))throw fail('Choose a supported verification method.',400)
  if(action==='resume'&&(!resumable(latest)||req.body.method!==undefined&&req.body.method!==method))throw fail('Check progress before continuing verification.',409)
  const basicInput=method==='national_id'?ugandaBasicInput(req.body.identity):undefined
  smileIdentityMatchKey(config)
  const policy=action==='resume'?jobPolicy(latest):v3Policy(method,country)
  policy.idSelection[policy.country]=await assertSmileV3Policy(config,policy)
  const candidate:Job=action==='resume'?latest!:{country,id:'pkyc_'+randomUUID().replaceAll('-',''),method,environment:config.environment,status:'pending',createdAt:Date.now(),idTypes:policy.idSelection[policy.country],callbackProof:randomBytes(32).toString('hex')}
  if(basicInput){candidate.declaredName=basicInput.fullName;candidate.userId='pug_'+createHash('sha256').update(identity.userId).digest('hex');candidate.identityMatch=createHmac('sha256',smileIdentityMatchKey(config)).update('ug-national-id|'+basicInput.idNumber).digest('hex')}
  // Preserve legacy records. Never restart a legacy submission which may still settle.
  if(!record?.jobs.length){const old=await readDurableJson<{jobs:Array<{status:string;submitted?:boolean;uploadReportedAt?:number}>}>('hashpaylink:pocket-kyc:v1:'+config.environment+':'+createHash('sha256').update(identity.userId).digest('hex'));if(old?.jobs.some(j=>['pending','review'].includes(j.status)&&(j.submitted||j.uploadReportedAt)))throw fail('Your earlier verification needs review before starting a new one.',409)}
  await mutateDurableJson<Store>(k,r=>{const jobs=r?.jobs||[];if(action==='start'||action==='correct_names'){
   const correction=action==='correct_names'?jobs.find(j=>j.id===latest?.id):undefined
   if(action==='correct_names'&&!correctable(correction))throw fail('This verification was already updated.',409)
   if(jobs.some(j=>['pending','review'].includes(j.status)&&!(action==='correct_names'&&j.id===correction?.id))||complete(jobs)||(method==='bvn'||country==='UG')&&bvn(jobs))throw fail('Check your existing verification before starting another.',409)
   if(jobs.filter(j=>Date.now()-j.createdAt<86400000).length>=5)throw fail('Daily verification attempt limit reached. Try again tomorrow.',429)
   if(country==='NG'&&method!=='bvn'){const first=bvn(jobs);if(!first)throw fail('Complete BVN verification first.',409);candidate.bvnJobId=first.id}
   if(correction){correction.supersededBy=candidate.id;correction.status='failed';correction.failureReason='superseded_name_correction'}
   candidate.sessionAt=Date.now();candidate.consent={granted:true,grantedAt:new Date().toISOString(),noticeVersion:'pocket-smile-2026-09-24',privacyPolicyUrl:'https://app.hashpaylink.com/docs/privacy'};return{jobs:[...jobs,candidate]}
  }const j=jobs.find(x=>x.id===candidate.id);if(!resumable(j)||Date.now()-(j!.sessionAt||0)<20000)throw fail('Your verification is already opening. Please wait.',409);j!.sessionAt=Date.now();j!.idTypes=policy.idSelection[policy.country];j!.consent={granted:true,grantedAt:new Date().toISOString(),noticeVersion:'pocket-smile-2026-09-24',privacyPolicyUrl:'https://app.hashpaylink.com/docs/privacy'};return{jobs}})
  await mutateDurableJson<{owner:string;environment:SmileEnvironment}>(indexKey(candidate.id),()=>({owner:identity.userId,environment:config.environment}))
  if(basicInput){
   const callback=new URL(config.callbackUrl);callback.searchParams.set('ug_basic',candidate.id);callback.searchParams.set('proof',candidate.callbackProof)
   await submitUgandaBasic(config,basicInput,{jobId:candidate.id,userId:candidate.userId!,callbackUrl:callback.toString()})
   record=await readDurableJson<Store>(k);return res.json({ok:true,...publicFlow(record?.jobs||[],config.environment)})
  }
  try{const callback=new URL(config.callbackUrl);callback.searchParams.set('reference',candidate.id);callback.searchParams.set('proof',candidate.callbackProof)
   const token=await smileV3Token(config,{product:policy.apiProduct,reference:candidate.id,callbackUrl:callback.toString(),country:policy.country,...candidate.method!=='government_id'?{idType:policy.idSelection[policy.country][0]}:{}})
   record=await readDurableJson<Store>(k);return res.json({ok:true,...publicFlow(record?.jobs||[],config.environment),token,partnerId:config.partnerId,callbackUrl:config.callbackUrl,partnerParams:{internal_reference:candidate.id}})
  }catch(error){await mutateDurableJson<Store>(k,r=>{const j=r?.jobs.find(x=>x.id===candidate.id);if(j&&!j.providerJobId&&!j.uploadReportedAt){if(action==='start'||action==='correct_names'){j.status='failed';j.failureReason='session_failed'}else j.sessionAt=0}return r||{jobs:[]}});throw error}
 }catch(error){const detail=error as Error&{status?:number;code?:string;retryable?:boolean},status=detail.status||503;return res.status(status).json({ok:false,code:detail.code?.startsWith('KYC_')?detail.code:undefined,retryable:detail.retryable??status>=500,error:status<500||detail.code?.startsWith('KYC_')?detail.message:'Identity verification could not load. Please try again.'})}
}
export async function pocketKycV3Callback(req:Request,res:Response){
 const reject=(status:number,reason:string)=>{console.warn('[pocket-kyc-callback]',JSON.stringify({reason,hasSignature:typeof req.headers['response-signature']==='string',hasTimestamp:typeof req.headers['response-timestamp']==='string',hasReference:typeof req.query?.reference==='string',hasProof:typeof req.query?.proof==='string',hasJobHeader:typeof req.headers['job-id']==='string',headerNames:Object.keys(req.headers).filter(k=>/job|user|smile|response/.test(k)),bodyKeys:Object.keys(req.body||{}),partnerParamKeys:Object.keys(req.body?.partner_params||{}),hasUserHeader:typeof req.headers['user-id']==='string',timestampAgeMinutes:Number.isFinite(Date.parse(String(req.headers['response-timestamp'])))?Math.round((Date.now()-Date.parse(String(req.headers['response-timestamp'])))/60000):null}));return res.status(status).json({ok:false})}
 try{
  const config=smileConfig();if(!validV3Signature(config,req.headers))return reject(401,'signature')
  const reference=req.query.reference,proof=req.query.proof,body=req.body||{}
  // Smile V3 deployments expose correlation in headers and/or the documented
  // payload. All supplied references must agree; none can override another.
  const identifiers=(values:unknown[])=>{const supplied=values.filter(v=>v!==undefined&&v!==null&&v!=='');return supplied.every(v=>typeof v==='string')&&new Set(supplied).size===1?supplied[0] as string:undefined}
  const providerJobId=identifiers([req.headers['job-id'],req.headers['job_id'],req.headers['smile-job-id'],body.job_id,body.partner_params?.job_id])
  const providerUserId=identifiers([req.headers['user-id'],req.headers['user_id'],body.user_id,body.partner_params?.user_id])
  if(typeof reference!=='string'||!/^pkyc_[a-f0-9]{32}$/.test(reference)||typeof proof!=='string'||!/^[a-f0-9]{64}$/.test(proof)||typeof providerJobId!=='string'||!/^job_[0-9a-hjkmnp-tv-z]{26}$/.test(providerJobId)||typeof providerUserId!=='string'||!providerUserId||providerUserId.length>160)return reject(400,'routing_or_provider_headers')
  const index=await readDurableJson<{owner:string;environment:SmileEnvironment}>(indexKey(reference));if(!index||index.environment!==config.environment)return reject(404,'session_index')
  const k=key(index.owner,index.environment),record=await readDurableJson<Store>(k),selected=record?.jobs.find(j=>j.id===reference)
  if(!selected||selected.method==='national_id'||!timingSafeEqual(Buffer.from(proof,'hex'),Buffer.from(selected.callbackProof,'hex')))return reject(401,'session_proof')
  if(body.partner_params?.internal_reference!==reference||body.product!==jobPolicy(selected).apiProduct||selected.providerJobId&&selected.providerJobId!==providerJobId||selected.providerUserId&&selected.providerUserId!==providerUserId)return reject(409,'correlation')
  // Header HMAC authenticates timestamp, not JSON. A per-session callback proof and
  // credentialed status lookup bind the payload to the token and actual provider job.
  // Persist only authenticated correlation before a transient provider lookup can fail.
  // This enables bounded status/replay recovery; it does not approve the identity.
  await mutateDurableJson<Store>(k,current=>{const j=current?.jobs.find(x=>x.id===reference);if(!j)throw fail('Unknown verification.',404);if(j.providerJobId&&j.providerJobId!==providerJobId||j.providerUserId&&j.providerUserId!==providerUserId)throw fail('Verification reference changed.',409);j.providerJobId=providerJobId;j.providerUserId=providerUserId;return current!})
  const authoritative=await smileV3Status(config,providerJobId)
  if(authoritative.job_id!==providerJobId||authoritative.user_id!==providerUserId||authoritative.status!==body.status)return reject(409,'provider_status')
  if(!['clear','block','attention','error'].includes(body.status))return reject(409,'terminal_status')
  const fields=body.id_fields&&typeof body.id_fields==='object'?body.id_fields:{},identity=evidence(config,fields)
  const typeMatches=selected.method!=='government_id'||fields.country===jobPolicy(selected).country&&jobPolicy(selected).idSelection[jobPolicy(selected).country].includes(fields.id_type)
  // Smile's authenticated final verdict controls approval. Risk signals are advisory;
  // they must not override a clear result with a second Pocket risk decision.
  const approved=body.status==='clear'&&typeMatches&&!!identity.identityMatch
  await mutateDurableJson<Store>(k,current=>{const j=current?.jobs.find(x=>x.id===reference);if(!j)throw fail('Unknown verification.',404)
   if(j.providerJobId&&j.providerJobId!==providerJobId)throw fail('Verification reference changed.',409)
   if(j.status==='passed'&&approved&&j.identityMatch===identity.identityMatch){j.firstName=String(fields.first_name||'').trim();j.lastName=String(fields.last_name||'').trim()}
   if(['passed','failed'].includes(j.status)&&j.providerJobId)return current!
   j.providerJobId=providerJobId;j.providerUserId=providerUserId;j.providerStatus=body.status;j.checkedAt=Date.now();j.uploadReportedAt||=Date.now()
   const first=current!.jobs.find(x=>x.id===j.bvnJobId&&x.status==='passed'&&x.method==='bvn')
   const pairMatches=isBasic(j)||!!first?.identityMatch&&first.identityMatch===identity.identityMatch
   j.status=approved&&pairMatches?'passed':['block','error'].includes(body.status)?'failed':'review'
   if(approved){j.legalName=identity.legalName;j.identityMatch=identity.identityMatch;j.firstName=String(fields.first_name||'').trim();j.lastName=String(fields.last_name||'').trim()}
   if(approved&&pairMatches)delete j.failureReason
   if(approved&&!pairMatches)j.failureReason='identity_mismatch'
   else if(body.status==='block')j.failureReason='provider_rejected'
   else if(body.status==='error')j.failureReason='provider_error'
   else if(body.status==='clear'&&!approved)j.failureReason=!typeMatches?'document_type_mismatch':!identity.legalName?'identity_name_missing':'identity_birth_date_missing_or_invalid'
   if(j.status==='review')console.warn('[pocket-kyc-callback]',JSON.stringify({reason:j.failureReason||'provider_review',fieldNames:Object.keys(fields),hasName:!!identity.legalName,hasIdentityMatch:!!identity.identityMatch,dateType:typeof fields.date_of_birth,dateFormat:typeof fields.date_of_birth==='string'?fields.date_of_birth.replace(/[0-9]/g,'0').replace(/[a-zA-Z]/g,'x'):null}))
   return current!
  });return res.json({ok:true})
 }catch(error){return res.status((error as {status?:number}).status||503).json({ok:false})}
}

export async function pocketUgandaBasicCallback(req:Request,res:Response){
 try{
  const config=smileConfig(),reference=req.query.ug_basic,proof=req.query.proof
  if(typeof reference!=='string'||!/^pkyc_[a-f0-9]{32}$/.test(reference)||typeof proof!=='string'||!/^[a-f0-9]{64}$/.test(proof))return res.status(400).json({ok:false})
  const index=await readDurableJson<{owner:string;environment:SmileEnvironment}>(indexKey(reference))
  if(!index||index.environment!==config.environment)return res.status(404).json({ok:false})
  const record=await readDurableJson<Store>(key(index.owner,index.environment)),j=record?.jobs.find(x=>x.id===reference)
  if(!j||j.method!=='national_id'||!timingSafeEqual(Buffer.from(proof,'hex'),Buffer.from(j.callbackProof,'hex')))return res.status(401).json({ok:false})
  // Ask Smile to retry a callback that arrives during an in-flight status check.
  if(!['passed','failed'].includes(j.status)&&Date.now()-(j.checkedAt||0)<30000)return res.status(503).json({ok:false})
  // Notification body never grants approval; fetch a signed, credentialed provider result.
  await refresh(config,index.owner,j)
  return res.json({ok:true})
 }catch{return res.status(503).json({ok:false})}
}
