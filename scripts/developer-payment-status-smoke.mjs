import assert from 'node:assert/strict'
import pg from 'pg'
import {paymentStatus} from '../api/developer-payment-status.ts'
import {paymentPageQuery} from '../api/developer-payments.ts'
const now=Date.parse('2026-10-27T12:00:00Z')
const group={recordId:'pmf_test123456',product:'funding',createdAt:'2026-10-25T12:00:00Z',updatedAt:'2026-10-25T12:00:00Z',events:[{event:'funding.created',occurredAt:'2026-10-25T12:00:00Z',details:{amount:'5',asset:'USDC',checkoutId:'chk_test123456'}}]}
const checkout={id:'chk_test123456',partnerId:'dev_paymenttest123',amount:'5',expiresAt:'2026-10-28T12:00:00Z',paymentAttempts:[]}
assert.equal(paymentStatus(group,checkout,undefined,now).status,'pending')
assert.equal(paymentStatus(group,{...checkout,expiresAt:'2026-10-26T12:00:00Z'},undefined,now).status,'expired')
assert.equal(paymentStatus(group,undefined,undefined,now).status,'unknown')
assert.equal(paymentStatus(group,{...checkout,payment:{status:'paid',referenceType:'evm_tx_hash'}},undefined,now).status,'processing')
assert.equal(paymentStatus(group,checkout,{checkoutId:checkout.id,amount:'5',expiresAt:checkout.expiresAt,observation:{status:'funded'}},now).status,'paid')
assert.equal(paymentStatus({...group,product:'checkout'},{...checkout,payment:{status:'paid',referenceType:'circle_gateway_transfer'}},undefined,now).status,'processing')
assert.equal(paymentStatus({...group,product:'checkout'},{...checkout,payment:{status:'paid',referenceType:'evm_tx_hash'}},undefined,now).status,'paid')
assert.equal(paymentStatus({...group,product:'checkout'},{...checkout,paymentAttempts:[{status:'failed'}]},undefined,now).status,'pending','An abandoned attempt without a transaction is not a failed payment')
assert.equal(paymentStatus(group,{...checkout,expiresAt:'2026-10-26T12:00:00Z',paymentAttempts:[{status:'processing'}]},undefined,now).status,'processing','Expiry cannot hide an in-flight payment')
assert.throws(()=>paymentPageQuery({projectId:'dev_paymenttest123',cursor:'bad'}),{status:400})
console.log('PASS evidence-based statuses, expiry, in-flight protection, cancellation and cursor validation.')
if(process.env.TEST_ACTIVITY_DATABASE_URL){
 const url=new URL(process.env.TEST_ACTIVITY_DATABASE_URL)
 if(url.hostname!=='127.0.0.1'||url.port!=='55439'||url.pathname!=='/activity_test'||url.username!=='activity_app')throw Error('Refusing non-disposable database.')
 const pool=new pg.Pool({connectionString:url.toString(),max:1}),client=await pool.connect()
 try{await client.query('begin');await client.query('create temporary table developer_activity_events(sequence bigserial,project_id text,environment text,record_id text,product text,event text,occurred_at timestamptz,details jsonb) on commit drop')
 const insert=async(id,product,date,details={},project='dev_paymenttest123')=>client.query("insert into developer_activity_events(project_id,environment,record_id,product,event,occurred_at,details) values($1,'live',$2,$3,$4,$5,$6)",[project,id,product,product+'.created',date,details])
 await insert('pmf_newest','funding','2026-10-26T12:00:00Z',{checkoutId:'chk_linked',amount:'5'})
 await insert('chk_linked','checkout','2026-10-26T12:00:00Z',{requestId:'pmf_newest'})
 await insert('chk_oldest','checkout','2026-07-01T12:00:00Z')
 await insert('chk_middle','checkout','2026-10-01T12:00:00Z')
 await insert('chk_foreign','checkout','2026-10-27T12:00:00Z',{},'dev_foreign123456')
 let q=paymentPageQuery({projectId:'dev_paymenttest123',limit:1}),rows=(await client.query(q.text,q.values)).rows
 assert.deepEqual(rows.map(r=>r.recordId),['pmf_newest','chk_middle'])
 const cursor=Buffer.from(JSON.stringify({time:new Date(rows[0].createdAt).toISOString(),id:rows[0].recordId})).toString('base64url')
 q=paymentPageQuery({projectId:'dev_paymenttest123',limit:10,cursor});rows=(await client.query(q.text,q.values)).rows
 assert.deepEqual(rows.map(r=>r.recordId),['chk_middle','chk_oldest'])
 q=paymentPageQuery({projectId:'dev_paymenttest123',recordId:'chk_linked'});rows=(await client.query(q.text,q.values)).rows
 assert.deepEqual(rows.map(r=>r.recordId),['pmf_newest'])
 console.log('PASS PostgreSQL chronological pagination, funding deduplication, linked-reference search and project isolation.')
 }finally{await client.query('rollback');client.release();await pool.end()}
}
