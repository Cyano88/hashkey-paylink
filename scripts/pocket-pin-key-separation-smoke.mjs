import assert from 'node:assert/strict'
import {createPocketPaymentSecurityHandler} from '../api/pocket/payment-security.ts'
const saved=Object.fromEntries(['POCKET_PIN_PEPPER','PRIVY_APP_SECRET','NODE_ENV'].map(k=>[k,process.env[k]]))
const handler=createPocketPaymentSecurityHandler({verifyUser:async()=>({userId:'rotation-synthetic-owner',email:'rotation@example.invalid'}),now:()=>Date.now(),random:size=>Buffer.alloc(size,19)})
async function call(body){let status=200,result;await handler({method:'POST',headers:{},body},{setHeader(){},status(s){status=s;return this},json(v){result=v;return this}});return {status,result}}
try{
 process.env.NODE_ENV='production';delete process.env.POCKET_PIN_PEPPER;process.env.PRIVY_APP_SECRET='synthetic-old-provider-secret-not-real-123456'
 assert.equal((await call({action:'setup',pin:'123456'})).status,503,'Privy must not substitute for missing production pepper')
 process.env.POCKET_PIN_PEPPER=process.env.PRIVY_APP_SECRET
 assert.equal((await call({action:'setup',pin:'123456'})).status,200)
 process.env.POCKET_PIN_PEPPER=process.env.PRIVY_APP_SECRET
 process.env.PRIVY_APP_SECRET='synthetic-new-provider-secret-not-real-654321'
 assert.equal((await call({action:'verify',pin:'123456'})).status,200,'Preserved dedicated pepper must verify pre-rotation PIN')
 assert.equal((await call({action:'verify',pin:'654321'})).status,401)
 console.log('PASS PIN key separation: existing PIN survives provider-secret change with preserved dedicated pepper; incorrect PIN rejected.')
}finally{for(const[k,v]of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v}}
