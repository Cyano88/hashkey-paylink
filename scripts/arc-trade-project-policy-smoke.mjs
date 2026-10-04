import assert from 'node:assert/strict'
import {arcTradeProjectPolicyFromStore,developerGeneralProjectPolicyFromStore} from '../api/developer-projects.ts'
const id='dev_fixture12345',secret='synthetic-secret-longer-than-thirty-two-characters'
const project={id,name:'Fixture',checkoutMode:'human',settlementMode:'usdc',settlementStatus:'ready',operationalStatus:'active',capabilities:['arc_agreements'],arcMainnetChainId:5042,networks:['arc'],recipients:{arc:'0x'+'1'.repeat(40)},allowedOrigins:['https://example.invalid'],webhookUrl:'https://example.invalid/webhook',webhookSecretCipher:'fixture',keys:[{prefix:'hpl_app_fixture',scopes:['agreement:read','agreement:create'],environment:'live'}]}
const store={projects:{[id]:project}}
assert.equal(developerGeneralProjectPolicyFromStore(store,id,'live',secret),null)
assert.equal(arcTradeProjectPolicyFromStore(store,id,'live',secret).partnerId,id)
assert.equal(arcTradeProjectPolicyFromStore(store,id,'test',secret),null)
assert.equal(arcTradeProjectPolicyFromStore(store,'dev_missing123','live',secret),null)
for(const change of [{operationalStatus:'suspended'},{settlementStatus:'setup_required'},{checkoutMode:'agentic'},{settlementMode:'ngn'},{capabilities:[]},{arcMainnetChainId:5042002},{networks:[]},{recipients:{}},{webhookUrl:''},{webhookSecretCipher:''}])assert.equal(arcTradeProjectPolicyFromStore({projects:{[id]:{...project,...change}}},id,'live',secret),null)
assert.equal(arcTradeProjectPolicyFromStore(store,id,'live','short'),null)
console.log('PASS: scoped-only Arc project eligibility, live routing/webhook requirements, suspended/unready/foreign/agent rejection; general-key policy unchanged.')
