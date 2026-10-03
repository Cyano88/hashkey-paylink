import assert from 'node:assert/strict';
import {createArcReviewerHandler} from '../api/trade-agreement/reviewer.ts';
import {authorizeOperations} from '../api/operations-policy.ts';
const env={OPERATIONS_FOUNDER_EMAILS:'founder@example.invalid',OPERATIONS_WORKSPACES_JSON:JSON.stringify([{id:'stream',name:'Stream',projectIds:['dev_stream12345']}]),OPERATIONS_GRANTS_JSON:JSON.stringify([{email:'reviewer@example.invalid',workspaceId:'stream',sections:['trade-disputes']}])};
let email='reviewer@example.invalid',calls=0,foreign=false;
const id='tag_'+'12'.repeat(32);
const handler=createArcReviewerHandler({verifyAdmin:async()=>({userId:'fixture',email}),scope:(who,req,section,project)=>authorizeOperations(who,req,section,project,env),hasStore:()=>true,list:async(projectIds,filter,cursor)=>{calls++;assert.deepEqual(projectIds,['dev_stream12345']);assert.equal(filter,'disputed');assert.equal(cursor,'');return {items:[{id,projectId:foreign?'dev_foreign1234':'dev_stream12345',title:'Trade',state:5,observedBlock:'10'}],nextCursor:null}},read:async()=>{throw Error('Listing must not read evidence')},client:()=>{throw Error('Listing must not call chain')},mutate:async()=>{throw Error('Listing must not mutate')}});
async function call(body={action:'list'},workspace='stream') {const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.statusCode=n;return this},json(body){this.body=body;return this}};await handler({method:'POST',query:{workspace},body},res);return res}
let res=await call();assert.equal(res.statusCode,200);assert.equal(res.headers['Cache-Control'],'no-store');assert.equal(res.body.items[0].id,id);assert.equal(calls,1);
email='outsider@example.invalid';assert.equal((await call()).statusCode,403);assert.equal(calls,1);
email='reviewer@example.invalid';assert.equal((await call(undefined,'dev_foreign1234')).statusCode,403);assert.equal(calls,1);
for(const body of [{action:'list',filter:'anything'},{action:'list',cursor:'bad'},{action:'list',cursor:['bad']}])assert.equal((await call(body)).statusCode,400);
assert.equal(calls,1);foreign=true;res=await call();assert.equal(res.statusCode,503);assert.equal(res.body.items,undefined);
console.log('PASS: scoped Trade listing, denied access before storage, input validation, no chain calls or mutations, foreign rows fail closed.');
