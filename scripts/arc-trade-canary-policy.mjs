export const CANARY_ACTIONS={create:'seller',accept:'seller',approve:'buyer',fund:'buyer'}
export function assertCanaryIntent(body,record){
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!['role','action','termsHash','userToken'].includes(key))
  ||!Object.hasOwn(CANARY_ACTIONS,body.action)||CANARY_ACTIONS[body.action]!==body.role
  ||body.termsHash!==record.binding.termsHash||record.binding.contractTerms.amount!=='100000'
  ||record.binding.chainId!==5042||typeof body.userToken!=='string'||!body.userToken||body.userToken.length>8000)
  throw Object.assign(Error('Review the fixed 0.10 USDC terms using the correct participant.'),{status:403,publicMessage:'Review the fixed 0.10 USDC terms using the correct participant.'})
}
