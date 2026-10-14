import assert from 'node:assert/strict'
import {priceEsim} from '../api/pocket/esim-pricing.ts'
import {createEsimOrderService,publicEsimIntent} from '../api/pocket/esim-orders.ts'
import {createEsimOrderProvider} from '../api/pocket/esim-orders-provider.ts'
import {createPocketEsimPriceHandler} from '../api/pocket/esim.ts'
const fixed={currencyCode:'USD',price:20000,retailPrice:50000,dataType:1,duration:7,durationUnit:'DAY'}
const priced=priceEsim(fixed,7)
assert.deepEqual(priced.public,{subtotal:'5',platformFee:'0.0125',total:'5.0125',currency:'USD',days:7})
assert.equal(priceEsim({...fixed,dataType:2},3).supplierAmount,60000)
assert.equal(priceEsim({...fixed,dataType:2},3).public.subtotal,'15')
assert.equal(priceEsim(fixed,7,{mode:'markup',markupBps:2000}).public.subtotal,'2.4')
for(const row of [{...fixed,currencyCode:'EUR'},{...fixed,price:NaN},{...fixed,retailPrice:0},{...fixed,retailPrice:10000},{...fixed,dataType:3}])assert.throws(()=>priceEsim(row,7))
for(const days of [0,366,1.5,1])assert.throws(()=>priceEsim(fixed,days))
let stored,queue=Promise.resolve(),time=1000000,ids=0,balance=100000,orders=0,verifications=0,enabled=true,timeout=false,verifyFailure=false
const storage={ready:()=>true,read:async()=>structuredClone(stored),mutate:async(key,fn)=>{const run=queue.then(()=>{stored=structuredClone(fn(structuredClone(stored)));return structuredClone(stored)});queue=run.catch(()=>{});return run}}
const payer='0x1111111111111111111111111111111111111111',treasury='0x2222222222222222222222222222222222222222'
const supplier={order:async x=>{orders++;assert.equal(x.transactionId.startsWith('esim_'),true);if(timeout)throw Error('timeout');return 'order-1'},profiles:async()=>[{iccid:'12345',activationCode:'LPA:1$example.invalid$secret-install-code',status:'NEW',totalVolume:1000,usedVolume:0,expiresAt:''}]}
const catalog={price:async(p,days)=>({...priced,public:{...priced.public,days},daily:false,packageCode:p}),balance:async()=>balance}
const service=createEsimOrderService({catalog,supplier,storage,treasury,encryptionKey:'ab'.repeat(32),purchaseEnabled:()=>enabled,readPayer:async()=>payer,now:()=>time,uuid:()=>String(++ids),verifyTransfer:async input=>{verifications++;assert.equal(input.exactAmount,true);assert.equal(input.token,'USDT');assert.equal(input.minAmount,'5.0125');assert.equal(input.payer,payer);assert.equal(input.recipient,treasury);if(verifyFailure)throw Error('not verified');return {ok:true,amountUnits:'5012500',amount:'5.0125',confirmedAt:new Date(time).toISOString()}}})
const input={ownerId:'owner',requestKey:'unique-request-key-01',packageCode:'NG_1',days:7,asset:'USDT'}
const [a,b]=await Promise.all([service.quote(input),service.quote(input)]);assert.equal(a.id,b.id);assert.equal(orders,0)
await assert.rejects(service.quote({...input,asset:'USDC'}),/IDEMPOTENCY/)
await assert.rejects(service.get('stranger',a.id),/NOT_FOUND/)
assert.equal(JSON.stringify(publicEsimIntent(a)).includes('supplier'),false)
assert.equal(JSON.stringify(publicEsimIntent(a)).includes(payer),false)
balance=0;await assert.rejects(service.prepare('owner',a.id),/STOCK/);assert.equal(orders,0)
balance=20000;await service.prepare('owner',a.id)
const c=await service.quote({...input,requestKey:'unique-request-key-02'});await assert.rejects(service.prepare('owner',c.id),/PAYMENT_IN_PROGRESS/)
const reserved=await service.quote({...input,ownerId:'second-owner',requestKey:'unique-request-key-02'});await assert.rejects(service.prepare('second-owner',reserved.id),/STOCK/)
const tx='0x'+'1'.repeat(64)
verifyFailure=true;await assert.rejects(service.confirm('owner',a.id,tx),/not verified/);assert.equal(orders,0);verifyFailure=false
await Promise.all([service.confirm('owner',a.id,tx),service.confirm('owner',a.id,tx)]);assert.equal(orders,1)
await service.confirm('owner',a.id,tx);assert.equal(orders,1)
await assert.rejects(service.confirm('owner',a.id,'0x'+'2'.repeat(64)),/CONFLICT/)
await service.prepare('owner',c.id);await assert.rejects(service.confirm('owner',c.id,tx),/ALREADY_USED/)
await service.reconcile('owner',a.id);assert.equal((await service.get('owner',a.id)).state,'ready')
assert.equal(JSON.stringify(stored).includes('secret-install-code'),false)
assert.equal((await service.installation('owner',a.id)).iccid,'12345')
await assert.rejects(service.installation('stranger',a.id),/NOT_FOUND/)
const originalProfiles=supplier.profiles
supplier.profiles=async()=>[{...(await originalProfiles())[0],apn:'plus',smdpStatus:'INSTALLATION',status:'IN_USE'}]
assert.equal((await service.installation('owner',a.id)).apn,'plus')
assert.equal((await service.installation('owner',a.id)).status,'IN_USE')
supplier.profiles=async()=>[{...(await originalProfiles())[0],iccid:'different-profile',apn:'wrong'}]
assert.equal((await service.installation('owner',a.id)).apn,'plus','Never apply another profile settings')
supplier.profiles=async()=>{throw Error('provider unavailable')}
assert.equal((await service.installation('owner',a.id)).apn,'plus','Encrypted fallback survives provider outage')
supplier.profiles=originalProfiles
timeout=true;const otherTx='0x'+'3'.repeat(64);await service.confirm('owner',c.id,otherTx);assert.equal((await service.get('owner',c.id)).state,'order_unknown');const attempts=orders
await service.reconcile('owner',c.id);assert.equal(orders,attempts)
time+=60001;timeout=false;await service.reconcile('owner',c.id);assert.equal(orders,attempts+1);assert.equal((await service.get('owner',c.id)).state,'ready')
const d=await service.quote({...input,requestKey:'unique-request-key-03'});time+=300001;await assert.rejects(service.prepare('owner',d.id),/EXPIRED/)
enabled=false;await assert.rejects(service.quote({...input,requestKey:'unique-request-key-04'}),/DISABLED/)
let sent
const transport=createEsimOrderProvider({accessCode:'fixture',fetchImpl:async(url,opts)=>{assert.equal(opts.headers['RT-AccessCode'],'fixture');sent=JSON.parse(opts.body);return Response.json({success:true,obj:{orderNo:'provider-order',transactionId:sent.transactionId}})}})
await transport.order({transactionId:'esim_fixed_id',packageCode:'P',days:3,daily:true,supplierUnitPrice:20000,supplierAmount:60000});assert.deepEqual(sent,{transactionId:'esim_fixed_id',amount:60000,packageInfoList:[{packageCode:'P',count:1,price:20000,periodNum:3}]})
const res=()=>({code:200,body:null,setHeader(){},status(x){this.code=x;return this},json(x){this.body=x;return this}})
let response=res();await createPocketEsimPriceHandler({verifyUser:async()=>({}),provider:catalog})({method:'POST',body:{packageCode:'NG_1',days:7}},response);assert.equal(response.code,200);assert.equal(response.body.purchaseEnabled,false);assert.equal(JSON.stringify(response.body).includes('supplier'),false)
response=res();await createPocketEsimPriceHandler({verifyUser:async()=>{throw Error('secret')},provider:catalog})({method:'POST',body:{}},response);assert.equal(response.code,401)
console.log('PASS eSIM integer pricing, daily duration, auth, price redaction, purchase gate, reserves, concurrent idempotency, exact asset verification, payment replay protection, timeout recovery, expiry and encrypted owner-scoped installation.')
