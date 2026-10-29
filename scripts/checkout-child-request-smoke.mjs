import assert from 'node:assert/strict';
import {IncomingMessage} from 'node:http';
import {Socket} from 'node:net';
import {checkoutChildStatusRequest} from '../api/checkout-child-request.ts';
const req=new IncomingMessage(new Socket());req.headers={'x-api-key':'fixture-key'};req.method='GET';req.query={id:'chks_parent',purpose:'status'};
assert.equal({...req}.headers,undefined,'Reproduce Node inherited headers lost by spread');
const child=checkoutChildStatusRequest(req,'chkx_child');
assert.equal(child.headers['x-api-key'],'fixture-key');assert.equal(child.method,'GET');assert.equal(child.query.purpose,'status');assert.equal(child.query.id,'chkx_child');assert.equal(req.query.id,'chks_parent');
console.log('PASS child status keeps Node request credentials and purpose without mutating parent.');
