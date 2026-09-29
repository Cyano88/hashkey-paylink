// Reject identity-bearing payloads before any upload or onchain write.
const privateKey=/^(?:bvn|nin|idnumber|idfields|userdetails|userprovidedinfo|firstname|lastname|fullname|resolvedname|legalname|declaredname|email|phonenumber|dateofbirth|dob|selfie|selfieimage|liveness|livenessimages|biometric|kyc|kycreference|providerjobid|callbackproof|identitymatch|customer)$/i
export function containsPrivateIdentity(value:unknown,depth=0):boolean {
 if(depth>30)return true
 if(!value||typeof value!=='object')return false
 return Object.entries(value).some(([key,item])=>privateKey.test(key.replace(/[_ -]/g,''))||containsPrivateIdentity(item,depth+1))
}
