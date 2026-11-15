// Explicit markers distinguish new NIN-first records from historical BVN-first jobs.
export const NIN_FIRST_POLICY = 'ng-nin-first-v1'
export function isBasicKycJob(j:any) {
 if(j.country==='UG')return ['government_id','national_id'].includes(j.method)
 return j.tierPolicy===NIN_FIRST_POLICY ? j.tier==='basic'&&j.method==='nin' : !j.tierPolicy&&j.method==='bvn'
}
export function basicKycJob(jobs:any[]) {
 return jobs.find(j=>isBasicKycJob(j)&&j.status==='passed'&&j.identityMatch)
}
export function advancedBasicJob(j:any,jobs:any[]) {
 if(j.country==='UG')return undefined
 if(j.tierPolicy===NIN_FIRST_POLICY){
  if(j.tier!=='advanced'||j.method!=='bvn')return undefined
  return jobs.find(b=>b.id===j.basicJobId&&b.tierPolicy===NIN_FIRST_POLICY&&isBasicKycJob(b)&&b.status==='passed'&&b.environment===j.environment&&b.identityMatch)
 }
 if(j.tierPolicy||!['nin','government_id'].includes(j.method))return undefined
 return jobs.find(b=>b.id===j.bvnJobId&&!b.tierPolicy&&b.method==='bvn'&&b.status==='passed'&&b.environment===j.environment&&b.identityMatch)
}
export function advancedKycJob(jobs:any[]) {
 return jobs.find(j=>j.status==='passed'&&j.identityMatch&&advancedBasicJob(j,jobs)?.identityMatch===j.identityMatch)
}
