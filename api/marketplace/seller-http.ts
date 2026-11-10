import {sellerBankPresentation} from './seller-bank-presentation.js'
import {readDurableJson} from '../render-durable-store.js'
import type {MarketplaceStore} from './repository.js'
import {Router} from 'express'
import {verifiedPrivyUser} from '../privy-circle-link.js'
import {listPaycrestInstitutions} from '../paycrest-pos.js'
import {marketplaceSellerIdentity,marketplaceBankVerifier} from './seller-runtime.js'
import {createMarketplaceRepository} from './repository.js'
import {marketplaceFields} from './application.js'
export function createMarketplaceSellerRouter(){
 const router=Router()
 const bankDetails=(scope:{projectId:string;sellerId:string})=>sellerBankPresentation(scope,{read:()=>readDurableJson<MarketplaceStore>('hashpaylink:marketplace-accounting-foundation:v1'),decrypt:b=>marketplaceBankVerifier().decrypt(b),institutions:()=>listPaycrestInstitutions('NGN')})
 router.post('/session',async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer')
  if(process.env.MARKETPLACE_INSTRUCTIONS_ENABLED!=='true')return res.status(503).json({ok:false,error:'Marketplace seller verification is not active.'})
  try{
   const user=await verifiedPrivyUser(req),token=String(req.headers['x-seller-session']??''),identity=marketplaceSellerIdentity(),action=req.body?.action
   if(action==='inspect'||action==='connect'){const v=marketplaceFields(req.body,action==='connect'?['action','consent']:['action']);const data=action==='connect'?await identity.connect(token,user.userId,v.consent===true):await identity.inspect(token,user.userId);const bankAccounts=data.connected?await bankDetails(await identity.scope(token,user.userId)):[];return res.json({ok:true,data:{...data,bankAccounts}})}
   const scope=await identity.scope(token,user.userId)
   if(action==='banks'){marketplaceFields(req.body,['action']);return res.json({ok:true,data:await listPaycrestInstitutions('NGN')})}
   if(action==='bank'){
    const v=marketplaceFields(req.body,['action','beneficiaryId','bankCode','accountNumber'])
    if([v.beneficiaryId,v.bankCode,v.accountNumber].some(x=>typeof x!=='string'))throw Error('Invalid bank account details.')
    const verifier=marketplaceBankVerifier(),repository=createMarketplaceRepository({verifyBank:verifier.verify})
    const b=await repository.registerBank({...scope,beneficiaryId:v.beneficiaryId as string,bankCode:v.bankCode as string,accountNumber:v.accountNumber as string})
    const details=(await bankDetails(scope)).find(item=>item.beneficiaryId===b.beneficiaryId);if(!details)throw Error('Verified bank details unavailable.');return res.json({ok:true,data:details})
   }
   return res.status(400).json({ok:false,error:'Invalid seller action.'})
  }catch(error){const message=error instanceof Error?error.message:'';const safe=/^(Seller verification link has expired|Seller session|This seller|Consent is required|Seller identity replacement|Connect |Complete Nigerian Basic|Bank account name does not match|Use a resolved institution|Invalid bank account|Marketplace bank setup|Beneficiary version)/.test(message);return res.status(safe?400:503).json({ok:false,error:safe?message:'Seller setup could not be completed. Sign in again or retry shortly.'})}
 })
 return router
}
