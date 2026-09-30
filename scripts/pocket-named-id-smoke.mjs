import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createLocalCurrencyProfileRepository} from '../api/local-currency-profile.ts'
import {createPocketRequestsHandler} from '../api/pocket/requests.ts'
import {isPocketId} from '../src/pocket/lib/pocketId.ts'
import {savePocketLocalCurrencyProfile,readPocketLocalCurrencyProfile} from '../src/pocket/api/pocketReadClient.ts'
const root=await mkdtemp(join(tmpdir(),'pocket-named-id-'))
try{
 let next=12345678
 const repo=createLocalCurrencyProfileRepository({storePath:join(root,'profiles.json'),durable:false,isRender:false,generatePocketNumber:()=>String(next++)})
 const a={userId:'fixture-a',email:'a@fixture.test'},b={userId:'fixture-b',email:'b@fixture.test'}
 const original=(await repo.ensure(a)).profile;await repo.ensure(b)
 const named=(await repo.updateProfile(a.userId,'Emmanuel',1)).profile
 assert.equal(named.pocketId,'emmanuel');assert.equal((await repo.getByPocketId('EMMANUEL')).privyUserId,a.userId)
 assert.equal((await repo.getByPocketId(original.pocketNumber)).privyUserId,a.userId)
 await assert.rejects(repo.updateProfile(b.userId,'EMMANUEL',1),/already|unavailable|taken/i)
 await repo.updateProfile(a.userId,'emmanuel2',1)
 assert.equal((await repo.getByPocketId('Emmanuel')).privyUserId,a.userId,'old alias stays reserved')
 for(const id of ['abc','Emmanuel2','123456','123456789012'])assert.equal(isPocketId(id),true)
 for(const id of ['ab','12345','a b','a.b','?lice','a'.repeat(21)])assert.equal(isPocketId(id),false)
 const handler=createPocketRequestsHandler({verifyUser:async()=>b,profiles:repo,repository:{},readWallet:async()=>({circleWalletAddress:'0x'+'1'.repeat(40)})})
 const resolveId=async id=>{const res={code:200,status(code){this.code=code;return this},json(body){this.body=body;return this}};await handler({method:'POST',body:{action:'resolve-recipient',pocketId:id,network:'base'}},res);return res}
 assert.equal((await resolveId('EMMANUEL')).body.recipient.pocketId,'emmanuel2')
 assert.equal((await resolveId(original.pocketNumber)).body.recipient.pocketId,'emmanuel2')
 assert.equal((await resolveId((await repo.get(b.userId)).pocketNumber)).code,400,'Self-send is rejected through permanent aliases too')
 const profile={...named,updatedAt:new Date().toISOString()};let writes=0,reads=0
 const fetcher=async(_url,init)=>{if(init.method==='POST'){writes++;throw new Error('Software caused connection abort')}reads++;return new Response(JSON.stringify({ok:true,email:a.email,profile}))}
 const recovered=await savePocketLocalCurrencyProfile({accessToken:'fixture',pocketId:'EMMANUEL',avatarId:1,fetcher})
 assert.equal(recovered.profile.pocketId,'emmanuel');assert.equal(writes,1);assert.equal(reads,1)
 await assert.rejects(savePocketLocalCurrencyProfile({accessToken:'fixture',pocketId:'anothername',fetcher}),/could not confirm/)
 assert.equal(writes,2,'one POST per save; never blindly replay a failed write')
 let attempts=0
 await readPocketLocalCurrencyProfile({accessToken:'fixture',fetcher:async()=>{if(!attempts++)throw new Error('Software caused connection abort');return new Response(JSON.stringify({ok:true,email:a.email,profile}))}})
 assert.equal(attempts,2)
 console.log('PASS named IDs, case-insensitive uniqueness, reserved aliases, input boundaries, interrupted-save readback and bounded GET retry.')
}finally{await rm(root,{recursive:true,force:true})}
