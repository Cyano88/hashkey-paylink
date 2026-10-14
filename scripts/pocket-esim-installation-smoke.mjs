import assert from 'node:assert/strict'
import { esimInstallUrl, esimAlreadyInstalled } from '../src/pocket/lib/pocketEsimInstallation.ts'
import { createEsimOrderProvider } from '../api/pocket/esim-orders-provider.ts'
const code='LPA:1$example.invalid$token+with&special#characters'
for(const platform of ['android','ios']){
 const url=new URL(esimInstallUrl(code,platform))
 assert.equal(url.searchParams.get('carddata'),code)
 assert.equal(url.searchParams.size,1)
 assert.equal(url.hostname,platform==='android'?'esimsetup.android.com':'esimsetup.apple.com')
}
assert.equal(esimInstallUrl(code,'web'),null)
assert.equal(esimInstallUrl('https://untrusted.invalid','android'),null)
assert.equal(esimAlreadyInstalled({status:'NEW'}),false)
assert.equal(esimAlreadyInstalled({status:'IN_USE'}),true)
assert.equal(esimAlreadyInstalled({smdpStatus:'INSTALLATION'}),true)
const provider=createEsimOrderProvider({accessCode:'fixture',fetchImpl:async()=>Response.json({success:true,obj:{esimList:[{orderNo:'own',apn:' plus ',smdpStatus:'INSTALLATION',esimStatus:'IN_USE'},{orderNo:'other',apn:'wrong'}]}})})
const profiles=await provider.profiles('own')
assert.equal(profiles.length,1)
assert.equal(profiles[0].apn,'plus')
assert.equal(profiles[0].smdpStatus,'INSTALLATION')
console.log('PASS install-link encoding, fixed destinations, installed states and order-scoped provider settings.')
