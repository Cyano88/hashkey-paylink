import assert from 'node:assert/strict';
import {privateKeyToAccount} from 'viem/accounts';
import {keccak256} from 'viem';
import {validateSignedStockTransaction} from '../src/lib/xstocksAgreement/transactionRecovery.ts';
const account=privateKeyToAccount('0x'+'11'.repeat(32)); // Synthetic test-only key.
const to='0x'+'22'.repeat(20),data='0x7d94ad98';
const transaction={account:account.address,to,data,chainId:196,value:'0'};
const sign=overrides=>account.signTransaction({chainId:196,to,data,value:0n,nonce:7,gas:50000n,gasPrice:1000000000n,...overrides});
const serialized=await sign({}),record={transaction,serialized,hash:keccak256(serialized)};
assert.equal((await validateSignedStockTransaction(record)).nonce,7);
for(const overrides of [{chainId:1},{to:'0x'+'33'.repeat(20)},{data:'0x12345678'},{value:1n}]){
 const raw=await sign(overrides);
 await assert.rejects(()=>validateSignedStockTransaction({...record,serialized:raw,hash:keccak256(raw)}),/does not match/);
}
await assert.rejects(()=>validateSignedStockTransaction({...record,transaction:{...transaction,account:to}}),/does not match/);
await assert.rejects(()=>validateSignedStockTransaction({...record,hash:'0x'+'00'.repeat(32)}),/could not be verified/);
await assert.rejects(()=>validateSignedStockTransaction({transaction}),/could not be verified/);
assert.equal(keccak256(JSON.parse(JSON.stringify(record)).serialized),record.hash,'Reload retains the identical signed transaction hash');
console.log('Signed recovery checks passed: sender, chain, recipient, calldata, value, hash and reload identity.');
