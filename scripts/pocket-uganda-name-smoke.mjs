import assert from 'node:assert/strict'
import {createPocketBankVerifyHandler} from '../api/pocket/bank-receive-verify.ts'
import {verifyBankPayoutBeneficiary,assertBankAccountMatchesPocketName} from '../api/pocket/verified-bank-name.ts'
import {parsePocketBankVerification} from '../src/pocket/api/pocketBankClient.ts'
const result={account_name:'',bank_code:'AIRTUGPC',name_required:true}
const identity={userId:'fixture',email:'fixture@example.com'}
let binds=0
const dependencies={verifyUser:async()=>identity,verifyAccount:async()=>result,profiles:{get:async()=>({nameStatus:'bank_resolved',resolvedName:'Fixture Owner'})},repository:{bindBankResolvedName:async()=>{binds++}}}
const handler=createPocketBankVerifyHandler(dependencies)
const body={currency:'UGX',bank_code:'AIRTUGPC',bank_name:'Airtel Money',account_number:'0752123456'}
async function call(body){const r={statusCode:200,status(v){this.statusCode=v;return this},json(v){this.body=v;return this}};await handler({method:'POST',body},r);return r}
const response=await call(body)
assert.equal(response.statusCode,200)
assert.deepEqual(parsePocketBankVerification(response.body),result)
assert.equal((await call({...body,confirm_profile_name:true})).statusCode,400)
assert.equal(binds,0)
await assert.rejects(verifyBankPayoutBeneficiary({},body,dependencies),/recipient name/)
await assert.rejects(verifyBankPayoutBeneficiary({},{...body,account_name:'OK'},dependencies),/recipient name/)
await verifyBankPayoutBeneficiary({},{...body,account_name:'Fixture Recipient'},dependencies)
await assert.rejects(assertBankAccountMatchesPocketName({},{...body,account_name:'Fixture Owner'},dependencies),/does not verify account ownership/)
assert.throws(()=>parsePocketBankVerification({ok:true,...result,bank_code:'OPAYNGPC'}),/invalid/)
assert.throws(()=>parsePocketBankVerification({ok:true,...result,account_name:'Pretend verified'}),/invalid/)
console.log('PASS Uganda provider-valid name entry, profile ownership protection, empty/sentinel name rejection and schema boundaries.')
