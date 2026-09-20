import assert from 'node:assert/strict'
import {mkdtempSync,writeFileSync,readFileSync,unlinkSync,rmdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const directory=mkdtempSync(join(tmpdir(),'pocket-scan-route-'))
for(const key of ['DATABASE_URL','POSTGRES_URL','RENDER','RENDER_SERVICE_ID','RENDER_EXTERNAL_URL'])delete process.env[key]
process.env.NG_POS_STORE=join(directory,'merchants.json')
const merchant={merchant_id:'pos_fixture',owner_id:'synthetic-owner',display_name:'Verified Shop',payout_preference:'KEEP_CRYPTO',settlement_enabled:true,source:'pos',kyc_status:'UNVERIFIED',circle_smart_wallet_address:'0x'+'1'.repeat(40),supported_networks:['base','arbitrum'],created_at:new Date().toISOString(),updated_at:new Date().toISOString()}
writeFileSync(process.env.NG_POS_STORE,JSON.stringify({merchants:{pos_fixture:merchant},intents:{},bank_send_links:{}}))
const before=readFileSync(process.env.NG_POS_STORE,'utf8');const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Unexpected external request')}
const warn=console.warn;console.warn=(...args)=>{if(!/durable load failed/.test(String(args[0])))warn(...args)}
try{
 const {default:handler}=await import('../api/ng-pos.ts')
 const request=async code=>{const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},status(c){this.statusCode=c;return this},json(body){this.body=body;return this}};await handler({method:'GET',query:{view:'pocket-scan',merchant_id:'pos_fixture',code},headers:{}},res);return res}
 const response=await request('https://app.hashpaylink.com/pay?src=ngpos&merchant=pos_fixture&n=arbitrum&a=2&m=Fake&e=0x'+'2'.repeat(40))
 assert.equal(response.statusCode,200);assert.equal(response.headers['Cache-Control'],'no-store');const params=new URL(response.body.paymentUrl,'https://app.hashpaylink.com').searchParams
 assert.equal(params.get('m'),'Verified Shop');assert.equal(params.get('e'),merchant.circle_smart_wallet_address);assert.equal(params.get('a'),'2');assert.equal(params.get('n'),'arbitrum');assert.equal(response.body.owner_id,undefined)
 assert.equal((await request('https://evil.invalid/pay?src=ngpos&merchant=pos_fixture')).statusCode,400)
 assert.equal(readFileSync(process.env.NG_POS_STORE,'utf8'),before)
 console.log('PASS: Scan GET route returns authoritative merchant details, rejects hostile URLs, does not expose ownership or mutate the store.')
}finally{globalThis.fetch=originalFetch;console.warn=warn;unlinkSync(process.env.NG_POS_STORE);rmdirSync(directory)}
