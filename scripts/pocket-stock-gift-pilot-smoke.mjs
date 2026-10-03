import assert from 'node:assert/strict'
import {stockGiftFundingAllowed,baseGiftFundingAllowed} from '../api/pocket/gifts/rollout.ts'
import {createGiftService} from '../api/pocket/gifts/service.ts'
const env={POCKET_STOCK_GIFT_PILOT_IDS:'shy'},pilot={userId:'pilot-user',handle:'shy'},other={userId:'other-user',handle:'other'}
assert.equal(stockGiftFundingAllowed(pilot,env),true)
for(const id of [undefined,other,{...pilot,userId:''},{...pilot,handle:'shy2'},{...pilot,handle:'shy,other'}])assert.equal(stockGiftFundingAllowed(id,env),false)
assert.equal(stockGiftFundingAllowed({...pilot,handle:'@SHY'},env),true)
assert.equal(stockGiftFundingAllowed(pilot,{}),false)
assert.equal(stockGiftFundingAllowed(other,{POCKET_STOCK_GIFT_PUBLIC_ENABLED:'true'}),true)
assert.equal(stockGiftFundingAllowed(undefined,{POCKET_STOCK_GIFT_PUBLIC_ENABLED:'true'}),false)
assert.equal(baseGiftFundingAllowed({network:'base',publicEnabled:true,identity:other,amount:'1'}),true)
let walletReads=0
const deps={store:{},deployment:()=>undefined,stockAssets:id=>stockGiftFundingAllowed(id,env)?[{symbol:'FIXTURE'}]:[],stockClaimEnabled:()=>true,fundingEnabled:(network,id)=>network==='xlayer'&&stockGiftFundingAllowed(id,env),wallet:async()=>{walletReads++;throw Error('Should not read a blocked wallet')}}
const service=createGiftService(deps)
assert.equal(service.configuration(pilot).stockAssets.length,1);assert.equal(service.configuration(other).stockAssets.length,0);assert.equal(service.configuration(other).stockClaimEnabled,true)
await assert.rejects(()=>service.create(other,{requestId:'00000000-0000-4000-8000-000000000000',network:'xlayer',amount:'1',claimSigner:'0x'+'1'.repeat(40)}),/funding is not available/)
assert.equal(walletReads,0)
console.log('PASS stock gift pilot: exact authenticated Pocket ID, hidden creation options, server-side funding denial, public-mode opt-in, independent claim availability and unchanged Base funding.')
