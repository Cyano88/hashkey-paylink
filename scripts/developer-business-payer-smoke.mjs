import assert from 'node:assert/strict'
import {sealVerification,normalizeBusinessApplication} from '../api/developer-verification.ts'
import {mapPaycrestBusinessPayer} from '../api/developer-business-payer.ts'
const secret='fixture-business-payer-secret-more-than-32-characters',now=new Date('2026-10-30T12:00:00Z')
const person={id:'person-12345678',fullName:'Fixture Director',birthDate:'1990-01-01',address:'Fixture address',ownership:'0',pep:false,idType:'Passport',idNumber:'FIXTURE-ID',issuingCountry:'NG',bvn:'12345678901',nin:'',controlPerson:false,director:true}
const owner={...person,id:'person-87654321',fullName:'Fixture Owner',ownership:'100',controlPerson:true,director:false,bvn:'',nin:''}
const application={companyName:'Fixture Limited',tradingName:'Fixture',phone:'+2348000000000',website:'https://example.test',address:'Fixture office',registrationNumber:'RC-FIXTURE',country:'NG',description:'Fixture business activity',attested:true,owners:[person,owner]}
const slots=['incorporation','articles','business-address','aml','kyc',...application.owners.flatMap(o=>['owner-id:'+o.id,'owner-address:'+o.id])]
const record=a=>({status:'approved',revision:4,required:true,reviewedAt:now.toISOString(),documents:slots.map(slot=>({slot})),cipher:sealVerification(JSON.stringify(a),secret),history:[{action:'approved',revision:4,smileReference:'SMARTCHECK-FIXTURE',actor:'reviewer',at:now.toISOString()}]})
const project={id:'project-fixture',ownerId:'owner-fixture',operationalStatus:'active',businessVerification:record(application)}
const input={actorId:'owner-fixture',projectId:project.id,verificationRevision:4,purpose:'business-own-funding',currency:'NGN'}
const map=(p=project,i=input)=>mapPaycrestBusinessPayer(p,i,secret,now)
const result=map();assert.equal(result.sourceKyc.entityType,'organization');assert.equal(result.sourceKyc.organizationDetails.directors.length,1)
assert.equal(result.sourceKyc.organizationDetails.directors[0].personDetails.idDocument.type,'BVN')
assert.equal(result.sourceKyc.organizationDetails.legalName,'Fixture Limited')
assert.equal(JSON.stringify(result).includes('pep'),false);assert.equal(JSON.stringify(result).includes('Fixture Owner'),false)
for(const patch of [{actorId:'other'},{projectId:'other'},{verificationRevision:3},{currency:'KES'},{purpose:'customer-checkout'}])assert.throws(()=>map(project,{...input,...patch}))
for(const status of ['draft','submitted','changes_requested','rejected'])assert.throws(()=>map({...project,businessVerification:{...project.businessVerification,status}}))
assert.throws(()=>map({...project,operationalStatus:'suspended'}))
assert.throws(()=>map({...project,businessVerification:{...project.businessVerification,history:[]}}))
for(const changes of [{director:false},{director:undefined},{bvn:'',nin:''},{birthDate:'2010-01-01'}])assert.throws(()=>map({...project,businessVerification:record({...application,owners:[{...person,...changes},owner]})}))
const nin=map({...project,businessVerification:record({...application,owners:[{...person,bvn:'',nin:'10987654321'},owner]})})
assert.equal(nin.sourceKyc.organizationDetails.directors[0].personDetails.idDocument.type,'nationalID')
assert.equal(normalizeBusinessApplication({...application,owners:[{...person,director:'true'},owner]}).owners[0].director,false)
assert.equal(normalizeBusinessApplication({...application,owners:[{...person,director:undefined},owner]}).owners[0].director,false)
console.log('PASS business-only payer mapping, approved revision/reviewer binding, owner isolation, explicit directors, zero-share directors, NGN BVN/NIN, adult checks, old-record rejection and minimal payload; no provider calls.')
