import {createHmac, timingSafeEqual} from 'node:crypto'
import {type SmileConfig} from './smile-provider.js'
export const v3Failure = (message:string,status=503,code?:string,retryable=status>=500||status===429) => Object.assign(new Error(message),{status,code,retryable})
const host=(c:SmileConfig)=>c.environment==='production'?'https://api.smileidentity.com':'https://testapi.smileidentity.com'
async function json(response:Response){
 const data=await response.json().catch(()=>null)
 if(!response.ok){
  if(response.status===402)throw v3Failure('Identity verification is unavailable. Please contact Pocket support.',503,'KYC_FUNDING_REQUIRED',false)
  if(response.status===403)throw v3Failure('This verification is not available yet. Please contact Pocket support.',503,'KYC_NOT_PERMITTED',false)
  if(response.status===401)throw v3Failure('Identity verification is unavailable. Please contact Pocket support.',503,'KYC_PROVIDER_AUTH',false)
  throw v3Failure('Identity verification could not connect. Please try again.',503,'KYC_PROVIDER_UNAVAILABLE',response.status>=500||response.status===429)
 }
 if(!data||typeof data!=='object')throw v3Failure('Invalid verification response.')
 return data
}
export async function smileV3Token(config:SmileConfig, binding?:{product:string;reference:string;callbackUrl:string;country:string;idType?:string}){
 const form=new FormData()
 if(binding){form.set('product',binding.product);form.set('partner_params',JSON.stringify({internal_reference:binding.reference}));form.set('payload',JSON.stringify({country:binding.country,...binding.idType?{id_type:binding.idType}:{},callback_url:binding.callbackUrl}))}
 const response=await fetch(host(config)+'/v3/token',{method:'POST',headers:{'SmileID-API-Key':config.apiKey,'SmileID-Partner-ID':config.partnerId,Accept:'application/json'},body:form,signal:AbortSignal.timeout(15000)})
 const data=await json(response);if(typeof data.token!=='string'||!data.token)throw v3Failure('Invalid verification session.');return data.token as string
}
export async function smileV3Status(config:SmileConfig,jobId:string){
 if(!/^job_[0-9a-hjkmnp-tv-z]{26}$/.test(jobId))throw v3Failure('Invalid provider reference.',400)
 const token=await smileV3Token(config)
 const response=await fetch(host(config)+'/v3/status/'+encodeURIComponent(jobId),{headers:{'SmileID-Token':token,'SmileID-Partner-ID':config.partnerId,Accept:'application/json'},signal:AbortSignal.timeout(15000)})
 if(response.status===404)return{status:'not_found',job_id:jobId}
 return json(response)
}
export function validV3Signature(config:SmileConfig,headers:Record<string,unknown>){
 const timestamp=headers['response-timestamp'],signature=headers['response-signature']
 if(typeof timestamp!=='string'||typeof signature!=='string'||!Number.isFinite(Date.parse(timestamp))||Math.abs(Date.now()-Date.parse(timestamp))>86400000)return false
 const expected=createHmac('sha256',config.apiKey).update(timestamp).update(config.partnerId).update('sid_request').digest()
 const actual=Buffer.from(signature,'base64');return actual.length===expected.length&&timingSafeEqual(actual,expected)
}

// Use only the callback URL already stored by Smile. A browser hint cannot select
// a callback destination or approve a job; it can only request authenticated replay.
export async function smileV3Replay(config:SmileConfig,jobId:string){
 if(!/^job_[0-9a-hjkmnp-tv-z]{26}$/.test(jobId))throw v3Failure('Invalid provider reference.',400)
 const token=await smileV3Token(config)
 const response=await fetch(host(config)+'/v3/replay/'+encodeURIComponent(jobId),{method:'POST',headers:{'SmileID-Token':token,'SmileID-Partner-ID':config.partnerId,Accept:'application/json'},signal:AbortSignal.timeout(15000)})
 return json(response)
}
export async function assertSmileV3Policy(config:SmileConfig,policy:{product:string;idSelection:{NG:string[]}}):Promise<string[]>{
 const token=await smileV3Token(config)
 const [response,documents]=await Promise.all([
  fetch(host(config)+'/v3/services/config',{headers:{'SmileID-Token':token,'SmileID-Partner-ID':config.partnerId,'SmileID-Source-SDK':'hosted_web','SmileID-Source-SDK-Version':'12.0.4',Accept:'application/json'},signal:AbortSignal.timeout(15000)}).then(json),
  policy.product==='doc_verification'?fetch(host(config)+'/v3/services/supported_documents?country_code=NG',{headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)}).then(json):Promise.resolve(null),
 ])
 const allowed=response.idSelection?.[policy.product]?.NG
 const documentTypes=documents?.valid_documents?.find((item:{country?:{code?:string}})=>item.country?.code==='NG')?.id_types?.map((item:{code?:string})=>item.code)
 const selected=policy.idSelection.NG.filter(id=>Array.isArray(allowed)&&allowed.includes(id)&&(!documents||Array.isArray(documentTypes)&&documentTypes.includes(id)))
 if(!selected.length||policy.product!=='doc_verification'&&selected.length!==policy.idSelection.NG.length)throw v3Failure('This verification is not available yet. Please contact Pocket support.',503,'KYC_METHOD_UNAVAILABLE',false)
 return selected
}
export function smileIdentityMatchKey(config:SmileConfig){
 const key=process.env.POCKET_KYC_IDENTITY_MATCH_KEY?.trim()
 if(key)return key
 if(config.environment==='sandbox')return config.apiKey
 throw v3Failure('Identity verification is not available yet. Please contact Pocket support.',503,'KYC_MATCH_KEY_REQUIRED',false)
}
