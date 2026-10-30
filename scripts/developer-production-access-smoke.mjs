import assert from 'node:assert/strict'
import {createDeveloperProjectsHandler,developerPolicyFromStore} from '../api/developer-projects.ts'
let store,sequence=0,kyc=false,bankCalls=0,kycCalls=0
const secret='sandbox-production-access-test-secret-over-32-characters'
const handler=createDeveloperProjectsHandler({hasStore:()=>true,portalSecret:()=>secret,read:async()=>store,mutate:async(_k,fn)=>{store=fn(store);return store},verify:async()=>({userId:'owner',email:'owner@example.test'}),requireVerification:()=>true,now:()=>new Date(),createProjectId:()=>`dev_access${++sequence}12345678`,createKeyId:()=>`key_${++sequence}`,createSecret:p=>p+'_'+(++sequence)+'test-key',validateWebhook:async()=>{},paycrestReady:()=>true,listBanks:async()=>[],verifyBank:async()=>{bankCalls++;return 'Example Owner'},requireLocalPayoutEligibility:async()=>{kycCalls++;if(!kyc)throw Object.assign(Error('Personal KYC required'),{status:403});return {level:'basic',country:'NG'}},adminEmails:()=>'',adminUserIds:()=>''})
async function call(body){const r={statusCode:200,setHeader(){},status(n){this.statusCode=n;return this},json(b){this.body=b;return this}};await handler({method:body.action==='configure'?'PUT':'POST',headers:{},query:{},body},r);return r}
const address='0x1111111111111111111111111111111111111111'
const configuration={action:'configure',name:'Example shop',website:'https://example.test',useCase:'Customers buy our handmade items online.',capabilities:['hosted_checkout'],networks:['base'],defaultNetwork:'base',allowedOrigins:['https://example.test'],webhookUrl:'',settlementMode:'ngn',refundAddress:address,bankCode:'OPAYNGPC',bankName:'OPay',bankAccountNumber:'0123456789',bankAccountName:'Example Owner'}
for(const accountType of ['individual','business']){
 const created=await call({action:'create',name:'Example app',checkoutMode:'human',accountType,capabilities:['hosted_checkout']});assert.equal(created.statusCode,201)
 const id=created.body.project.id;assert.equal(created.body.project.accountType,accountType)
 const denied=await call({...configuration,projectId:id});assert.equal(denied.statusCode,403);assert.equal(bankCalls,0)
 // A client cannot change legal entity type or forge its approval during setup.
 assert.equal((await call({...configuration,projectId:id,accountType:accountType==='individual'?'business':'individual',personalKycVerified:true,businessVerification:{status:'approved'}})).statusCode,403)
 if(accountType==='individual')kyc=true;else store.projects[id].businessVerification.status='approved'
 const ready=await call({...configuration,projectId:id});assert.equal(ready.statusCode,200,ready.body.error);assert.equal(ready.body.project.productionAccess,true)
 const key=await call({action:'create-key',projectId:id,environment:'live'});assert.equal(key.statusCode,201,key.body.error)
 assert.equal(developerPolicyFromStore(store,key.body.apiKey,secret).settlementMode,'ngn')
 if(accountType==='individual'){kyc=false;assert.equal((await call({action:'create-key',projectId:id,environment:'live'})).statusCode,403)}
 bankCalls=0
}
assert.ok(kycCalls>=4)
console.log('Production access: individual personal KYC, business KYB, client forgery rejection, account type immutability and pre-provider gate passed.')
