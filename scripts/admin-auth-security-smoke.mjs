import assert from 'node:assert/strict';
import { adminBearerAuthorized, adminSecretConfigured } from '../api/admin-auth.ts';
import { requireAdminSecret } from '../api/security.ts';
import { createPocketBillsRefundHandler } from '../api/pocket/bills-refunds.ts';
const saved={ADMIN_SECRET:process.env.ADMIN_SECRET,CRON_SECRET:process.env.CRON_SECRET};
const admin='fixture-admin-secret-at-least-24',cron='fixture-retired-cron-at-least-24';
const request=(headers={},extra={})=>({method:'POST',headers,query:{},body:{},...extra});
function response(){return {code:200,status(n){this.code=n;return this},json(v){this.body=v;return this}}}
try{
 process.env.ADMIN_SECRET=admin;process.env.CRON_SECRET=cron;
 assert.equal(adminSecretConfigured(),true);
 assert.equal(adminBearerAuthorized(request({authorization:'Bearer '+admin})),true);
 for(const req of [request(),request({authorization:'Bearer '+cron}),request({}, {query:{secret:admin}}),request({}, {body:{secret:admin}}),request({authorization:'Bearer '+'é'.repeat(admin.length)})]){assert.equal(adminBearerAuthorized(req),false);const res=response();assert.equal(requireAdminSecret(req,res),false);assert.equal(res.code,401);}
 let res=response();assert.equal(requireAdminSecret(request({authorization:'Bearer '+admin}),res),true);
 const refund=createPocketBillsRefundHandler({});res=response();await refund(request({authorization:'Bearer '+admin}),res);assert.equal(res.code,400);assert.equal(res.body.code,'BILLS_REFUND_INTENT_REQUIRED');
 delete process.env.ADMIN_SECRET;assert.equal(adminSecretConfigured(),false);assert.equal(adminBearerAuthorized(request({authorization:'Bearer '+cron})),false);
 res=response();assert.equal(requireAdminSecret(request({authorization:'Bearer '+cron}),res),false);assert.equal(res.code,503);
 res=response();await refund(request({authorization:'Bearer '+cron}),res);assert.equal(res.code,503);
 process.env.ADMIN_SECRET='short';assert.equal(adminSecretConfigured(),false);
 console.log('PASS admin auth: explicit valid ADMIN_SECRET only; cron/query/body/Unicode mismatch reject; missing configuration fails closed; refund validation preserved.');
}finally{for(const[k,v]of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v}}
