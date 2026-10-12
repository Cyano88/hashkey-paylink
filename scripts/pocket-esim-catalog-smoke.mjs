import assert from 'node:assert/strict'
import {createEsimCatalogProvider, normalizeEsimCatalog} from '../api/pocket/esim-provider.ts'
import {createPocketEsimCatalogHandler} from '../api/pocket/esim.ts'

const row={packageCode:'NG_1',name:'Nigeria 1GB',location:'NG',volume:1073741824,duration:7,durationUnit:'DAY',dataType:1,activeType:2,supportTopUpType:2,price:20000,retailPrice:50000,locationNetworkList:[{locationName:'Nigeria'}]}
const locations=[{code:'NG',name:'Nigeria'},{code:'EA',name:'East Africa',type:2,subLocationList:[{code:'UG'},{code:'KE'}]}]
const mapped=normalizeEsimCatalog([row,row,{...row,packageCode:'daily',dataType:2},null],locations)
assert.equal(mapped[0].plans.length,2)
assert.equal(mapped[0].plans[1].daily,true)
assert.equal(mapped[0].plans[1].data,'1 GB / day')
assert.equal(mapped[0].region,false)
assert.equal(mapped[0].plans[0].data,'1 GB')
assert.equal(mapped[0].plans[0].topUp,true)
assert.match(mapped[0].plans[0].activation,/first connects/)
assert.equal(JSON.stringify(mapped).includes('price'),false)
const regional=normalizeEsimCatalog([{...row,location:'KE,UG',supportTopUpType:1,activeType:1}],locations)[0]
assert.equal(regional.name,'East Africa');assert.equal(regional.region,true)
assert.equal(regional.plans[0].topUp,false);assert.match(regional.plans[0].activation,/install/)
const grouped=normalizeEsimCatalog([{...row,location:'KE,UG'},{...row,packageCode:'EA2',location:'KE,UG,TZ'}],[{code:'EA1',name:'East Africa (2 areas)',subLocationList:[{code:'KE'},{code:'UG'}]},{code:'EA2',name:'East Africa (3 areas)',subLocationList:[{code:'KE'},{code:'UG'},{code:'TZ'}]}])
assert.equal(grouped.length,1);assert.equal(grouped[0].name,'East Africa');assert.equal(grouped[0].plans.length,2)
assert.equal(grouped[0].plans[0].coverage.length,2);assert.equal(grouped[0].plans[1].coverage.length,3)
assert.deepEqual(normalizeEsimCatalog([{...row,volume:-1},{...row,durationUnit:'HOUR'}]),[])
let calls=[],now=0
const provider=createEsimCatalogProvider({accessCode:'fixture-code',now:()=>now,fetchImpl:async(url,init)=>{
  calls.push(url)
  assert.equal(init.headers['RT-AccessCode'],'fixture-code');assert.equal(init.redirect,'error')
  if(url.endsWith('/package/list'))assert.ok(['1','2'].includes(JSON.parse(init.body).dataType))
  return Response.json({success:true,obj:url.endsWith('/package/list')?{packageList:[row]}:{locationList:locations}})
}})
const [a,b]=await Promise.all([provider.catalog(),provider.catalog()])
assert.deepEqual(a,b);assert.equal(calls.length,3)
await provider.catalog();assert.equal(calls.length,3)
assert.ok(calls.every(url=>url.startsWith('https://api.esimaccess.com/api/v1/open/')))
now=3600001;await provider.catalog();assert.equal(calls.length,6)
for(const response of [()=>new Response('<html>connection closed</html>',{status:502}),()=>Response.json({success:false,errorMsg:'private secret'}),()=>Response.json({success:true,obj:{}})]){
  let failures=0
  const bad=createEsimCatalogProvider({accessCode:'secret',fetchImpl:async()=>{failures++;return response()}})
  await assert.rejects(bad.catalog(),/^Error: ESIM_PROVIDER_UNAVAILABLE$/)
  await assert.rejects(bad.catalog(),/^Error: ESIM_PROVIDER_UNAVAILABLE$/)
  assert.equal(failures,3)
}
function response(){return {code:200,body:null,setHeader(){},status(code){this.code=code;return this},json(body){this.body=body;return this}}}
const disabled=createEsimCatalogProvider({accessCode:''})
let res=response();await createPocketEsimCatalogHandler({verifyUser:async()=>({}),provider:disabled})({method:'GET'},res)
assert.deepEqual(res.body,{status:'coming_soon',purchaseEnabled:false,destinations:[]})
res=response();await createPocketEsimCatalogHandler({verifyUser:async()=>{throw Error('secret upstream message')},provider})({method:'GET'},res)
assert.equal(res.code,401);assert.equal(JSON.stringify(res.body).includes('secret'),false)
res=response();await createPocketEsimCatalogHandler({verifyUser:async()=>({}),provider})({method:'GET'},res)
assert.equal(res.body.purchaseEnabled,false);assert.equal(res.body.status,'available')
console.log('PASS eSIM Access auth, cache, failure cooldown, mapping, price redaction and purchase gate')
