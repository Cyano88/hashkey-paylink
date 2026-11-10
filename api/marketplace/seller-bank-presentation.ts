import type {MarketplaceStore} from './repository.js'
import type {BankBeneficiary,BankDetails} from './bank-beneficiaries.js'
/** Seller-private presentation. Caller must authenticate and claim the session scope. */
export async function sellerBankPresentation(scope:{projectId:string;sellerId:string},d:{read:()=>Promise<MarketplaceStore|undefined>;decrypt:(b:BankBeneficiary)=>BankDetails;institutions:()=>Promise<Array<{code:string;name:string}>>}){
 const records=((await d.read())?.bankBeneficiaries??[]).filter(b=>b.projectId===scope.projectId&&b.sellerId===scope.sellerId&&b.status==='active').sort((a,b)=>b.verifiedAt-a.verifiedAt)
 if(!records.length)return []
 const institutions=await d.institutions().catch(()=>[])
 return records.map(b=>{const details=d.decrypt(b);return {beneficiaryId:b.beneficiaryId,accountName:details.accountName,bankName:institutions.find(i=>i.code===details.bankCode)?.name??null,bankCode:details.bankCode,last4:b.last4,status:b.status}})
}
