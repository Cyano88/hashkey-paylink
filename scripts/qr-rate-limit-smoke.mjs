import assert from 'node:assert/strict'
import {createQrRateLimit} from '../api/pocket/qr-rate-limit.ts'
let verifications=0,now=100000
const realNow=Date.now;Date.now=()=>now
const limiter=createQrRateLimit(async req=>{verifications++;const token=req.headers.authorization;if(token==='bad')throw Error('Invalid signature');return token?.split(':')[0]})
function request({owner='alice:token1',action='prepare',ip='restaurant-wifi',method='POST',...body}={}){
 return new Promise(resolve=>{const headers={};let status=200;const req={method,ip,socket:{remoteAddress:ip},headers:owner?{authorization:owner}:{},body:{action,...body}};const res={setHeader(k,v){headers[k]=v},status(s){status=s;return this},json(data){resolve({status,headers,data});return this}};limiter(req,res,()=>resolve({status,headers}))})
}
try{
 for(let i=0;i<20;i++)assert.equal((await request()).status,200)
 assert.equal((await request({owner:'alice:rotated-token'})).status,429,'Token rotation cannot reset an account bucket')
 assert.equal((await request({owner:'alice:token1',ip:'another-network'})).status,429,'IP changes cannot reset an account bucket')
 assert.equal((await request({owner:'bob:token'})).status,200,'Same restaurant Wi-Fi must not share the write quota')
 for(let i=0;i<120;i++)assert.equal((await request({action:'status'})).status,200)
 const denied=await request({action:'status'});assert.equal(denied.status,429);assert.equal(denied.headers['Retry-After'],'60')
 assert.equal((await request({owner:'bob:token',action:'prepare',userId:'alice'})).status,200,'Body identity cannot choose a bucket')
 assert.equal((await request({owner:'bad'})).status,401)
 assert.equal((await request({owner:null})).status,401)
 assert.equal((await request({owner:null,method:'GET'})).status,200)
 now+=60000;assert.equal((await request()).status,200,'Account window resets')
 const before=verifications
 for(let i=0;i<1199;i++)assert.equal((await request({owner:null,method:'GET'})).status,200)
 assert.equal((await request({owner:'fresh:token'})).status,429,'Broad IP cap applies even to new identities')
 assert.equal(verifications,before,'IP flood blocked before authentication work')
 console.log('PASS verified-user isolation on shared Wi-Fi, token/IP rotation resistance, separate reads, spoof rejection, public discovery, reset and pre-auth IP protection.')
}finally{Date.now=realNow}
