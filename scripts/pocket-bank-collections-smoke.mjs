import assert from 'node:assert/strict'
import {mkdtemp,writeFile,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
const root=await mkdtemp(join(tmpdir(),'pocket-bank-collections-'))
delete process.env.DATABASE_URL;delete process.env.RENDER;delete process.env.RENDER_SERVICE_ID;delete process.env.RENDER_EXTERNAL_URL
process.env.NG_POS_STORE=join(root,'pos.json')
const record=(id,owner,source)=>({merchant_id:id,owner_id:owner,source,display_name:'Community',created_at:'2026-09-30T00:00:00Z',updated_at:'2026-09-30T00:00:00Z',creation_response:{link:{payment_url:'https://pocket.hashpaylink.com/pay?src=bank-receive&merchant='+id+'&a=1&ngn=1500&intent=old_intent'}}})
try {
 await writeFile(process.env.NG_POS_STORE,JSON.stringify({merchants:{collection:record('collection','owner','bank-receive'),foreign:record('foreign','other','bank-receive'),payout:record('payout','owner','bank-withdraw'),terminal:record('terminal','owner','pos')}}))
 const {listPocketBankCollections}=await import('../api/ng-pos.ts')
 const links=await listPocketBankCollections('owner')
 assert.equal(links.length,1);assert.equal(links[0].eventId,'collection')
 const url=new URL(links[0].paymentUrl)
 assert.equal(url.searchParams.has('intent'),false,'Reusable collection must not reuse one payer intent')
 assert.equal(url.searchParams.get('ngn'),'1500');assert.equal(url.searchParams.get('merchant'),'collection')
 console.log('Bank collection scope and reusable fixed-amount links passed.')
} finally {await rm(root,{recursive:true,force:true})}
