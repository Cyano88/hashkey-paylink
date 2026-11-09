import {createCipheriv,createDecipheriv,createHmac,randomBytes} from 'node:crypto'
import {marketplaceReference} from './beneficiaries.js'
import {verifyPaycrestAccount} from '../paycrest-pos.js'

export type BankRequest={projectId:string;sellerId:string;beneficiaryId:string;bankCode:string;accountNumber:string}
export type BankDetails={bankCode:string;accountNumber:string;accountName:string}
export type BankBeneficiary={projectId:string;sellerId:string;beneficiaryId:string;kind:'bank';network:'base';asset:'USDC';currency:'NGN';status:'active'|'revoked';verifiedAt:number;ownershipEvidenceId:string;last4:string;destinationDigest:string;encryptedDetails:string;keyId:string}
type OwnershipEvidence={verified:true;projectId:string;sellerId:string;bankCode:string;accountNumber:string;evidenceId:string}
type Dependencies={key:Buffer;keyId:string;now?:()=>number;verifyAccount?:typeof verifyPaycrestAccount;verifyOwnership:(input:BankRequest&{accountName:string})=>Promise<OwnershipEvidence|null>}
const context=(b:Pick<BankBeneficiary,'projectId'|'sellerId'|'beneficiaryId'>)=>JSON.stringify(['marketplace-bank-v1',b.projectId,b.sellerId,b.beneficiaryId,'base','USDC','NGN'])
/** Internal adapter. Account lookup is not ownership verification; neither is caller-supplied identity. */
export function createMarketplaceBankVerifier(dependencies:Dependencies){
 if(!Buffer.isBuffer(dependencies.key)||dependencies.key.length!==32)throw Error('A dedicated 32-byte marketplace bank encryption key is required.')
 const key=Buffer.from(dependencies.key),keyId=marketplaceReference(dependencies.keyId)
 if(typeof dependencies.verifyOwnership!=='function')throw Error('A trusted seller bank ownership verifier is required.')
 const now=dependencies.now||Date.now,verifyAccount=dependencies.verifyAccount||verifyPaycrestAccount
 return {
  async verify(input:BankRequest):Promise<BankBeneficiary>{
   const request={projectId:marketplaceReference(input.projectId),sellerId:marketplaceReference(input.sellerId),beneficiaryId:marketplaceReference(input.beneficiaryId),bankCode:input.bankCode,accountNumber:input.accountNumber}
   if(typeof request.bankCode!=='string'||!/^[A-Z0-9_-]{2,40}$/.test(request.bankCode)||typeof request.accountNumber!=='string'||!/^\d{10}$/.test(request.accountNumber))throw Error('Use a resolved institution code and a 10-digit NGN account.')
   const accountName=await verifyAccount({institution:request.bankCode,accountIdentifier:request.accountNumber,currency:'NGN'})
   if(typeof accountName!=='string'||!accountName.trim()||accountName.trim().toUpperCase()==='OK')throw Error('Bank account name could not be verified.')
   const evidence=await dependencies.verifyOwnership({...request,accountName})
   if(!evidence||evidence.verified!==true||evidence.projectId!==request.projectId||evidence.sellerId!==request.sellerId||evidence.bankCode!==request.bankCode||evidence.accountNumber!==request.accountNumber)throw Error('Seller bank ownership could not be verified.')
   const ownershipEvidenceId=marketplaceReference(evidence.evidenceId)
   const details:BankDetails={bankCode:request.bankCode,accountNumber:request.accountNumber,accountName}
   const plaintext=JSON.stringify(details),aad=context(request),iv=randomBytes(12)
   const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(aad))
   const ciphertext=Buffer.concat([cipher.update(plaintext,'utf8'),cipher.final()])
   return {projectId:request.projectId,sellerId:request.sellerId,beneficiaryId:request.beneficiaryId,kind:'bank',network:'base',asset:'USDC',currency:'NGN',status:'active',verifiedAt:now(),ownershipEvidenceId,last4:request.accountNumber.slice(-4),destinationDigest:createHmac('sha256',key).update(aad).update(plaintext).digest('hex'),encryptedDetails:[iv,cipher.getAuthTag(),ciphertext].map(b=>b.toString('base64url')).join('.'),keyId}
  },
  decrypt(beneficiary:BankBeneficiary):BankDetails{
   if(beneficiary.keyId!==keyId)throw Error('Bank encryption key version is unavailable.')
   const parts=beneficiary.encryptedDetails.split('.')
   if(parts.length!==3)throw Error('Invalid encrypted bank details.')
   const [iv,tag,ciphertext]=parts.map(p=>Buffer.from(p,'base64url'))
   const decipher=createDecipheriv('aes-256-gcm',key,iv);decipher.setAAD(Buffer.from(context(beneficiary)));decipher.setAuthTag(tag)
   const plaintext=Buffer.concat([decipher.update(ciphertext),decipher.final()]).toString('utf8')
   if(createHmac('sha256',key).update(context(beneficiary)).update(plaintext).digest('hex')!==beneficiary.destinationDigest)throw Error('Bank destination binding is invalid.')
   return JSON.parse(plaintext) as BankDetails
  },
 }
}
