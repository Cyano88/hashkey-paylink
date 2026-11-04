import assert from 'node:assert/strict'
import retired from '../api/pocket/marketplace.ts'
for(const method of ['GET','POST','PUT','DELETE']){let status,payload;const res={setHeader(){},status(n){status=n;return this},json(v){payload=v;return this}};await retired({method,body:{resource:'https://example.com',amount:'1'}},res);assert.equal(status,410);assert.equal(payload.code,'FEATURE_RETIRED')}
console.log('PASS retired marketplace rejects old-client requests without wallet, provider, or journal access.')
