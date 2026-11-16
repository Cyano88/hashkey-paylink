import {build} from 'esbuild'
import {writeFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
globalThis.qrPayerFixture={cash:{owner:'payer',address:'0x'+'1'.repeat(40)},verified:{level:'basic',legalName:'VERIFIED LEGAL NAME'}}
const mocks={'checkout-cash.js':`export const checkoutCashPayer=async()=>qrPayerFixture.cash`,'kyc-level.js':`export const requirePocketBasicKyc=async()=>{if(qrPayerFixture.denied)throw Object.assign(Error('Basic required'),{code:'KYC_BASIC_REQUIRED'});return qrPayerFixture.verified}`}
const bundle=await build({entryPoints:['api/pocket/qr-checkout-payer.ts'],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'identity-provider-boundaries',setup(b){b.onResolve({filter:/.*/},a=>{const k=a.path.split('/').pop();return mocks[k]?{path:k,namespace:'fixture'}:undefined});b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path]}))}}]})
await writeFile('.codex-temp/qr-checkout-payer-fixture.mjs',bundle.outputFiles[0].text)
const {verifiedQrCheckoutPayer}=await import('../.codex-temp/qr-checkout-payer-fixture.mjs'),f=qrPayerFixture,req={body:{payer_name:'UNTRUSTED CLIENT NAME'}}
assert.equal(await verifiedQrCheckoutPayer(req,'payer',f.cash.address,f.cash.address),'VERIFIED LEGAL NAME')
f.verified.level='advanced';assert.equal(await verifiedQrCheckoutPayer(req,'payer',f.cash.address,''),'VERIFIED LEGAL NAME')
await assert.rejects(verifiedQrCheckoutPayer(req,'other',f.cash.address,''),/cash account/)
await assert.rejects(verifiedQrCheckoutPayer(req,'payer','0x'+'2'.repeat(40),''),/cash account/)
await assert.rejects(verifiedQrCheckoutPayer(req,'payer',f.cash.address,'0x'+'2'.repeat(40)),/cash account/)
f.denied=true;await assert.rejects(verifiedQrCheckoutPayer(req,'payer',f.cash.address,''),e=>e.code==='KYC_PURCHASE_REQUIRED');f.denied=false
f.verified={level:'basic',declaredName:'UNVERIFIED DECLARATION'};await assert.rejects(verifiedQrCheckoutPayer(req,'payer',f.cash.address,''),e=>e.code==='KYC_NAME_REQUIRED')
assert.equal(await verifiedQrCheckoutPayer(req,'payer',f.cash.address,'',true),'','Existing orders remain readable without creating a replacement')
delete globalThis.qrPayerFixture
console.log('PASS cash QR binds the online payment wallet, uses only verified legal name, rejects missing Basic/name and foreign wallets, and preserves existing-order reads. Identity provider mocked; no payment.')
