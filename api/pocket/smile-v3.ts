import {createHmac, timingSafeEqual} from 'node:crypto'
import {type SmileConfig} from './smile-provider.js'
export const v3Failure = (message:string,status=503) => Object.assign(new Error(message),{status})
const host=(c:SmileConfig)=>c.environment==='production'?'https://api.smileidentity.com':'https://testapi.smileidentity.com'
async function json(response:Response){const data=await response.json().catch(()=>null);if(!response.ok){if(response.status===402)throw v3Failure('Identity verification is unavailable while the service wallet is being funded.',402);throw v3Failure('Identity verification could not connect. Please try again.')}if(!data||typeof data!=='object')throw v3Failure('Invalid verification response.');return data}
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
