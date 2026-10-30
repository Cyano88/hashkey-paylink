import assert from 'node:assert/strict'
import {createDeveloperProjectsHandler,developerPolicyFromStore} from '../api/developer-projects.ts'
import {sealVerification,openVerification,inspectBusinessDocument,validateBusinessSubmission} from '../api/developer-verification.ts'
const secret='test-business-verification-secret-more-than-32-characters'
let identity={userId:'builder',email:'builder@example.test'},store,sequence=0
const projectId='dev_business12345678',ownerId='owner-12345678'
const env={OPERATIONS_FOUNDER_EMAILS:'admin@example.test',OPERATIONS_GRANTS_JSON:JSON.stringify([{email:'engineer@example.test',workspaceId:projectId,roles:['engineering']}])}
const documents=new Map()
const handler=createDeveloperProjectsHandler({hasStore:()=>true,read:async()=>store,mutate:async(_key,update)=>{store=update(store);return store},verify:async()=>identity,
 requireVerification:()=>true,operationsEnv:()=>env,portalSecret:()=>secret,now:()=>new Date('2026-10-27T12:00:00Z'),createProjectId:()=>projectId,createKeyId:()=>`key_${++sequence}`,createSecret:()=>`hpl_live_test_${sequence}`,
 validateWebhook:async()=>{},documents:{write:async(_p,d,bytes)=>documents.set(d.id,sealVerification(bytes.toString('base64'),secret)),read:async(_p,d)=>Buffer.from(openVerification(documents.get(d.id),secret),'base64'),remove:async(_p,id)=>{documents.delete(id)}}})
async function call(action,extra={},method='POST'){const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},status(code){this.statusCode=code;return this},json(body){this.body=body;return this},send(body){this.body=body;return this}};await handler({method,query:{workspace:projectId},headers:{},body:{action,projectId,...extra}},res);return res}
assert.equal((await call('create',{name:'Builder app',checkoutMode:'human',capabilities:['hosted_checkout']})).statusCode,201)
assert.equal(store.projects[projectId].businessVerification.required,true)
const project=store.projects[projectId];Object.assign(project,{settlementStatus:'ready',website:'https://example.test',useCase:'Example payment product',allowedOrigins:['https://example.test'],networks:['base'],defaultNetwork:'base',recipients:{base:'0x1111111111111111111111111111111111111111'}})
assert.equal((await call('create-key',{environment:'live'})).statusCode,201)
store.projects[projectId].capabilities=['polymarket_funding']
assert.equal((await call('create-key',{environment:'live'})).statusCode,409)
store.projects[projectId].capabilities=['hosted_checkout']
const application={companyName:'Example Ltd',tradingName:'Example',phone:'+2348000000000',website:'https://example.test',address:'Example street, Abuja',registrationNumber:'RC123456',country:'NG',description:'Software payment service',attested:true,owners:[{id:ownerId,fullName:'Example Owner',birthDate:'1990-01-01',address:'Example residential address',ownership:'100',pep:false,idType:'Passport',idNumber:'TEST-ID-123',issuingCountry:'NG',bvn:'',nin:'',controlPerson:true,director:true}]}
let saved=await call('verification-save',{application,revision:0});assert.equal(saved.statusCode,200)
assert.equal(JSON.stringify(store).includes('TEST-ID-123'),false)
assert.equal(JSON.parse(openVerification(store.projects[projectId].businessVerification.cipher,secret)).owners[0].director,true)
assert.equal((await call('verification-submit',{application,revision:1})).statusCode,400)
assert.equal((await call('verification-save',{application,revision:0})).statusCode,409)
let revision=1
for(const slot of ['incorporation','articles','business-address','owner-id:'+ownerId,'owner-address:'+ownerId]){const result=await call('verification-upload',{revision,slot,filename:'evidence.pdf',bytes:Buffer.from('%PDF-1.7\nsynthetic test')});assert.equal(result.statusCode,200,result.body?.error);revision=result.body.verification.revision}
for(const slot of ['incorporation','articles','business-address','owner-id:'+ownerId,'owner-address:'+ownerId])assert.throws(()=>validateBusinessSubmission(application,store.projects[projectId].businessVerification.documents.filter(d=>d.slot!==slot)),{status:400})
assert.ok(!store.projects[projectId].businessVerification.documents.some(d=>['aml','kyc'].includes(d.slot)))
assert.equal((await call('verification-submit',{application,revision})).statusCode,200);revision++
assert.equal((await call('verification-save',{application,revision})).statusCode,409)
const documentId=store.projects[projectId].businessVerification.documents[0].id
identity={userId:'stranger',email:'stranger@example.test'}
assert.equal((await call('verification-read')).statusCode,404)
assert.equal((await call('verification-download',{documentId})).statusCode,404)
identity={userId:'engineer',email:'engineer@example.test'}
assert.equal((await call('admin-verification-read')).statusCode,403)
identity={userId:'admin',email:'admin@example.test'}
assert.equal((await call('admin-verification-read')).statusCode,200)
const download=await call('admin-verification-download',{documentId});assert.equal(download.statusCode,200);assert.equal(download.headers['Content-Type'],'application/octet-stream')
assert.equal((await call('admin-verification-review',{revision,decision:'approved',checksComplete:true})).statusCode,400)
assert.equal((await call('admin-verification-review',{revision:revision-1,decision:'approved',checksComplete:true,smileReference:'SMARTCHECK-123'})).statusCode,409)
assert.equal((await call('admin-verification-review',{revision,decision:'approved',checksComplete:true,smileReference:'SMARTCHECK-123'})).statusCode,200);revision++
identity={userId:'builder',email:'builder@example.test'}
const key=await call('create-key',{environment:'live'});assert.equal(key.statusCode,201,key.body?.error)
assert.ok(developerPolicyFromStore(store,key.body.apiKey,secret))
identity={userId:'admin',email:'admin@example.test'}
assert.equal((await call('admin-verification-review',{revision,decision:'changes_requested',feedback:'Please provide updated address evidence.'})).statusCode,200)
assert.equal(developerPolicyFromStore(store,key.body.apiKey,secret),null)
assert.ok(store.projects[projectId].businessVerification.history.some(h=>h.action==='document_downloaded'))
assert.throws(()=>inspectBusinessDocument(Buffer.from('<svg/>'),'file.png','aml',new Date().toISOString()),{status:400})
assert.throws(()=>inspectBusinessDocument(Buffer.alloc(5*1024*1024+1),'file.pdf','aml',new Date().toISOString()),{status:400})
assert.throws(()=>validateBusinessSubmission({...application,owners:[{...application.owners[0],birthDate:'2020-01-01'}]},store.projects[projectId].businessVerification.documents),{status:400})
console.log('PASS encrypted storage, required evidence, revision locks, owner isolation, reviewer permissions, audited downloads, approval gating and reopening.')
