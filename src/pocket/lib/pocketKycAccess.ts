export type PocketKycPromptDetail={code:string;remainingNgn?:number;dailyLimitNgn?:number}
export function notifyPocketKycRequirement(data:any) {
 if(typeof data?.code!=='string'||!['KYC_BASIC_REQUIRED','KYC_ADVANCED_REQUIRED','KYC_DAILY_LIMIT'].includes(data.code))return false
 window.dispatchEvent(new CustomEvent('pocket:kyc-required',{detail:{code:data.code,remainingNgn:data.remainingNgn,dailyLimitNgn:data.dailyLimitNgn}}))
 return true
}
