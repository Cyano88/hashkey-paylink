import {readDurableJson,mutateDurableJson} from '../render-durable-store.js'
import {readPocketKycLevel} from '../pocket/kyc-level.js'
import {createMarketplaceExecutionAuthority} from './authorization.js'
import {createMarketplaceSellerIdentity,type SellerIdentityStore} from './seller-identity.js'
import {createMarketplaceBankVerifier} from './bank-beneficiaries.js'
const key='hashpaylink:marketplace-seller-identities:v1'
export function marketplaceSellerIdentity(){return createMarketplaceSellerIdentity({read:()=>readDurableJson<SellerIdentityStore>(key),mutate:fn=>mutateDurableJson<SellerIdentityStore>(key,s=>fn(s??{sessions:[],links:[]})),now:Date.now,kyc:readPocketKycLevel,authorize:createMarketplaceExecutionAuthority(),project:async id=>{const s=await readDurableJson<{projects:Record<string,{name:string;allowedOrigins:string[]}>}>((process.env.DEVELOPER_PROJECT_STORE_KEY??'hashpaylink:developer-projects:v1').trim());const p=s?.projects[id];if(!p)throw Error('Marketplace project not found.');return {name:p.name,allowedOrigins:p.allowedOrigins??[]}}})}
export function marketplaceBankVerifier(env:NodeJS.ProcessEnv=process.env){
 const raw=env.MARKETPLACE_BANK_ENCRYPTION_KEY?.trim()??''
 if(!/^[0-9a-f]{64}$/i.test(raw))throw Error('Marketplace bank setup is not enabled.')
 return createMarketplaceBankVerifier({key:Buffer.from(raw,'hex'),keyId:env.MARKETPLACE_BANK_ENCRYPTION_KEY_ID||'marketplace-bank-v1',verifyOwnership:r=>marketplaceSellerIdentity().verifyBank(r)})
}
