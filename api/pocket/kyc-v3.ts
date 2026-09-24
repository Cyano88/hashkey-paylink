import type {Request,Response} from 'express'
import {createHash,createHmac,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto'
import {verifiedPrivyUser} from '../local-currency-profile.js'
import {readDurableJson,mutateDurableJson} from '../render-durable-store.js'
import {smileConfig,type SmileConfig,type SmileEnvironment} from './smile-provider.js'
import {smileV3Token,smileV3Status,smileV3Replay,assertSmileV3Policy,smileIdentityMatchKey,validV3Signature,v3Failure as fail} from './smile-v3.js'
type Method='bvn'|'nin'|'government_id'
type Job={consent?:{granted:true;grantedAt:string;noticeVersion:string;privacyPolicyUrl:string};submissionHint?:{jobId:string;userId:string};replayedAt?:number;replayAttempts?:number;idTypes?:string[];id:string;method:Method;environment:SmileEnvironment;status:'pending'|'passed'|'failed'|'review';createdAt:number;sessionAt?:number;checkedAt?:number;providerJobId?:string;providerUserId?:string;uploadReportedAt?:number;callbackProof:string;bvnJobId?:string;legalName?:string;identityMatch?:string;failureReason?:string;providerStatus?:string}
type Store={jobs:Job[]}
const key=(owner:string,environment:SmileEnvironment)=>'hashpaylink:pocket-kyc:v3:'+environment+':'+createHash('sha256').update(owner).digest('hex')
const indexKey=(id:string)=>'hashpaylink:pocket-kyc-job:v3:'+id
export function v3Policy(method:Method){return{country:'NG',countryName:'Nigeria',provider:'smile',policyVersion:'ng-smile-'+method+'-api-v3',method,product:method==='government_id'?'doc_verification':'biometric_kyc',apiProduct:method==='government_id'?'document_verification':'biometric_kyc',idSelection:{NG:method==='government_id'?['PASSPORT','DRIVERS_LICENSE','IDENTITY_CARD']:[method==='bvn'?'BVN':'NIN_V2']},consentRequired:{NG:[]},previewBVNMFA:false}}
function jobPolicy(j?:Job){const policy=v3Policy(j?.method||'bvn');if(j?.idTypes)policy.idSelection.NG=j.idTypes;else if(j?.method==='government_id')policy.idSelection.NG=['PASSPORT','DRIVERS_LICENSE','NATIONAL_ID'];return policy}
const bvn=(jobs:Job[])=>jobs.find(j=>j.method==='bvn'&&j.status==='passed'&&j.identityMatch)
const complete=(jobs:Job[])=>jobs.find(j=>j.method!=='bvn'&&j.status==='passed'&&j.identityMatch&&jobs.some(b=>b.id===j.bvnJobId&&b.method==='bvn'&&b.status==='passed'&&b.identityMatch===j.identityMatch))
const resumable=(j?:Job)=>!!j&&!j.providerJobId&&!j.uploadReportedAt&&['pending','review'].includes(j.status)
function publicFlow(jobs:Job[],environment:SmileEnvironment){const j=jobs.at(-1),first=bvn(jobs),done=complete(jobs);return{environment,apiVersion:3,status:j?.status||'not_started',jobId:j?.id||null,verification:jobPolicy(j),verified:environment==='production'&&!!done,canResume:resumable(j),uploadReported:!!j?.uploadReportedAt,failureReason:j?.failureReason||null,workflow:{bvnPassed:!!first,complete:!!done,needsAdditional:!!first&&!done&&(!j||j.method==='bvn'||j.status==='failed'),methods:['nin','government_id']}}}
export async function requireV3ProductionKyc(owner:string){const r=await readDurableJson<Store>(key(owner,'production'));const j=complete(r?.jobs||[]);if(!j?.legalName)throw fail('Complete identity verification before setting up your POS.',403);return j.legalName}
function evidence(config:SmileConfig,fields:Record<string,unknown>){
 const legalName=String(fields.full_name||[fields.first_name,fields.other_names,fields.last_name].filter(x=>typeof x==='string').join(' ')).replace(/\s+/g,' ').trim().slice(0,160)
 const dob=typeof fields.date_of_birth==='string'?fields.date_of_birth:''
 const valid=/^\d{4}-\d{2}-\d{2}$/.test(dob)&&!Number.isNaN(Date.parse(dob))&&new Date(dob).toISOString().slice(0,10)===dob
 const name=legalName.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N} ]/gu,'').split(/\s+/).filter(Boolean).sort().join(' ')
 return{legalName,identityMatch:name&&valid?createHmac('sha256',smileIdentityMatchKey(config)).update('pocket-identity-v1|'+name+'|'+dob).digest('hex'):undefined}
}
async function refresh(config:SmileConfig,owner:string,j:Job){
 const providerJobId=j.providerJobId||j.submissionHint?.jobId,providerUserId=j.providerUserId||j.submissionHint?.userId
 if(!providerJobId||['passed','failed'].includes(j.status)||Date.now()-(j.checkedAt||0)<30000)return
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
   if(['clear','block','attention','error'].includes(result.status)&&(v.replayAttempts||0)<3&&Date.now()-(v.replayedAt||0)>=300000){v.replayedAt=Date.now();v.replayAttempts=(v.replayAttempts||0)+1;replay=true}
  }
  return r||{jobs:[]}
 })
 if(replay)await smileV3Replay(config,providerJobId)
}
export default async function pocketKycV3(req:Request,res:Response){
 res.setHeader('Cache-Control','no-store');if(req.method!=='POST')return res.status(405).json({ok:false,error:'Method not allowed.'})
 try{
  const identity=await verifiedPrivyUser(req),config=smileConfig(),action=req.body?.action,k=key(identity.userId,config.environment)
  if(!['status','eligibility','start','resume','uploaded'].includes(action))throw fail('Invalid verification action.',400)
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
  if(req.body.country!==undefined&&req.body.country!=='NG')throw fail('Identity verification is not available for this country yet.',409)
  const method=action==='resume'?latest?.method:req.body.method||'bvn'
  if(!['bvn','nin','government_id'].includes(method))throw fail('Choose a supported verification method.',400)
  if(action==='resume'&&(!resumable(latest)||req.body.method!==undefined&&req.body.method!==method))throw fail('Check progress before continuing verification.',409)
  smileIdentityMatchKey(config)
  const policy=action==='resume'?jobPolicy(latest):v3Policy(method)
  policy.idSelection.NG=await assertSmileV3Policy(config,policy)
  const candidate:Job=action==='resume'?latest!:{id:'pkyc_'+randomUUID().replaceAll('-',''),method,environment:config.environment,status:'pending',createdAt:Date.now(),idTypes:policy.idSelection.NG,callbackProof:randomBytes(32).toString('hex')}
  // Preserve legacy records. Never restart a legacy submission which may still settle.
  if(!record?.jobs.length){const old=await readDurableJson<{jobs:Array<{status:string;submitted?:boolean;uploadReportedAt?:number}>}>('hashpaylink:pocket-kyc:v1:'+config.environment+':'+createHash('sha256').update(identity.userId).digest('hex'));if(old?.jobs.some(j=>['pending','review'].includes(j.status)&&(j.submitted||j.uploadReportedAt)))throw fail('Your earlier verification needs review before starting a new one.',409)}
  await mutateDurableJson<Store>(k,r=>{const jobs=r?.jobs||[];if(action==='start'){
   if(jobs.some(j=>['pending','review'].includes(j.status))||complete(jobs)||method==='bvn'&&bvn(jobs))throw fail('Check your existing verification before starting another.',409)
   if(jobs.filter(j=>Date.now()-j.createdAt<86400000).length>=5)throw fail('Daily verification attempt limit reached. Try again tomorrow.',429)
   if(method!=='bvn'){const first=bvn(jobs);if(!first)throw fail('Complete BVN verification first.',409);candidate.bvnJobId=first.id}
   candidate.sessionAt=Date.now();candidate.consent={granted:true,grantedAt:new Date().toISOString(),noticeVersion:'pocket-smile-2026-09-24',privacyPolicyUrl:'https://app.hashpaylink.com/docs/privacy'};return{jobs:[...jobs,candidate]}
  }const j=jobs.find(x=>x.id===candidate.id);if(!resumable(j)||Date.now()-(j!.sessionAt||0)<20000)throw fail('Your verification is already opening. Please wait.',409);j!.sessionAt=Date.now();j!.idTypes=policy.idSelection.NG;j!.consent={granted:true,grantedAt:new Date().toISOString(),noticeVersion:'pocket-smile-2026-09-24',privacyPolicyUrl:'https://app.hashpaylink.com/docs/privacy'};return{jobs}})
  await mutateDurableJson<{owner:string;environment:SmileEnvironment}>(indexKey(candidate.id),()=>({owner:identity.userId,environment:config.environment}))
  try{const callback=new URL(config.callbackUrl);callback.searchParams.set('reference',candidate.id);callback.searchParams.set('proof',candidate.callbackProof)
   const token=await smileV3Token(config,{product:policy.apiProduct,reference:candidate.id,callbackUrl:callback.toString(),country:'NG',...candidate.method!=='government_id'?{idType:policy.idSelection.NG[0]}:{}})
   record=await readDurableJson<Store>(k);return res.json({ok:true,...publicFlow(record?.jobs||[],config.environment),token,partnerId:config.partnerId,callbackUrl:config.callbackUrl,partnerParams:{internal_reference:candidate.id}})
  }catch(error){await mutateDurableJson<Store>(k,r=>{const j=r?.jobs.find(x=>x.id===candidate.id);if(j&&!j.providerJobId&&!j.uploadReportedAt){if(action==='start'){j.status='failed';j.failureReason='session_failed'}else j.sessionAt=0}return r||{jobs:[]}});throw error}
 }catch(error){const detail=error as Error&{status?:number;code?:string;retryable?:boolean},status=detail.status||503;return res.status(status).json({ok:false,code:detail.code?.startsWith('KYC_')?detail.code:undefined,retryable:detail.retryable??status>=500,error:status<500||detail.code?.startsWith('KYC_')?detail.message:'Identity verification could not load. Please try again.'})}
}
export async function pocketKycV3Callback(req:Request,res:Response){
 try{
  const config=smileConfig();if(!validV3Signature(config,req.headers))return res.status(401).json({ok:false})
  const reference=req.query.reference,proof=req.query.proof,body=req.body||{},providerJobId=req.headers['job-id'],providerUserId=req.headers['user-id']
  if(typeof reference!=='string'||!/^pkyc_[a-f0-9]{32}$/.test(reference)||typeof proof!=='string'||!/^[a-f0-9]{64}$/.test(proof)||typeof providerJobId!=='string'||!/^job_[0-9a-hjkmnp-tv-z]{26}$/.test(providerJobId)||typeof providerUserId!=='string'||!providerUserId||providerUserId.length>160)return res.status(400).json({ok:false})
  const index=await readDurableJson<{owner:string;environment:SmileEnvironment}>(indexKey(reference));if(!index||index.environment!==config.environment)return res.status(404).json({ok:false})
  const k=key(index.owner,index.environment),record=await readDurableJson<Store>(k),selected=record?.jobs.find(j=>j.id===reference)
  if(!selected||!timingSafeEqual(Buffer.from(proof,'hex'),Buffer.from(selected.callbackProof,'hex')))return res.status(401).json({ok:false})
  if(body.partner_params?.internal_reference!==reference||body.product!==jobPolicy(selected).apiProduct||selected.providerJobId&&selected.providerJobId!==providerJobId||selected.providerUserId&&selected.providerUserId!==providerUserId)return res.status(409).json({ok:false})
  // Header HMAC authenticates timestamp, not JSON. A per-session callback proof and
  // credentialed status lookup bind the payload to the token and actual provider job.
  // Persist only authenticated correlation before a transient provider lookup can fail.
  // This enables bounded status/replay recovery; it does not approve the identity.
  await mutateDurableJson<Store>(k,current=>{const j=current?.jobs.find(x=>x.id===reference);if(!j)throw fail('Unknown verification.',404);if(j.providerJobId&&j.providerJobId!==providerJobId||j.providerUserId&&j.providerUserId!==providerUserId)throw fail('Verification reference changed.',409);j.providerJobId=providerJobId;j.providerUserId=providerUserId;return current!})
  const authoritative=await smileV3Status(config,providerJobId)
  if(authoritative.job_id!==providerJobId||authoritative.user_id!==providerUserId||authoritative.status!==body.status)return res.status(409).json({ok:false})
  if(!['clear','block','attention','error'].includes(body.status))return res.status(409).json({ok:false})
  const fields=body.id_fields&&typeof body.id_fields==='object'?body.id_fields:{},identity=evidence(config,fields)
  const typeMatches=selected.method!=='government_id'||fields.country==='NG'&&jobPolicy(selected).idSelection.NG.includes(fields.id_type)
  const approved=body.status==='clear'&&typeMatches&&!!identity.identityMatch&&body.antifraud?.summary?.fraud_detected!==true
  await mutateDurableJson<Store>(k,current=>{const j=current?.jobs.find(x=>x.id===reference);if(!j)throw fail('Unknown verification.',404)
   if(j.providerJobId&&j.providerJobId!==providerJobId)throw fail('Verification reference changed.',409)
   if(['passed','failed'].includes(j.status)&&j.providerJobId)return current!
   j.providerJobId=providerJobId;j.providerUserId=providerUserId;j.providerStatus=body.status;j.checkedAt=Date.now();j.uploadReportedAt||=Date.now()
   const first=current!.jobs.find(x=>x.id===j.bvnJobId&&x.status==='passed'&&x.method==='bvn')
   const pairMatches=j.method==='bvn'||!!first?.identityMatch&&first.identityMatch===identity.identityMatch
   j.status=approved&&pairMatches?'passed':['block','error'].includes(body.status)?'failed':'review'
   if(approved){j.legalName=identity.legalName;j.identityMatch=identity.identityMatch}
   if(approved&&!pairMatches)j.failureReason='identity_mismatch'
   else if(body.status==='block')j.failureReason='provider_rejected'
   else if(body.status==='error')j.failureReason='provider_error'
   return current!
  });return res.json({ok:true})
 }catch(error){return res.status((error as {status?:number}).status||503).json({ok:false})}
}
