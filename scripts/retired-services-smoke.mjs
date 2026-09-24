import assert from 'node:assert/strict';
for(const file of ['x402-polymarket-scout','stream-recipient-invite','relay-v2']) {
  const {default:handler}=await import(`../api/${file}.ts`);
  const original=globalThis.fetch;globalThis.fetch=()=>{throw Error('Retired service attempted network access')};
  try {let status,body;await handler({method:'POST',body:{}},{status(n){status=n;return this},json(value){body=value;return this}});assert.equal(status,410);assert.equal(body.ok,false);}finally{globalThis.fetch=original;}
}
console.log('Retired Scout, stream invitations and factory relay reject without network calls.');
