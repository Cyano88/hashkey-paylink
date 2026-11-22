import assert from 'node:assert/strict';
import {createPocketBillsCatalogHandler} from '../api/pocket/bills.ts';
import {readPocketDataCatalog} from '../src/pocket/api/pocketBillsClient.ts';
import {pocketBillLimits,withinPocketBillLimits,positiveBillLimit} from '../src/pocket/lib/pocketBillLimits.ts';
const handler=createPocketBillsCatalogHandler({config:{canVend:true,liveCategories:['airtime']},verifyUser:async()=>({userId:'fixture'}),store:{consumeMutationLimit:async()=>{}},requestId:()=> 'fixture',provider:{listAirtimeServices:async()=>[{serviceId:'airtel',name:'Airtel',minimumAmount:50,maximumAmount:50000}],listInternationalOperators:async country=>[{serviceId:`${country.toLowerCase()}-1`,name:`${country} provider`,minimumAmount:null,maximumAmount:null}],listInternationalVariations:async country=>[{variationCode:'1',name:'Flexible amount',fixedPrice:false,minimum:50,maximum:547645,currency:country==='KE'?'KES':'UGX',amountLocal:'0',amountNgn:'0'}]}});
async function catalog(query){const res={setHeader(){},status(n){this.statusCode=n;return this},json(body){this.body=body;return this}};await handler({method:'GET',headers:{},query},res);assert.equal(res.body.ok,true);return res.body}
const ng=await catalog({category:'airtime'});
const parsed=await readPocketDataCatalog({accessToken:'fixture',category:'airtime',fetcher:async()=>Response.json(ng)});
assert.deepEqual(pocketBillLimits(parsed.services[0]),{minimumAmount:50,maximumAmount:50000});
for (const [country,currency] of [['UG','UGX'],['KE','KES']]) {
 const catalogBody=await catalog({category:'airtime',country,service_id:`${country.toLowerCase()}-1`});
 const result=await readPocketDataCatalog({accessToken:'fixture',country,category:'airtime',serviceId:`${country.toLowerCase()}-1`,fetcher:async()=>Response.json(catalogBody)});
 assert.equal(result.variations[0].fixedPrice,false);assert.equal(result.variations[0].minimum,50);assert.equal(result.variations[0].maximum,547645);assert.equal(result.variations[0].currency,currency);
}
const meter=pocketBillLimits({minimumAmount:100,maximumAmount:1000000},{minimumAmount:2000,maximumAmount:5000});
assert.deepEqual(meter,{minimumAmount:2000,maximumAmount:5000});
for(const n of [0,1999.99,5000.01,NaN])assert.equal(withinPocketBillLimits(n,meter),false);
for(const n of [2000,5000])assert.equal(withinPocketBillLimits(n,meter),true);
for(const n of [null,undefined,'',NaN,Infinity,-1,0])assert.equal(positiveBillLimit(n),null);
assert.equal(withinPocketBillLimits(10,pocketBillLimits({minimumAmount:20,maximumAmount:5})),false);
console.log('PASS bill limits survive provider catalog to client; NGN, UGX and KES amounts and meter intersections use inclusive exact boundaries');
process.exit(0);
