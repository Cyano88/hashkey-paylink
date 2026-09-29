import {smileSignature,smileRequest,type SmileConfig} from './smile-provider.js'
import {v3Failure} from './smile-v3.js'

export function ugandaBasicInput(value:any) {
 const idNumber=typeof value?.idNumber==='string'?value.idNumber.trim().toUpperCase():''
 const cardNumber=typeof value?.cardNumber==='string'?value.cardNumber.trim():''
 const dob=typeof value?.dob==='string'?value.dob:''
 if(!/^[A-Z0-9]{14}$/.test(idNumber))throw v3Failure('Enter your 14-character National ID number.',400)
 if(!/^[A-Za-z0-9-]{1,40}$/.test(cardNumber))throw v3Failure('Enter the card number printed on your ID.',400)
 if(!/^\d{4}-\d{2}-\d{2}$/.test(dob)||!Number.isFinite(Date.parse(dob))||new Date(dob).toISOString().slice(0,10)!==dob||Date.parse(dob)>Date.now())throw v3Failure('Enter a valid date of birth.',400)
 return {idNumber,cardNumber,dob}
}
export async function submitUgandaBasic(config:SmileConfig,input:ReturnType<typeof ugandaBasicInput>,binding:{jobId:string;userId:string;callbackUrl:string}) {
 const timestamp=new Date().toISOString()
 const response=await fetch((config.environment==='production'?'https://api.smileidentity.com':'https://testapi.smileidentity.com')+'/v2/verify_async',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source_sdk:'rest_api',source_sdk_version:'pocket-ug-basic-1',partner_id:config.partnerId,timestamp,signature:smileSignature(config,timestamp),country:'UG',id_type:'NATIONAL_ID_NO_PHOTO',id_number:input.idNumber,secondary_id_number:input.cardNumber,dob:input.dob,callback_url:binding.callbackUrl,partner_params:{job_id:binding.jobId,user_id:binding.userId,job_type:5}}),signal:AbortSignal.timeout(15000)})
 const data=await response.json().catch(()=>null)
 // An ambiguous submission stays pending; never automatically charge for a second job.
 if(!response.ok||data?.success!==true)throw v3Failure('We could not confirm submission. Check verification status before trying again.',503,'KYC_SUBMISSION_UNCERTAIN',false)
}
export async function ugandaBasicResult(config:SmileConfig,jobId:string,userId:string){
 const data=await smileRequest(config,'job_status',{job_id:jobId,user_id:userId,history:false,image_links:false})
 if(data.job_complete!==true)return null
 const result=data.result,params=result?.PartnerParams
 if(params?.job_id!==jobId||params?.user_id!==userId||String(params?.job_type)!=='5')throw v3Failure('Verification reference did not match.',502)
 const actions=result.Actions||{},code=String(result.ResultCode||'')
 const passed=data.job_success===true&&code==='1020'&&actions.Verify_ID_Number==='Verified'&&actions.DOB==='Exact Match'&&actions.Secondary_ID_Number==='Exact Match'
 const failed=['1013','1014','1022'].includes(code)
 return {status:passed?'passed':failed?'failed':'review',resultCode:code,providerJobId:String(result.SmileJobID||''),failureReason:passed?undefined:code==='1021'?'uganda_partial_match':failed?'provider_rejected':'provider_review'} as const
}
